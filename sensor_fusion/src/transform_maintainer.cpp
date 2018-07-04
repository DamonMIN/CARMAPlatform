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

// #include "object_tracker.h"
// #include "twist_history_buffer.h"
// #include <sensor_fusion/SensorFusionConfig.h>

// #include <nav_msgs/Odometry.h>
// #include <sensor_msgs/NavSatFix.h>
// #include <geometry_msgs/TwistStamped.h>
// #include <cav_msgs/HeadingStamped.h>
// #include <cav_msgs/ExternalObjectList.h>
// #include <cav_msgs/BSM.h>
// #include <geometry_msgs/TransformStamped.h>
// #include <geometry_msgs/PoseStamped.h>
// #include <tf2_geometry_msgs/tf2_geometry_msgs.h>

// #include <boost/bind.hpp>
// #include <boost/uuid/uuid.hpp>
// #include <boost/uuid/random_generator.hpp>
// #include <boost/uuid/uuid_io.hpp>

// #include <bondcpp/bond.h>

// #include <tf2_ros/transform_listener.h>
// #include <tf2_ros/buffer.h>
// #include <tf2/LinearMath/Transform.h>
// #include <tf2_ros/transform_broadcaster.h>

// #include <dynamic_reconfigure/server.h>

// #include <ros/ros.h>

// #include <string>
// #include <math.h>
// #include <unordered_map>
// #include <memory>
// #include <vector>

#include "transform_maintainer.h"

void TransformMaintainer::nav_sat_fix_update_cb()
{
    // Assign the new host vehicle location
    if (navsatfix_map_.empty() || heading_map_.empty()) {
      std::string msg = "TransformMaintainer nav_sat_fix_update_cb called before heading and nav_sat_fix received";
      ROS_WARN_STREAM("TRANSFORM | " << msg);
      return; // If we don't have a heading and a nav sat fix the map->odom transform cannot be calculated
    }
    sensor_msgs::NavSatFixConstPtr host_veh_loc = navsatfix_map_.begin()->second;
    
    std::string frame_id = host_veh_loc->header.frame_id;
    if (frame_id != global_pos_sensor_frame_) {
      std::string msg = "NavSatFix message with unsupported frame received. Frame: " + frame_id;
      ROS_ERROR_STREAM("TRANSFORM | " << msg);
      return;
    }
    
    // Check if base_link->position_sensor tf is available. If not look it up
    if (no_base_to_global_pos_sensor_) {
      // This transform should be static. No need to look up more than once
      try {
        base_to_global_pos_sensor_ = get_transform(base_link_frame_, global_pos_sensor_frame_, ros::Time(0));
      } catch (tf2::TransformException e) {
        return;
      }

      no_base_to_global_pos_sensor_ = false;
    }

    std::vector<geometry_msgs::TransformStamped> tf_stamped_msgs;

    wgs84_utils::wgs84_coordinate host_veh_coord;
    host_veh_coord.lat = host_veh_loc->latitude;
    host_veh_coord.lon = host_veh_loc->longitude;
    host_veh_coord.elevation = host_veh_loc->altitude;
    host_veh_coord.heading = heading_map_.begin()->second->heading;

    // Update map location on start
    if (no_earth_to_map_) { 
      // Map will be an NED frame on the current vehicle location
      earth_to_map_ = wgs84_utils::ecef_to_ned_from_loc(host_veh_coord);
      no_earth_to_map_ = false;
    }
    // Keep publishing transform to maintain timestamp
    geometry_msgs::TransformStamped earth_to_map_msg
     = tf2::toMsg(earth_to_map_, host_veh_loc->header.stamp, earth_frame_, map_frame_);
    
    tf_stamped_msgs.push_back(earth_to_map_msg);
    // Calculate map->global_position_sensor transform

    tf2::Vector3 global_sensor_in_map = wgs84_utils::geodesic_2_cartesian(host_veh_coord, earth_to_map_.inverse());

    // T_x_y = transform describing location of y with respect to x
    // m = map frame
    // b = baselink frame (from odometry)
    // B = baselink frame (from nav sat fix)
    // o = odom frame
    // p = global position sensor frame
    // We want to find T_m_o. This is the new transform from map to odom.
    // T_m_o = T_m_B * inv(T_o_b)  since b and B are both odom.
    tf2::Vector3 sensor_trans_in_map = global_sensor_in_map;
    // The vehicle heading is relative to NED so over short distances heading in NED = heading in map
    tf2::Vector3 zAxis = tf2::Vector3(0, 0, 1);
    tf2::Quaternion sensor_rot_in_map(zAxis, host_veh_coord.heading * wgs84_utils::DEG2RAD);
    sensor_rot_in_map = sensor_rot_in_map.normalize();

    tf2::Transform T_m_p = tf2::Transform(sensor_rot_in_map, sensor_trans_in_map);
    tf2::Transform T_B_p = base_to_global_pos_sensor_;
    tf2::Transform T_m_B = T_m_p * T_B_p.inverse();
    tf2::Transform T_o_b = odom_to_base_link_;

    // Modify map to odom with the difference from the expected and real sensor positions
    map_to_odom_ = T_m_B * T_o_b.inverse();
    // Publish newly calculated transforms
    geometry_msgs::TransformStamped map_to_odom_msg 
      = tf2::toMsg(map_to_odom_,  host_veh_loc->header.stamp, map_frame_, odom_frame_);
    
    tf_stamped_msgs.push_back(map_to_odom_msg);

    // Publish transform
    tf2_broadcaster_->sendTransform(tf_stamped_msgs);
}

