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

package gov.dot.fhwa.saxton.carma.guidance.util;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TimeZone;
import java.time.LocalDateTime;
import cav_msgs.IntersectionGeometry;
import cav_msgs.IntersectionState;
import cav_msgs.MapData;
import cav_msgs.SPAT;
import gov.dot.fhwa.saxton.carma.guidance.pubsub.IPubSubService;
import gov.dot.fhwa.saxton.carma.guidance.pubsub.ISubscriber;

public class GuidanceV2IService implements V2IService {
    private ISubscriber<MapData> mapSub;
    private ISubscriber<SPAT> spatSub;
    private int commsReliabilityCheckThreshold = 5;
    private double commsReliabilityPct = 0.75;
    private double commsReliabilityExpectedV2IMsgsPerSec = 1.1;
    private long expiryTimeoutMs = 1000;
    private Thread expiryCheckThread;
    private List<V2IDataCallback> callbacks = Collections.synchronizedList(new ArrayList<>());

    private final Map<Integer, IntersectionData> intersections = Collections.synchronizedMap(new HashMap<>());
    private final Map<Integer, DsrcCommsCheck> commsChecks = Collections.synchronizedMap(new HashMap<>());

    private IPubSubService pubSub;
    private ILogger log = LoggerManager.getLogger();

    public GuidanceV2IService(IPubSubService pubSub, int commsReliabilityCheckThreshold, double commsReliabilityPct, double commsReliabilityExpectedV2IMsgsPerSec, long expiryTimeoutMs) {
        this.pubSub = pubSub;
        this.commsReliabilityCheckThreshold = commsReliabilityCheckThreshold;
        this.commsReliabilityPct = commsReliabilityPct;
        this.commsReliabilityExpectedV2IMsgsPerSec = commsReliabilityExpectedV2IMsgsPerSec;
        this.expiryTimeoutMs = expiryTimeoutMs;
    }

    public void init() {
        log.infof("GuidanceV2IService init'd with commsReliabilityCheckThreshold=%d, commsReliabilityPct=%.02f, commsReliabilityExpectedV2IMsgsPerSec=%.02f, expiryTimeoutMs=%d",
        commsReliabilityCheckThreshold, commsReliabilityPct, commsReliabilityExpectedV2IMsgsPerSec, expiryTimeoutMs);

        mapSub = pubSub.getSubscriberForTopic("incoming_map", MapData._TYPE);

        mapSub.registerOnMessageCallback((map) -> {
            for (IntersectionGeometry geometry : map.getIntersections()) {
                LocalDateTime msgTs = LocalDateTime.ofInstant(Instant.ofEpochMilli((long) map.getHeader().getStamp().toSeconds() * 1000L), TimeZone.getDefault().toZoneId());
                int id = geometry.getId().getId();
                reportIntersectionComms(id, msgTs);

                boolean reliableComms = commsChecks.get(id).isReliable();

                if (reliableComms) {
                    if (intersections.containsKey(id)) {
                        intersections.get(id).updateIntersectionGeometry(geometry, msgTs);
                    } else {
                        createNewIntersectionData(id, geometry, msgTs);
                    }
                    fireCallbacks();
                } else if (!reliableComms && intersections.containsKey(id)) {
                    intersections.remove(id);
                    fireCallbacks();
                } // if neither is true, do nothing
            }
        });

        spatSub = pubSub.getSubscriberForTopic("incoming_spat", SPAT._TYPE);
        spatSub.registerOnMessageCallback((spat) -> {
            for (IntersectionState state : spat.getIntersections().getIntersectionStateList()) {
                LocalDateTime msgTs = LocalDateTime.now(); // TODO: Improve methodology for determining data age
                int id = state.getId().getId();
                reportIntersectionComms(id, msgTs);

                boolean reliableComms = commsChecks.get(id).isReliable();

                IntersectionData data = intersections.get(state.getId().getId());
                if (reliableComms && intersections.containsKey(id)) {
                    intersections.get(id).updateIntersectionState(state, msgTs);
                    fireCallbacks();
                } else if (!reliableComms && intersections.containsKey(id)) {
                    intersections.remove(id);
                    fireCallbacks();
                } // if neither is true do nothing
            }
        });

        expiryCheckThread = new Thread(() -> {
            while (!Thread.interrupted())  {
                List<Integer> keys = new ArrayList<>(intersections.keySet());
                for (int id : keys) {
                    if (!commsChecks.get(id).isReliable()) {
                        expireIntersectionData(id);
                    }
                }
                try {
					Thread.sleep(expiryTimeoutMs);
				} catch (InterruptedException e) {
					e.printStackTrace();
				}
            }
        });
        expiryCheckThread.start();
    }

    private void fireCallbacks() {
        for (V2IDataCallback cb : callbacks) {
            cb.onV2IDataChanged(getV2IData());
        }
    }

    private void expireIntersectionData(int id) {
        intersections.remove(id);
        commsChecks.remove(id);
    }

    private void createNewIntersectionData(int id, IntersectionGeometry geometry, LocalDateTime ts) {
        IntersectionData data = new IntersectionData(geometry, ts);
        intersections.put(id, data);
    }

    private void reportIntersectionComms(int id, LocalDateTime ts) {
        if (commsChecks.containsKey(id)) {
            commsChecks.get(id).recordNewCommsRx(ts);
        } else {
            DsrcCommsCheck newCheck = new DsrcCommsCheck();
            newCheck.recordNewCommsRx(ts);
            commsChecks.put(id, newCheck);
        }
    }

    private class DsrcCommsCheck {
        protected List<LocalDateTime> stamps = new ArrayList<>();
        protected int idx = 0;

        protected void recordNewCommsRx(LocalDateTime rxTs) {
            stamps.add(rxTs);
            if (stamps.size() > commsReliabilityCheckThreshold) {
                stamps.remove(0);
            }
        }

        protected boolean isReliable() {
            if (stamps.size() < commsReliabilityCheckThreshold) {
                return false;
            }

            double messagesPerSec = stamps.size() / (Duration.between(stamps.get(0), LocalDateTime.now()).toMillis() / 1000);

            if ((messagesPerSec / commsReliabilityExpectedV2IMsgsPerSec) < commsReliabilityPct) {
                return false;
            } else {
                return true;
            }
       }
    }

	@Override
	public void registerV2IDataCallback(V2IDataCallback callback) {
        callbacks.add(callback);
	}

	@Override
	public List<IntersectionData> getV2IData() {
		return new ArrayList<IntersectionData>(intersections.values());
	}
}