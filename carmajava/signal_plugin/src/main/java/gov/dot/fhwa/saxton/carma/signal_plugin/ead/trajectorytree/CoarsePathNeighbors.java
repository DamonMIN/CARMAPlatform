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

package gov.dot.fhwa.saxton.carma.signal_plugin.ead.trajectorytree;

import gov.dot.fhwa.saxton.carma.signal_plugin.appcommon.SignalPhase;
import gov.dot.fhwa.saxton.carma.signal_plugin.appcommon.utils.GlidepathApplicationContext;
import gov.dot.fhwa.saxton.carma.signal_plugin.asd.IntersectionData;
import gov.dot.fhwa.saxton.carma.signal_plugin.appcommon.IGlidepathAppConfig;
import gov.dot.fhwa.saxton.carma.signal_plugin.logger.ILogger;
import gov.dot.fhwa.saxton.carma.signal_plugin.logger.LoggerManager;

import java.util.ArrayList;
import java.util.List;

import static gov.dot.fhwa.saxton.carma.signal_plugin.appcommon.Constants.MPS_TO_MPH;
import static java.lang.Double.min;

/**
 * Calculates the viable neighbors for a node in the coarse grid solution tree for the EAD model.
 * Nodes will only be at distances where known signal stop bars are, plus one downtrack of the farthest
 * known signal, to represent the end goal.
 */
public class CoarsePathNeighbors extends NeighborBase {

    protected double                        lagTime_; //vehicle response lag, sec
    protected double                        fractionalMaxAccel_;
    protected static ILogger                log_ = LoggerManager.getLogger(CoarsePathNeighbors.class);
    public    static final double           TYPICAL_INTERSECTION_WIDTH = 40.0; // meters

    public CoarsePathNeighbors() {
        history_ = new ArrayList<>();

        //get config parameters
        IGlidepathAppConfig config = GlidepathApplicationContext.getInstance().getAppConfig();
        maxAccel_ = config.getDoubleDefaultValue("defaultAccel", 2.0);
        speedLimit_ = config.getMaximumSpeed(0.0) / MPS_TO_MPH; 
        crawlingSpeed_ = config.getDoubleDefaultValue("crawlingSpeed", 5.0) / MPS_TO_MPH;
        timeBuffer_ = config.getDoubleDefaultValue("ead.timebuffer", 4.0);
        lagTime_ = config.getDoubleDefaultValue("ead.response.lag", 1.9);
        
        fractionalMaxAccel_ = maxAccel_ * 0.75;
    }


    @Override
    public void initialize(List<IntersectionData> intersections, int numIntersections, double timeIncrement,
                           double speedIncrement) {

        log_.debug("EAD", "initialize called with timeInc = " + timeIncrement + ", speedInc = " + speedIncrement);
        super.initialize(intersections, numIntersections, timeIncrement, speedIncrement);
    }


