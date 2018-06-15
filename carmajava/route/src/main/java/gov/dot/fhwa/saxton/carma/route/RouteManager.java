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

package gov.dot.fhwa.saxton.carma.route;

import cav_msgs.RouteSegment;
import cav_srvs.*;
import gov.dot.fhwa.saxton.carma.rosutils.AlertSeverity;
import gov.dot.fhwa.saxton.carma.rosutils.RosServiceSynchronizer;
import gov.dot.fhwa.saxton.carma.rosutils.SaxtonBaseNode;
import gov.dot.fhwa.saxton.carma.rosutils.SaxtonLogger;

import org.ros.concurrent.CancellableLoop;
import org.ros.exception.RemoteException;
import org.ros.message.MessageListener;
import org.ros.message.Time;
import org.ros.node.topic.Subscriber;
import org.ros.rosjava_geometry.Transform;
import org.ros.namespace.GraphName;
import org.ros.node.ConnectedNode;
import org.ros.node.topic.Publisher;
import org.ros.node.parameter.ParameterTree;
import org.ros.node.service.ServiceServer;
import org.ros.node.service.ServiceClient;
import org.ros.node.service.ServiceResponseBuilder;
import org.ros.node.service.ServiceResponseListener;
import java.util.LinkedList;
import java.util.List;

/**
 * ROS Node which handles route loading, selection, and tracking for the STOL CARMA platform.
 * <p>
 * <p>
 * Command line test:
 * rosparam set /route_manager/default_database_path /home/mcconnelms/to13_ws/src/CarmaPlatform/carmajava/route/src/test/resources/routefiles
 * rosrun carma route gov.dot.fhwa.saxton.carma.route.RouteManager
 * Command line test for the service:
 * rostopic pub /system_alert cav_msgs/SystemAlert '{type: 5, description: hello}'
 * rosservice call /get_available_routes
 * rosservice call /set_active_route "routeID: 'Glidepath Demo East Bound'"
 * rostopic pub /nav_sat_fix '{latitude: 38.956439, longitude: -77.150325}'
 * rosservice call /start_active_route "routeID: 'Glidepath Demo East Bound'"
 * Run this next line to force a new route state message to publish. Change the lat lon for different distances
 * rostopic pub /nav_sat_fix '{latitude: 38.956439, longitude: -77.150325}'
 */
public class RouteManager extends SaxtonBaseNode implements IRouteManager {

  protected ConnectedNode connectedNode;
  protected SaxtonLogger log;
  // Topics
  // Publishers
  Publisher<cav_msgs.Route> routePub;
  Publisher<cav_msgs.RouteState> routeStatePub;
  Publisher<cav_msgs.RouteEvent> routeEventPub;
  // Subscribers
  Subscriber<cav_msgs.SystemAlert> alertSub;
  // Services
  // Provided
  protected ServiceServer<SetActiveRouteRequest, SetActiveRouteResponse> setActiveRouteService;
  protected ServiceServer<GetAvailableRoutesRequest, GetAvailableRoutesResponse>
    getAvailableRouteService;
  protected ServiceServer<StartActiveRouteRequest, StartActiveRouteResponse>
    startActiveRouteService;
  protected ServiceServer<AbortActiveRouteRequest, AbortActiveRouteResponse>
    abortActiveRouteService;
  protected RouteWorker routeWorker;
  // Used
  protected ServiceClient<cav_srvs.GetTransformRequest, cav_srvs.GetTransformResponse> getTransformClient;
  
  protected boolean shutdownInitiated_ = false;

  @Override public GraphName getDefaultNodeName() {
    return GraphName.of("route_manager");
  }