void TransformMaintainer::odometry_update_cb() 
{
      // Check if base_link->position_sensor tf is available. If not look it up
    if (no_base_to_local_pos_sensor_) {
      // This transform should be static. No need to look up more than once
      try {
        base_to_local_pos_sensor_ = get_transform(base_link_frame_, local_pos_sensor_frame_, ros::Time(0));
      } catch (tf2::TransformException e) {
        return;
      }

      no_base_to_local_pos_sensor_ = false;
    }

    if (odom_map_.empty()) {
      std::string msg = "TransformMaintainer odometry_update_cb called before odometry message received";
      ROS_WARN_STREAM("TRANSFORM | " << msg);
      return;
    }
    nav_msgs::OdometryConstPtr odometry = odom_map_.begin()->second;
    std::string parent_frame_id = odometry->header.frame_id;
    std::string child_frame_id = odometry->child_frame_id;
    // If the odometry is already in the base_link frame
    if (parent_frame_id == odom_frame_ && child_frame_id == base_link_frame_) {
      tf2::fromMsg(odometry->pose.pose, odom_to_base_link_);
      // Publish updated transform
      geometry_msgs::TransformStamped odom_to_base_link_msg 
        = tf2::toMsg(map_to_odom_,  odometry->header.stamp, odom_frame_, base_link_frame_);
      tf2_broadcaster_->sendTransform(odom_to_base_link_msg);

    } else if (parent_frame_id == odom_frame_ && child_frame_id == local_pos_sensor_frame_) {
      // Extract the location of the position sensor relative to the odom frame
      // Covariance is ignored as filtering was already done by sensor fusion
      // Calculate odom->base_link
      // T_x_y = transform describing location of y with respect to x
      // p = position sensor frame (from odometry)
      // o = odom frame
      // b = baselink frame (as has been calculated by odometry up to this point)
      // T_o_b = T_o_p * inv(T_b_p)
      tf2::Transform T_o_p;
      tf2::fromMsg(odometry->pose.pose, T_o_p);

      tf2::Transform T_b_p = base_to_local_pos_sensor_;
      tf2::Transform T_o_b = T_o_p * T_b_p.inverse();
      odom_to_base_link_ = T_o_b;
      // Publish updated transform
      geometry_msgs::TransformStamped odom_to_base_link_msg 
        = tf2::toMsg(map_to_odom_,  odometry->header.stamp, odom_frame_, base_link_frame_);
      tf2_broadcaster_->sendTransform(odom_to_base_link_msg);

    } else {
      std::string msg =
        "Odometry message with unsupported frames received. ParentFrame: " + parent_frame_id
          + " ChildFrame: " + child_frame_id;
      ROS_ERROR_STREAM("TRANSFORM | " << msg);//TODO throw exception
      //throw new IllegalArgumentException(msg);
    }
}

// Helper function
tf2::Transform TransformMaintainer::get_transform(std::string parent_frame, std::string child_frame, ros::Time stamp) {
  geometry_msgs::TransformStamped transform_stamped;
  if(tf2_buffer_->canTransform(parent_frame, child_frame, stamp))
  {
    transform_stamped = tf2_buffer_->lookupTransform(parent_frame, child_frame, stamp);
  }
  else if(tf2_buffer_->canTransform(parent_frame, child_frame, ros::Time(0)))
  {
    ROS_DEBUG_STREAM("Using latest transform available");
    transform_stamped = tf2_buffer_->lookupTransform(parent_frame, child_frame, ros::Time(0));
  }
  else
  {
    ROS_WARN_STREAM("No transform available from " << parent_frame << " to " << child_frame);

    throw tf2::TransformException("Failed to get transform");
  }
  
  tf2::Transform result;
  tf2::fromMsg(transform_stamped.transform, result);

  return result;
}



