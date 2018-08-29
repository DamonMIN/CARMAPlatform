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

package gov.dot.fhwa.saxton.carma.signal_plugin.appcommon;

import gov.dot.fhwa.saxton.utils.IAppConfig;

/**
 * Glidepath specific appconfig interface
 */
public interface IGlidepathAppConfig extends IAppConfig {
    int getPeriodicDelay();
    int getUiRefresh();
    String getGpsHost();
    int getGpsPort();
    int getJausUdpPort();
    int getSoftwareJausId();
    int getJausRetryLimit();
    String getXgvIpAddress();
    int getXgvNodeId();
    int getXgvSubsystemId();
    int getXgvInstanceId();
    boolean getXgvMPAck();
    boolean getLogRealTimeOutput();
    int getMpdJausId();
    int getVssJausId();
    int getPdJausId();
    int getGpsUdpPort();
    int getMaximumSpeed();
    int getXgvSocketTimeout();
    boolean getAutoStartConsumption();
    int getUcrPort();
    String getUcrIpAddress();
    int getXgvInitTimeout();
    boolean getUcrEnabled();
    double getMaxAccel();
    String getCanDeviceName();
    String getNativeLib();
    double getDefaultSpeed();
}