  @Override public void onSaxtonStart(final ConnectedNode connectedNode) {
    this.connectedNode = connectedNode;

    this.log = new SaxtonLogger(this.getClass().getSimpleName(), connectedNode.getLog());
    // Parameters
    ParameterTree params = connectedNode.getParameterTree();

    /// Topics
    // Publishers
    routePub = connectedNode.newPublisher("route", cav_msgs.Route._TYPE);
    routePub.setLatchMode(true); // Routes will not be changed regularly so latch
    routeStatePub = connectedNode.newPublisher("route_state", cav_msgs.RouteState._TYPE);
    routeEventPub = connectedNode.newPublisher("route_event", cav_msgs.RouteEvent._TYPE);

    // Worker must be initialized after publishers but before subscribers
    String packagePath = params.getString("package_path");
    String databasePath = params.getString("~default_database_path");
    String finalDatabasePath;
    if (databasePath.charAt(0) == '/') { // Check if path should be treated as absolute
      finalDatabasePath = databasePath;
    } else {
      finalDatabasePath = packagePath + "/" + databasePath;
    }

    String earthFrame = params.getString("~earth_frame_id", "earth");
    String hostVehicleFrame = params.getString("~host_vehicle_frame_id", "host_vehicle");
    int requiredLeftRouteCount = params.getInteger("~required_left_route_count", 3);

    // Echo params
    log.info("LoadedParam: package_path = " + packagePath);
    log.info("LoadedParam: default_database_path = " + databasePath);
    log.info("LoadedParam: earth_frame_id = " + earthFrame);
    log.info("LoadedParam: host_vehicle_frame_id = " + hostVehicleFrame);
    log.info("LoadedParam: required_left_route_count = " + requiredLeftRouteCount);

    routeWorker = new RouteWorker(this, connectedNode.getLog(), finalDatabasePath, requiredLeftRouteCount, earthFrame, hostVehicleFrame);

    // Used Services
    // Ensure transforms can be obtained
    getTransformClient = this.waitForService("get_transform", cav_srvs.GetTransform._TYPE, connectedNode, 5000);
    if (getTransformClient == null) {
      log.fatal("TRANSFORM", "Node could not find service get_transform");
      publishSystemAlert(AlertSeverity.FATAL, "Node could not find service get_transform: get_transform service is not available. Route package will not be able to function", null );
    }

    // Subscribers
    // Subscriber<cav_msgs.Tim> timSub = connectedNode.newSubscriber("tim", cav_msgs.Map._TYPE); //TODO: Add once we have tim messages

    alertSub = connectedNode.newSubscriber("system_alert", cav_msgs.SystemAlert._TYPE);
    alertSub.addMessageListener(new MessageListener<cav_msgs.SystemAlert>() {
      @Override public void onNewMessage(cav_msgs.SystemAlert message) {
        try {
          routeWorker.handleSystemAlertMsg(message);
        } catch (Exception e) {
          handleException(e);
        }
      }//onNewMessage
    });//addMessageListener

    // Services
    // Server
    getAvailableRouteService = connectedNode
      .newServiceServer("get_available_routes", GetAvailableRoutes._TYPE,
        new ServiceResponseBuilder<GetAvailableRoutesRequest, GetAvailableRoutesResponse>() {
          @Override public void build(GetAvailableRoutesRequest request,
            GetAvailableRoutesResponse response) {
            try {
              List<cav_msgs.Route> routeMsgs = new LinkedList<>();

              for (Route route : routeWorker.getAvailableRoutes()) {
                cav_msgs.Route routeMsg = route.toMessage(connectedNode.getTopicMessageFactory());
                routeMsg.setSegments(new LinkedList<RouteSegment>()); // Clearing segments to match service spec
                routeMsgs.add(routeMsg);
              }
              routeMsgs.sort(
                (cav_msgs.Route r1, cav_msgs.Route r2) -> r1.getRouteName().compareToIgnoreCase(r2.getRouteName())
              );
              response.setAvailableRoutes(routeMsgs);
            } catch (Exception e) {
              handleException(e);
            }
          }
        });

    setActiveRouteService = connectedNode.newServiceServer("set_active_route", SetActiveRoute._TYPE,
      new ServiceResponseBuilder<SetActiveRouteRequest, SetActiveRouteResponse>() {
        @Override
        public void build(SetActiveRouteRequest request, SetActiveRouteResponse response) {
          try {
            response.setErrorStatus(routeWorker.setActiveRoute(request.getRouteID()));
          } catch (Exception e) {
            handleException(e);
          }
        }
      });

    startActiveRouteService = connectedNode
      .newServiceServer("start_active_route", StartActiveRoute._TYPE,
        new ServiceResponseBuilder<StartActiveRouteRequest, StartActiveRouteResponse>() {
          @Override
          public void build(StartActiveRouteRequest request, StartActiveRouteResponse response) {
            try {
              response.setErrorStatus(routeWorker.startActiveRoute());
            } catch (Exception e) {
              handleException(e);
            }
          }
        });

    abortActiveRouteService = connectedNode
      .newServiceServer("abort_active_route", AbortActiveRoute._TYPE,
        new ServiceResponseBuilder<AbortActiveRouteRequest, AbortActiveRouteResponse>() {
          @Override
          public void build(AbortActiveRouteRequest request, AbortActiveRouteResponse response) {
            try {
              response.setErrorStatus(routeWorker.abortActiveRoute());
            } catch (Exception e) {
              handleException(e);
            }
          }
        });

    // Loop
    // This CancellableLoop will be canceled automatically when the node shuts down.
    connectedNode.executeCancellableLoop(new CancellableLoop(){
    
      @Override
      protected void setup() {}

      @Override
      protected void loop() throws InterruptedException {
        routeWorker.loop();
        Thread.sleep(100);
      }
    });;
  }//onStart

