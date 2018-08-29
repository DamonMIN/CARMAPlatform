/*
 * Copyright (C) 2018 LEIDOS.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */

package gov.dot.fhwa.saxton.carma.guidance;

import gov.dot.fhwa.saxton.carma.guidance.arbitrator.Arbitrator;
import gov.dot.fhwa.saxton.carma.guidance.conflictdetector.ConflictManager;
import gov.dot.fhwa.saxton.carma.guidance.conflictdetector.IMobilityTimeProvider;
import gov.dot.fhwa.saxton.carma.guidance.conflictdetector.SystemUTCTimeProvider;
import gov.dot.fhwa.saxton.carma.guidance.lightbar.LightBarManager;
import gov.dot.fhwa.saxton.carma.guidance.maneuvers.ManeuverInputs;
import gov.dot.fhwa.saxton.carma.guidance.mobilityrouter.MobilityRouter;
import gov.dot.fhwa.saxton.carma.guidance.plugins.PluginManager;
import cav_srvs.GetSystemVersion;
import cav_srvs.GetSystemVersionRequest;
import cav_srvs.GetSystemVersionResponse;
import gov.dot.fhwa.saxton.carma.guidance.pubsub.*;
import gov.dot.fhwa.saxton.carma.guidance.trajectory.TrajectoryExecutor;
import gov.dot.fhwa.saxton.carma.guidance.util.GuidanceRouteService;
import gov.dot.fhwa.saxton.carma.guidance.util.GuidanceV2IService;
import gov.dot.fhwa.saxton.carma.guidance.util.ILogger;
import gov.dot.fhwa.saxton.carma.guidance.util.ITimeProvider;
import gov.dot.fhwa.saxton.carma.guidance.util.LoggerManager;
import gov.dot.fhwa.saxton.carma.guidance.util.ROSTimeProvider;
import gov.dot.fhwa.saxton.carma.guidance.util.SaxtonLoggerProxyFactory;
import gov.dot.fhwa.saxton.carma.guidance.util.V2IService;
import gov.dot.fhwa.saxton.carma.guidance.util.trajectoryconverter.TrajectoryConverter;
import gov.dot.fhwa.saxton.carma.rosutils.AlertSeverity;
import gov.dot.fhwa.saxton.carma.rosutils.SaxtonBaseNode;
import gov.dot.fhwa.saxton.carma.route.Route;
import gov.dot.fhwa.saxton.utils.ComponentVersion;

import org.apache.commons.logging.Log;
import org.ros.exception.ServiceException;
import org.ros.message.MessageFactory;
import org.ros.namespace.GraphName;
import org.ros.node.ConnectedNode;
import org.ros.node.NodeConfiguration;
import org.ros.node.parameter.ParameterTree;
import org.ros.node.service.ServiceResponseBuilder;
import org.ros.node.service.ServiceServer;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * The top-level Guidance package is responsible for providing basic facilities needed by all elements of
 * the Guidance package. It forms the Guidance ROS node.
 * <p>
 * Command line test: rosrun carma guidance gov.dot.fhwa.saxton.carma.guidance.GuidanceMain
 * rosservice call /plugins/getRegisteredPlugins
 * rosservice call /plugins/getActivePlugins
 * rosservice call /plugins/getAvailablePlugins
 * rosservice call /plugins/activatePlugin '{header: auto, pluginName: DUMMY PLUGIN A, pluginVersion: v2.0.0, activated: True}'
 */
public class GuidanceMain extends SaxtonBaseNode {

  // Member Variables
  protected ExecutorService executor;
  protected final int NUMTHREADS = 10;
  protected static ComponentVersion version = CarmaVersion.getVersion();

  protected IPubSubService pubSubService;

  protected ConflictManager conflictManager;

  protected TrajectoryConverter trajectoryConverter;

  protected GuidanceExceptionHandler exceptionHandler;

  protected final AtomicBoolean engaged = new AtomicBoolean(false);
  protected final AtomicBoolean systemReady = new AtomicBoolean(false);
  protected boolean initialized = false;

  ServiceServer<GetSystemVersionRequest, GetSystemVersionResponse> systemVersionServer;
  protected final NodeConfiguration nodeConfiguration = NodeConfiguration.newPrivate();
  protected final MessageFactory messageFactory = nodeConfiguration.getTopicMessageFactory();

  @Override
  public GraphName getDefaultNodeName() {
    return GraphName.of("guidance_main");
  }