    /**
     * A note on nomenclature - this method is used during planning of a trajectory that lies along a line segment. It's
     * origin is the vehicle's current position, and points on the line increase in distance downtrack from there.  A point
     * on the line is a location; variables indicating locations will have "loc" in their name.  The delta between two
     * locations is called a distance; variables indicating these quantities have "dist" in their name.  Without this
     * clarification it is easy to slip into the habit of calling everything a distance and create incorrect math.
     */
    @Override
    public List<Node> neighbors(Node node) {
        
        log_.debug("PLAN", "Entering coarse node " + node.toString());
        List<Node> neighbors = new ArrayList<>();

        double curTime = node.getTimeAsDouble();
        double curLoc = node.getDistanceAsDouble();
        double curSpeed = node.getSpeedAsDouble();

        //check for downtrack intersections, allowing for slight node location error
        int intersectionIndex = currentIntersectionIndex(curLoc);
        double distToNext = 0.0;
        if (intersectionIndex >= 0) {
            distToNext = distToIntersection(intersectionIndex, curLoc);
            if (distToNext < 1.0) { //allow for roundoff error in placing this node
                ++intersectionIndex;
                if (intersectionIndex >= intersections_.size()) { //no more intersections downtrack of us
                    intersectionIndex = -1;
                } else {
                    distToNext = distToIntersection(intersectionIndex, curLoc);
                }
            }
        }

        //if there is an intersection downtrack then
        if (intersectionIndex >= 0) {

            //get its distance from us & use that value for all our neighbors
            double lagDist = lagTime_*curSpeed;

            //compute time to reach operating speed and travel to that next intersection
            double speedAtNext = operSpeed_;
            double deltaSpeed = Math.abs(operSpeed_ - curSpeed);
            double timeToOperSpeed = deltaSpeed / maxAccel_;
            double distToOperSpeed = curSpeed*timeToOperSpeed + 0.5*maxAccel_*timeToOperSpeed*timeToOperSpeed;
            double timeAtNext = curTime;
            if (deltaSpeed > 1.0) { //ignore response lag for tiny speed changes
                distToOperSpeed += lagDist;
                timeAtNext += lagTime_;
            }
            if (distToOperSpeed > distToNext) { //we will reach next intersection before getting to operating speed
                speedAtNext = Math.sqrt(curSpeed*curSpeed + 2.0*maxAccel_*Math.max(distToNext-lagDist, 0.0));
                timeAtNext += (speedAtNext - curSpeed) / maxAccel_;
            }else {
                double cruiseTime = (distToNext - distToOperSpeed) / operSpeed_;
                timeAtNext += timeToOperSpeed + cruiseTime;
            }

            double nodeTime = timeAtNext;
            double nodeSpeed = speedAtNext;
            double nodeLoc = curLoc + distToNext;

            //if that intersection's signal will be green when we arrive at max speed then
            SignalState state = phaseAtTime(intersectionIndex, timeAtNext);
            SignalPhase phaseAtNext = state.phase;
            if (phaseAtNext == SignalPhase.GREEN) {

                //slice up the remainder of that green phase into neighbor nodes
                double greenExpiration = curTime + state.timeRemaining - timeBuffer_;
                do {
                    Node neighbor = new Node(nodeLoc, nodeTime, nodeSpeed);
                    neighbors.add(neighbor);
                    log_.debug("PLAN", "case one: time = " + nodeTime + " speed = " + nodeSpeed + " loc = " + nodeLoc);
                    nodeTime += timeInc_;
                    nodeSpeed = 2.0*distToNext/(nodeTime - curTime) - curSpeed;
                }while (nodeSpeed >= crawlingSpeed_  &&  nodeTime <= greenExpiration);
            }

            //find the following green phase and the speed reduction we need to get there
            double timeOfNextGreen = timeOfGreenBegin(intersectionIndex, timeAtNext) + timeBuffer_;
            double greenExpiration = timeOfNextGreen + phaseDuration(intersectionIndex, SignalPhase.GREEN) - timeBuffer_;
            log_.debug("PLAN", "timeOfNextGreen = " + timeOfNextGreen + " greenExpiration = " + greenExpiration);

            //If we are really close to the next intersection then
            // If it will be green while staying at current speed, then it is handled above, and there is no chance
            //   that we will be able to consider getting through in the following green phase.
            //     Therefore, there is no additional node to be added here.
            // If it will be yellow/red while staying at current speed, then we will have a signal violation because
            //   there is no time to adjust speed (previous planning that got us into this situation has failed!).
            //     Therefore, there is no additional node to be added here.
            // Both of these situations should be ignored, so set the nodeSpeed to zero.
            if (distToNext < lagDist  ||  (timeOfNextGreen - curTime) <= lagTime_) {
                nodeSpeed = 0.0;

            //else we are far enough away from the intersection we need to plan to arrive at the start of the next green phase
            }else {
                double calcSpeed = 2.0*(distToNext - lagDist)/(timeOfNextGreen - curTime - lagTime_) - curSpeed; //may be negative
                nodeSpeed = Math.max(Math.min(calcSpeed, speedLimit_), 0); //avoid meaningless speed
            }

            //if the speed required to get us through the next green is above crawling speed then
            if (nodeSpeed >= crawlingSpeed_) {
                //calculate the time, and slice the green phase into neighbor nodes (for these increments, ignore
                // response lag - assume constant acceleration between the two intersections, since this is a coarse solution)
                nodeTime = timeOfNextGreen;
                while (nodeSpeed >= crawlingSpeed_ && nodeTime <= greenExpiration) {
                    Node neighbor = new Node(nodeLoc, nodeTime, nodeSpeed);
                    neighbors.add(neighbor);
                    log_.debug("PLAN", "case two: time = " + nodeTime + " speed = " + nodeSpeed + " loc = " + nodeLoc);
                    nodeTime += timeInc_;
                    nodeSpeed = 2.0 * distToNext / (nodeTime - curTime) - curSpeed;
                }

            //else if we haven't yet found any solution at this intersection (we have to stop for the red)
            }else if (neighbors.size() == 0){
                //we will need to come to a stop while red expires





                //TODO - these calcs are for debug purposes only - REMOVE FOR PRODUCTION RELEASE!
                //first, determine the decel distance & time from current speed
                //double decelTime = curSpeed/maxAccel_;
                //double decelDist = 0.5*curSpeed*decelTime;

                //add the time to get from current location (at current speed) to the decel point
                // (assume that intersections are far enough apart that this will always be non-negative)
                //double cruiseTime = (distToNext - decelDist)/curSpeed;

                //determine where this falls in the red cycle, and add the cycle time remaining to our time allotment
                //double waitTime = timeOfNextGreen - (curTime + cruiseTime + decelTime);
                //log_.debug("EAD", "Need to stop at red: decelTime = " + decelTime + ", decelDist = " + decelDist
                //            + ", cruiseTime = " + cruiseTime + ", waitTime = " + waitTime);

                //create a single node at the start of green phase with zero speed
                Node neighbor = new Node(nodeLoc, timeOfNextGreen - timeBuffer_, 0.0);
                neighbors.add(neighbor);
                log_.debug("EAD", "Need to stop at red:" + neighbor.toString());
            }

        //else - no more intersections downtrack
        }else {

            //calculate the distance to get from current location & speed to operating speed with 0.75 max acceleration
            // this will be our only neighbor
            double deltaTime = Math.abs(operSpeed_ - curSpeed) / fractionalMaxAccel_;
            double deltaDist = curSpeed * deltaTime + 0.5 * fractionalMaxAccel_ * deltaTime * deltaTime;
            //limit it to be a reasonable distance away, even if we are already at operating speed
            if (deltaDist < TYPICAL_INTERSECTION_WIDTH) {
                deltaTime += (TYPICAL_INTERSECTION_WIDTH-deltaDist) / operSpeed_;
                deltaDist = TYPICAL_INTERSECTION_WIDTH;
            }
            double operSpeedLoc = curLoc + deltaDist;
            double timeAtOperSpeed = curTime + deltaTime;

            //add the node
            neighbors.add(new Node(operSpeedLoc, timeAtOperSpeed, operSpeed_));
        }
        log_.debug("PLAN", "returning " + neighbors.size() + " neighbors.");

        return neighbors;
    }


    ////////////////////


    /**
     * Returns the amount of time since start of plan until the start of the next green phase.
     * @param intersectionIndex - index in the intersections_ list of the intersection in question
     * @param afterTime - time after which the next green phase will be considered, sec
     * @return plan time at the beginning of the green phase, sec
     */
    private double timeOfGreenBegin(int intersectionIndex, double afterTime) {

        //phase's end time is time remaining in the phase at afterTime
        SignalState state = phaseAtTime(intersectionIndex, afterTime);
        SignalPhase phase = state.phase;
        double phaseEndTime = afterTime + state.timeRemaining;

        //loop through phases until we find the end of a red phase (which is beginning of green)
        while (phase != SignalPhase.RED) {
            //advance to the next phase & add its duration
            phase = phase.next();
            if (phase == SignalPhase.NONE) {
                phase = phase.next();
            }
            phaseEndTime += phaseDuration(intersectionIndex, phase);
        }

        return phaseEndTime;
    }
}