  @Override protected void handleException(Throwable e) {
    String msg = "Uncaught exception in " + connectedNode.getName() + " caught by handleException";
    publishSystemAlert(AlertSeverity.FATAL, msg, e);
    this.shutdown();
  }

  @Override public void publishActiveRoute(cav_msgs.Route route) {
    routePub.publish(route);
  }

  @Override public void publishRouteState(cav_msgs.RouteState routeState) {
    routeStatePub.publish(routeState);
  }

  @Override public void publishRouteEvent(cav_msgs.RouteEvent routeEvent) {
      routeEventPub.publish(routeEvent);
  }

  /**
   * Helper class to hold the result of a service call
   */
  protected class ResultHolder <T> {
    private T result;

    void setResult(T res) {
      result = res;
    }

    T getResult() {
      return result;
    }
  }

  @Override public Transform getTransform(String parentFrame, String childFrame, Time stamp) {
    final GetTransformRequest req = getTransformClient.newMessage();
    req.setParentFrame(parentFrame);
    req.setChildFrame(childFrame);
    req.setStamp(stamp);
    final ResultHolder<Transform> rh = new ResultHolder<>();
    try {
      RosServiceSynchronizer.callSync(getTransformClient, req,
        new ServiceResponseListener<GetTransformResponse>() {
          @Override
          public void onSuccess(GetTransformResponse response) {
            if (response.getErrorStatus() == GetTransformResponse.NO_ERROR
              || response.getErrorStatus() == GetTransformResponse.COULD_NOT_EXTRAPOLATE) {

              rh.setResult(Transform.fromTransformMessage(response.getTransform().getTransform()));

            } else {
              log.warn("TRANSFORM", "Attempt to get transform failed with error code: " + response.getErrorStatus());
              rh.setResult(null);
              return;
            }
          }

          @Override
          public void onFailure(RemoteException e) {
            log.warn("TRANSFORM", "getTransform call failed for " + getTransformClient.getName());
            rh.setResult(null);
          }
        });
    } catch (InterruptedException e) {
      log.warn("TRANSFORM", "getTransform call failed for " + getTransformClient.getName());
      rh.setResult(null);
    }
    return rh.getResult();
  }
  
  @Override public Time getTime() {
    if (connectedNode == null) {
      return new Time();
    }
    return connectedNode.getCurrentTime();
  }

  @Override public void shutdown() {
    log.info("SHUTDOWN", "Shutdown method called");
    if(!shutdownInitiated_) {
        this.connectedNode.shutdown();
        shutdownInitiated_ = true;
    } else {
        log.info("SHUTDOWN", "Shutdown method called but shuwdown process was already initilized");
    }
  }
  
}