  /**
   * Initialize the runnable thread members of the Guidance package.
   */
  private void initExecutor(GuidanceStateMachine stateMachine, ConnectedNode node) {
    executor = Executors.newFixedThreadPool(NUMTHREADS);

    // Init the Guidance component

    GuidanceRouteService routeService = new GuidanceRouteService(pubSubService);
    routeService.init();


    int commsReliabilityCheckThreshold = node.getParameterTree().getInteger("~v2i_comms_reliability_check_threshold", 5);
    double commsReliabilityPct =  node.getParameterTree().getDouble("~v2i_comms_reliability_percent", 0.75);
    double commsReliabilityExpectedV2IMsgsPerSec = node.getParameterTree().getDouble("~v2i_comms_expected_msgs_per_sec", 1.1);
    long expiryTimeoutMs = node.getParameterTree().getInteger("~v2i_comms_data_expiry_timeout", 1000);
    GuidanceV2IService v2iService = new GuidanceV2IService(pubSubService, commsReliabilityCheckThreshold, commsReliabilityPct, commsReliabilityExpectedV2IMsgsPerSec, expiryTimeoutMs);
    v2iService.init();

    routeService.registerNewRouteCallback((route) -> trajectoryConverter.setRoute(Route.fromMessage(route)));
    routeService.registerNewRouteCallback((route) -> conflictManager.setRoute(Route.fromMessage(route)));
    routeService.registerNewRouteStateCallback((state) -> trajectoryConverter.setRouteState(state.getDownTrack(),
        state.getCrossTrack(), state.getCurrentSegment().getPrevWaypoint().getWaypointId(), state.getSegmentDownTrack(),
        state.getLaneIndex()));

    GuidanceStateHandler stateHandler = new GuidanceStateHandler(stateMachine, pubSubService, node);
    ManeuverInputs maneuverInputs = new ManeuverInputs(stateMachine, pubSubService, node);
    GuidanceCommands guidanceCommands = new GuidanceCommands(stateMachine, pubSubService, node, maneuverInputs);
    Tracking tracking = new Tracking(stateMachine, pubSubService, node);

    TrajectoryExecutor trajectoryExecutor = new TrajectoryExecutor(stateMachine, pubSubService, node, guidanceCommands,
        tracking, trajectoryConverter);
    LightBarManager lightBarManager = new LightBarManager(stateMachine, pubSubService, node);
    VehicleAwareness vehicleAwareness = new VehicleAwareness(stateMachine, pubSubService, node, trajectoryConverter, conflictManager, tracking);
    MobilityRouter router = new MobilityRouter(stateMachine, pubSubService, node, conflictManager, trajectoryConverter, vehicleAwareness, trajectoryExecutor, tracking);
    ITimeProvider timeProvider = new ROSTimeProvider(node);
    PluginManager pluginManager = new PluginManager(stateMachine, pubSubService, guidanceCommands, maneuverInputs,
        routeService, node, router, conflictManager, trajectoryConverter, lightBarManager, tracking, v2iService, timeProvider);
    Arbitrator arbitrator = new Arbitrator(stateMachine, pubSubService, node, pluginManager, trajectoryExecutor, vehicleAwareness);

    tracking.setTrajectoryExecutor(trajectoryExecutor);
    tracking.setArbitrator(arbitrator);
    trajectoryExecutor.setArbitrator(arbitrator);
    pluginManager.setArbitratorService(arbitrator);
    router.setPluginManager(pluginManager);
    router.setArbitrator(arbitrator);
    vehicleAwareness.setPluginManager(pluginManager);
    vehicleAwareness.setTrajectoryExecutor(trajectoryExecutor);

    executor.execute(stateHandler);
    executor.execute(maneuverInputs);
    executor.execute(arbitrator);
    executor.execute(pluginManager);
    executor.execute(trajectoryExecutor);
    executor.execute(tracking);
    executor.execute(guidanceCommands);
    executor.execute(router);
    executor.execute(lightBarManager);
    executor.execute(vehicleAwareness);
  }

  /**
   * Initialize the PubSubManager and setup it's message queue.
   */
  private void initPubSubManager(ConnectedNode node, GuidanceExceptionHandler guidanceExceptionHandler) {
    ISubscriptionChannelFactory subscriptionChannelFactory = new RosSubscriptionChannelFactory(node,
        guidanceExceptionHandler);
    IPublicationChannelFactory publicationChannelFactory = new RosPublicationChannelFactory(node);
    IServiceChannelFactory serviceChannelFactory = new RosServiceChannelFactory(node, this);

    pubSubService = new PubSubManager(subscriptionChannelFactory, publicationChannelFactory, serviceChannelFactory);
  }

  /**
   * Initialize the Guidance logging system
   */
  private void initLogger(Log baseLog) {
    SaxtonLoggerProxyFactory slpf = new SaxtonLoggerProxyFactory(baseLog);
    LoggerManager.setLoggerFactory(slpf);
  }

