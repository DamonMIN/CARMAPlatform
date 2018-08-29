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

/**
 * Simple interface for determining the current time in seconds or milliseconds
 * The time provided is relative to the UTC epoch
 */
public interface ITimeProvider {
  /**
   * Returns the current time in seconds since the epoch
   * 
   * @return current time in seconds
   */
  double getCurrentTimeSeconds();

  /**
   * Returns the current time in milliseconds since the epoch
   * 
   * @return current time in milli-seconds
   */
  long getCurrentTimeMillis();
}