  /**
   * Initialize the Guidance conflict detection system
   * Must be called after initLogger to ensure logging is provided
   * Must be called before initExecutor
   */
  private void initConflictManager(ConnectedNode node, ILogger log) {
    // Load params
    ParameterTree params = node.getParameterTree();
    double cellDowntrack = params.getDouble("~conflict_map_cell_downtrack_size", 5.0);
    double cellCrosstrack = params.getDouble("~conflict_map_cell_crosstrack_size", 5.0);
    double cellTime = params.getDouble("~conflict_map_cell_time_size", 0.15);

    double[] cellSize = { cellDowntrack, cellCrosstrack, cellTime };

    double downtrackMargin = params.getDouble("~conflict_map_collision_downtrack_margin", 2.5);
    double crosstrackMargin = params.getDouble("~conflict_map_collision_crosstrack_margin", 1.0);
    double timeMargin = params.getDouble("~conflict_map_collision_time_margin", 0.05);

    double lateralBias = params.getDouble("~conflict_detection_lateral_bias", 0.0);
    double longitudinalBias = params.getDouble("~conflict_detection_longitudinal_bias", 0.0);
    double temporalBias = params.getDouble("~conflict_detection_temporal_bias", 0.0);
    // Echo params
    log.info("Param conflict_map_cell_downtrack_size: " + cellDowntrack);
    log.info("Param conflict_map_cell_crosstrack_size: " + cellCrosstrack);
    log.info("Param conflict_map_cell_time_size: " + cellTime);
    log.info("Param conflict_map_collision_downtrack_margin: " + downtrackMargin);
    log.info("Param conflict_map_collision_crosstrack_margin: " + crosstrackMargin);
    log.info("Param conflict_map_collision_time_margin: " + timeMargin);

    log.info("Param conflict_detection_lateral_bias: " + lateralBias);
    log.info("Param conflict_detection_longitudinal_bias: " + longitudinalBias);
    log.info("Param conflict_detection_temporal_bias: " + temporalBias);
    // Set time strategy
    IMobilityTimeProvider timeProvider = new SystemUTCTimeProvider();
    // Build conflict manager
    conflictManager = new ConflictManager(cellSize, downtrackMargin, crosstrackMargin, timeMargin, lateralBias,
    longitudinalBias, temporalBias, timeProvider);
  }

  /**
   * Initialize the Trajectory Conversion system for use in Mobility Messages
   * Must be called after initLogger to ensure logging is provided
   * Must be called before initExecutor
   */
  private void initTrajectoryConverter(ConnectedNode node, ILogger log) {
    // Load params
    ParameterTree params = node.getParameterTree();
    int maxCollisionPoints = params.getInteger("~collision_check_max_points", 300);
    double timeStep = params.getDouble("~mobility_path_time_step", 0.1);
    // Echo params
    log.info("Param collision_check_max_points: " + maxCollisionPoints);
    log.info("Param mobility_path_time_step: " + timeStep);
    // Build trajectory converter
    trajectoryConverter = new TrajectoryConverter(maxCollisionPoints, timeStep, messageFactory);
  }

  @Override
  public void onSaxtonStart(final ConnectedNode connectedNode) {
    initLogger(connectedNode.getLog());
    final ILogger log = LoggerManager.getLogger();
    Thread.currentThread().setName(this.getClass().getSimpleName() + "Thread");

    log.info("//////////");
    log.info("//////////   GuidanceMain starting up:    " + version.toString() + "    //////////");
    log.info("//////////");

    final GuidanceStateMachine stateMachine = new GuidanceStateMachine();
    final GuidanceExceptionHandler guidanceExceptionHandler = new GuidanceExceptionHandler(stateMachine);
    log.info("Guidance exception handler initialized");

    // Allow GuidanceExceptionHandler to take over in the event a thread dies due to an uncaught exception
    // Will apply to any thread that lacks an otherwise specified ExceptionHandler
    // Not sure how this interacts with multiple processes sharing the same JVM
    Thread.setDefaultUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler() {
      @Override
      public void uncaughtException(Thread t, Throwable e) {
        log.fatal("Guidance thread " + t.getName() + " raised uncaught exception! Handling!!!");
        guidanceExceptionHandler.handleException(e);
      }
    });

    initTrajectoryConverter(connectedNode, log);
    log.info("Guidance main TrajectoryConverter initialized");

    initConflictManager(connectedNode, log);
    log.info("Guidance main ConflictManager initialized");

    initPubSubManager(connectedNode, guidanceExceptionHandler);
    log.info("Guidance main PubSubManager initialized");

    stateMachine.initSubPub(pubSubService);

    initExecutor(stateMachine, connectedNode);
    log.info("Guidance main executor initialized");

    systemVersionServer = connectedNode.newServiceServer("get_system_version", GetSystemVersion._TYPE,
        new ServiceResponseBuilder<GetSystemVersionRequest, GetSystemVersionResponse>() {
          @Override
          public void build(GetSystemVersionRequest request, GetSystemVersionResponse response)
              throws ServiceException {
            response.setSystemName(version.componentName());
            response.setRevision(version.revisionString());
          }
        });
  }//onStart

  /**
   * Handle an exception that hasn't been caught anywhere else, which will cause guidance to shutdown.
   */
  @Override
  protected void handleException(Throwable e) {
    exceptionHandler.handleException(e);

    //Leverage SaxtonNode to publish the system alert.
    publishSystemAlert(AlertSeverity.FATAL,
        "Guidance PANIC triggered in thread " + Thread.currentThread().getName() + " by an uncaught exception!", e);
  }
}//AbstractNodeMain
