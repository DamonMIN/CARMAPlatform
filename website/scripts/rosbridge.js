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

/***
 This file shall contain ROS relate function calls.
****/

// *** Global variables ***
// Deployment variables
var ip = CarmaJS.Config.getIP(); // TODO: Update with proper environment IP address to 166.241.207.252 or 192.168.88.10

// Topics
var t_system_alert = 'system_alert';
var t_available_plugins = 'plugins/available_plugins';
var t_controlling_plugins = 'plugins/controlling_plugins';
var t_guidance_instructions = 'ui_instructions';
var t_ui_platoon_vehicle_info = 'ui_platoon_vehicle_info';

var t_route_state = 'route_state';
var t_route_event = 'route_event';
var t_active_route = 'route';

var t_diagnostics = '/diagnostics';

var t_sensor_fusion_filtered_velocity = 'velocity';

var t_guidance_state = 'state';
var t_incoming_bsm = 'bsm';

var t_driver_discovery = 'driver_discovery';
var t_ui_instructions = 'ui_instructions';

//To Interface manager - topic base names
var t_get_drivers_with_capabilities = 'get_drivers_with_capabilities';

var tbn_nav_sat_fix = 'position/nav_sat_fix';

var tbn_robot_status = 'control/robot_status';
var tbn_cmd_speed = 'control/cmd_speed';
var tbn_lateral_control_driver = 'control/cmd_lateral';

var tbn_can_engine_speed = 'can/engine_speed';
var tbn_can_speed = 'can/speed';
var tbn_acc_engaged = 'can/acc_engaged';

var tbn_inbound_binary_msg = 'comms/inbound_binary_msg';
var tbn_outbound_binary_msg = 'comms/outbound_binary_msg';

//From Interface manager - will hold the topic fully qualified name
var t_nav_sat_fix = '';

var t_robot_status = '';
var t_cmd_speed = '';
var t_lateral_control_driver = '';

var t_can_engine_speed = '';
var t_can_speed = '';
var t_acc_engaged = '';

var t_inbound_binary_msg = '';
var t_outbound_binary_msg = '';

//Interface manager - getDriverswithCapabilities call are asynchronous so putting logic to wait.
var bGetDriversWithCapCalled = false;
var getDriversWithCap_counter = 0;
var getDriversWithCap_max_trial = 10;

// Services
var s_get_available_routes = 'get_available_routes';
var s_set_active_route = 'set_active_route';
var s_start_active_route = 'start_active_route';
var s_get_system_version = 'get_system_version';
var s_get_registered_plugins = 'plugins/get_registered_plugins';
var s_activate_plugins = 'plugins/activate_plugin';
var s_set_guidance_active = 'set_guidance_active';

// Params
var p_host_instructions = '/saxton_cav/ui/host_instructions';
var p_page_refresh_interval = '/saxton_cav/ui/page_refresh_interval';

// ROS related
var ros = new ROSLIB.Ros();
var listenerPluginAvailability;
var listenerSystemAlert;

// Counters and Flags
var cnt_log_lines = 0;
var ready_counter = 0;
var ready_max_trial = 10;
var sound_counter = 0;
var sound_counter_max = 3; //max # of times the sounds will be repeated.
var sound_played_once = false;
var isModalPopupShowing = false;
var waitingForRouteStateSegmentStartup = false;
var timer;
var engaged_timer = '00h 00m 00s'; //timer starts after vehicle first engages.
var host_instructions = '';


//Elements frequently accessed.
var divCapabilitiesMessage = document.getElementById('divCapabilitiesMessage');
var audioElements = document.getElementsByTagName('audio');

//Constants
var MAX_LOG_LINES = 100;
var METER_TO_MPH = 2.23694;
var METER_TO_MILE = 0.000621371;

//Get the drivers topic from Interface Manager
var serviceClientForGetDriversWithCap = new ROSLIB.Service({
  ros: ros,
  name: t_get_drivers_with_capabilities,
  serviceType: 'cav_srvs/GetDriversWithCapabilities'
});

//Getters and Setters for bool and string session variables.
var isGuidance = {
    get active() {
        var isGuidanceActive = sessionStorage.getItem('isGuidanceActive');
        var value = false;

        if (isGuidanceActive != 'undefined' && isGuidanceActive != null && isGuidanceActive != '') {
            if (isGuidanceActive == 'true')
                value = true;
        }
        //console.log('get active - isGuidanceActive: ' + isGuidanceActive + ' ; value: ' + value + ' ; Boolean:' + Boolean(isGuidanceActive));
        return value;
    },
    set active(newValue) {
        sessionStorage.setItem('isGuidanceActive', newValue);
        //console.log('set active: ' + newValue + ' ; Boolean:' + Boolean(newValue));
    },
    get engaged() {
        var isGuidanceEngaged = sessionStorage.getItem('isGuidanceEngaged');
        var value = false;

        if (isGuidanceEngaged != 'undefined' && isGuidanceEngaged != null && isGuidanceEngaged != '') {
            if (isGuidanceEngaged == 'true')
                value = true;
        }
        //console.log('get engaged  - isGuidanceEngaged: ' + isGuidanceEngaged + ' ; value: ' + value + ' ; Boolean:' + Boolean(isGuidanceEngaged));
        return value;
    },
    set engaged(newValue) {
        sessionStorage.setItem('isGuidanceEngaged', newValue);
        //console.log('set engaged: ' + newValue + ' ; Boolean:' + Boolean(newValue));
    },
    remove() {
        sessionStorage.removeItem('isGuidanceActive');
        sessionStorage.removeItem('isGuidanceEngaged');
    }
};

var isSystemAlert = {
    get ready() {
        var isSystemAlert = sessionStorage.getItem('isSystemAlert');
        var value = false;

        //Issue with Boolean returning opposite value, therefore doing manual check.
        if (isSystemAlert != 'undefined' && isSystemAlert != null && isSystemAlert != '') {
            if (isSystemAlert == 'true')
                value = true;
        }
        //console.log('get active - isSystemAlert: ' + isSystemAlert + ' ; value: ' + value + ' ; Boolean:' + Boolean(isSystemAlert));
        return value;
    },
    set ready(newValue) {
        sessionStorage.setItem('isSystemAlert', newValue);
        //console.log('set active: ' + newValue + ' ; Boolean:' + Boolean(newValue));
    },
    remove() {
        sessionStorage.removeItem('isSystemAlert');
    }
};

var startDateTime = {//startDateTime
    get value() {
        var startDateTime = sessionStorage.getItem('startDateTime');
        //console.log('get startDateTime ORIG: ' + startDateTime);
        if (startDateTime == 'undefined' || startDateTime == null || startDateTime == '') {
            this.start();
            startDateTime = sessionStorage.getItem('startDateTime');
        }

        //console.log('get startDateTime FINAL: ' + startDateTime);
        return startDateTime;
    },
    set value(newValue) {
        sessionStorage.setItem('startDateTime', newValue);
        //console.log('set startDateTime: ' + newValue);
    },
    remove() {
        sessionStorage.removeItem('startDateTime');
    },
    start() {
        sessionStorage.setItem('startDateTime', new Date().getTime());
    }
};

var selectedRoute = {
    get name() {
        var selectedRouteName = sessionStorage.getItem('selectedRouteName');

        //console.log('get selectedRouteName INITIAL: ' + selectedRouteName);

        if (selectedRouteName == 'undefined' || selectedRouteName == null || selectedRouteName.length == 0) {
            selectedRouteName = 'No Route Selected';
        }

        //console.log('get selectedRouteName FINAL: ' + selectedRouteName);

        return selectedRouteName;
    },
    set name(newValue) {
        sessionStorage.setItem('selectedRouteName', newValue);
        //console.log('set selectedRouteName: ' + newValue);
    },
    remove() {
        sessionStorage.removeItem('selectedRouteName');
    }
};

/*
* Custom sleep used in enabling guidance
*/
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/*
* Connection to ROS
*/
function connectToROS() {

    var isConnected = false;

    try {
        // If there is an error on the backend, an 'error' emit will be emitted.
        ros.on('error', function (error) {
            document.getElementById('divLog').innerHTML += '<br/> ROS Connection Error.';
            divCapabilitiesMessage.innerHTML = 'Sorry, unable to connect to ROS server, please refresh your page to try again or contact your System Admin.';
            console.log(error);

            document.getElementById('connecting').style.display = 'none';
            document.getElementById('connected').style.display = 'none';
            document.getElementById('closed').style.display = 'none';
            document.getElementById('error').style.display = 'inline';

        });

        // Find out exactly when we made a connection.
        ros.on('connection', function () {
            document.getElementById('divLog').innerHTML += '<br/> ROS Connection Made.';
            document.getElementById('connecting').style.display = 'none';
            document.getElementById('error').style.display = 'none';
            document.getElementById('closed').style.display = 'none';
            document.getElementById('connected').style.display = 'inline';

            //After connecting on first load or refresh, evaluate at what step the user is at.
            evaluateNextStep();
        });

        ros.on('close', function () {

            document.getElementById('divLog').innerHTML += '<br/> ROS Connection Closed.';
            document.getElementById('connecting').style.display = 'none';
            document.getElementById('connected').style.display = 'none';
            document.getElementById('closed').style.display = 'inline';

            //Show modal popup for when ROS connection has been abruptly closed.
            var messageTypeFullDescription = 'ROS Connection Closed.';
            messageTypeFullDescription += '<br/><br/>PLEASE TAKE MANUAL CONTROL OF THE VEHICLE.';
            showModal(true, messageTypeFullDescription, false);

        });

        // Create a connection to the rosbridge WebSocket server.
        ros.connect('ws://' + ip + ':9090');

    }
    catch (err) {
        divCapabilitiesMessage.innerHTML = 'Unexpected Error. Sorry, unable to connect to ROS server, please refresh your page to try again or contact your System Admin.';
        console.log(err);
    }
}



/**
* Check System Alerts from Interface Manager
**/
function checkSystemAlerts() {

    // Subscribing to a Topic
    listenerSystemAlert = new ROSLIB.Topic({
        ros: ros,
        name: t_system_alert,
        messageType: 'cav_msgs/SystemAlert'
    });

    // Then we add a callback to be called every time a message is published on this topic.
    listenerSystemAlert.subscribe(function (message) {

        var messageTypeFullDescription = 'NA';

        switch (message.type) {
            case 1:
                messageTypeFullDescription = 'System received a CAUTION message. ' + message.description;
                break;
            case 2:
                messageTypeFullDescription = 'System received a WARNING message. ' + message.description;
                break;
            case 3:
                //Show modal popup for Fatal alerts.
                messageTypeFullDescription = 'System received a FATAL message. Please wait for system to shut down. <br/><br/>' + message.description;
                messageTypeFullDescription += '<br/><br/>PLEASE TAKE MANUAL CONTROL OF THE VEHICLE.';
                listenerSystemAlert.unsubscribe();
                showModal(true, messageTypeFullDescription, false);
                break;
            case 4:
                isSystemAlert.ready = false;
                messageTypeFullDescription = 'System is not ready, please wait and try again. ' + message.description;
                break;
            case 5:
                isSystemAlert.ready = true;
                messageTypeFullDescription = 'System is ready. ' + message.description;
                break;
            case 6: // SHUTDOWN
                isSystemAlert.ready = false;
                listenerSystemAlert.unsubscribe();
                break;
            default:
                messageTypeFullDescription = 'System alert type is unknown. Assuming system it not yet ready.  ' + message.description;
        }

        if (cnt_log_lines < MAX_LOG_LINES) {
            document.getElementById('divLog').innerHTML += '<br/> ' + messageTypeFullDescription;
            cnt_log_lines++;
        }
        else {
            document.getElementById('divLog').innerHTML = messageTypeFullDescription;
            cnt_log_lines = 0;
        }

        //Show the rest of the system alert messages in the log.
        //Make sure message list is scrolled to the bottom
        var container = document.getElementById('divLog');
        var containerHeight = container.clientHeight;
        var contentHeight = container.scrollHeight;
        container.scrollTop = contentHeight - containerHeight;
    });
}

/*
 Show user the available route options.
*/
function showRouteOptions() {

    divCapabilitiesMessage.innerHTML = 'Awaiting the list of available routes...'

    // Create a Service client with details of the service's name and service type.
    var getAvailableRoutesClient = new ROSLIB.Service({
        ros: ros,
        name: s_get_available_routes,
        serviceType: 'cav_srvs/GetAvailableRoutes'
    });

    // Create a Service Request with no arguments.
    var request = new ROSLIB.ServiceRequest({

    });

    // Call the service and get back the results in the callback.
    // The result is a ROSLIB.ServiceResponse object.
    getAvailableRoutesClient.callService(request, function (result) {

        divCapabilitiesMessage.innerHTML = 'Please select a route.';

        //Reset and Hide the Capabilities section
        var divSubCapabilities = document.getElementById('divSubCapabilities');
        divSubCapabilities.style.display = 'none';
        divSubCapabilities.innerHTML = '';

        //Dispay the Route selection.
        var myRoutes = result.availableRoutes;
        var divRoutes = document.getElementById('divRoutes');
        divRoutes.innerHTML = '';
        divRoutes.style.display = 'block'; //Show the route section

        for (i = 0; i < myRoutes.length; i++) {
            createRadioElement(divRoutes, myRoutes[i].routeID, myRoutes[i].routeName, myRoutes.length, 'groupRoutes', myRoutes[i].valid);
        }

        if (myRoutes.length == 0) {
            divCapabilitiesMessage.innerHTML = 'Sorry, there are no available routes, and cannot proceed without one. <br/> Please contact your System Admin.';
        }

    });
}

/*
 Set the route once based on user selection.
*/
function setRoute(id) {

    // Calling setActiveRoute service
    var setActiveRouteClient = new ROSLIB.Service({
        ros: ros,
        name: s_set_active_route,
        serviceType: 'cav_srvs/SetActiveRoute'
    });

    //TODO: Remove this when Route Manager has updated the RouteID to not have spaces. For now have to do this.
    var selectedRouteid = id.toString().replace('rb', '').replace(/_/g, ' ');

    // Then we create a Service Request.
    // replace rb with empty string and underscore with space to go back to original ID from topic.
    var request = new ROSLIB.ServiceRequest({
        routeID: selectedRouteid
    });

    //Selected Route
    var rbRoute = document.getElementById(id.toString());

    var ErrorStatus = {
        NO_ERROR: { value: 0, text: 'NO_ERROR' },
        NO_ROUTE: { value: 1, text: 'NO_ROUTE' },
    };

    // Call the service and get back the results in the callback.
    setActiveRouteClient.callService(request, function (result) {
        if (result.errorStatus == ErrorStatus.NO_ROUTE.value) {
            divCapabilitiesMessage.innerHTML = 'Setting the active route failed (' + ErrorStatus.NO_ROUTE.text + '). <br/> Please try again.';
            insertNewTableRow('tblSecondA', 'Error Code', result.ErrorStatus.NO_ROUTE.text);

            //Allow user to select it again.
            rbRoute.checked = false;
        }
        else { //Call succeeded

            //After activating the route, start_active_route.
            //TODO: Discuss if start_active_route can be automatically determined and done by Route Manager in next iteration?
            //      Route selection is done first and set only once.
            //      Once selected, it wouldn't be activated until at least 1 Plugin is selected (based on Route).
            //      Only when a route is selected and at least one plugin is selected, could Guidance be Engaged.
            startActiveRoute(id);

            //Subscribe to active route to map the segments
            showActiveRoute();
        }
    });
}

/*
Start Active Route
*/
function startActiveRoute(id) {

    var ErrorStatus = {
        NO_ERROR: { value: 0, text: 'NO_ERROR' },
        NO_ACTIVE_ROUTE: { value: 1, text: 'NO_ACTIVE_ROUTE' },
        INVALID_STARTING_LOCATION: { value: 2, text: 'INVALID_STARTING_LOCATION' },
        ALREADY_FOLLOWING_ROUTE: { value: 3, text: 'ALREADY_FOLLOWING_ROUTE' },
    };

    // Calling setActiveRoute service
    var startActiveRouteClient = new ROSLIB.Service({
        ros: ros,
        name: s_start_active_route,
        serviceType: 'cav_srvs/StartActiveRoute'
    });

    // Then we create a Service Request.
    var request = new ROSLIB.ServiceRequest({
    });

    // Call the service and get back the results in the callback.
    startActiveRouteClient.callService(request, function (result) {

        var errorDescription = '';

        switch (result.errorStatus) {
            case ErrorStatus.NO_ERROR.value:
            case ErrorStatus.ALREADY_FOLLOWING_ROUTE.value:
                showSubCapabilitiesView(id);
                break;
            case ErrorStatus.NO_ACTIVE_ROUTE.value:
                errorDescription = ErrorStatus.ALREADY_FOLLOWING_ROUTE.text;
                break;
            case ErrorStatus.INVALID_STARTING_LOCATION.value:
                errorDescription = ErrorStatus.INVALID_STARTING_LOCATION.text;
                break;
            default: //unexpected value or error
                errorDescription = result.errorStatus; //print the number;
                break;
        }

        if (errorDescription != '') {
            divCapabilitiesMessage.innerHTML = 'Starting the active the route failed (' + errorDescription + '). <br/> Please try again or contact your System Administrator.';
            insertNewTableRow('tblSecondA', 'Error Code', errorDescription);

            //Allow user to select the route again
            var rbRoute = document.getElementById(id.toString());
            rbRoute.checked = false;
        }
    });
}

/*
    After capabilities is initially selected, store route name and the plugin list.
*/
function showSubCapabilitiesView(id) {

    var labelId = id.toString().replace('rb', 'lbl');
    var lblRoute = document.getElementById(labelId);

    if (lblRoute == null)
        return;

    selectedRoute.name = lblRoute.innerHTML;

    showSubCapabilitiesView2();
}

/*
    If route has been selected, show the Route Info and plugin options.
*/
function showSubCapabilitiesView2() {

    //if route hasn't been selected, skip
    if (selectedRoute.name == 'No Route Selected')
        return;

    divCapabilitiesMessage.innerHTML = 'Selected route is " ' + selectedRoute.name + '". <br/>';

    //Hide the Route selection
    var divRoutes = document.getElementById('divRoutes');
    divRoutes.style.display = 'none';

    //Display the list of Plugins
    var divSubCapabilities = document.getElementById('divSubCapabilities');
    divSubCapabilities.style.display = 'block';

    if (waitingForRouteStateSegmentStartup == false) {
        //Need to wait for route current segment to publish to not get negative total lengths.
        setTimeout(function () {
            checkRouteInfo();
            //console.log('Wait call for checkRouteInfo.');
            waitingForRouteStateSegmentStartup = true;
        }, 5000);
    }
    else {
        checkRouteInfo();
    }

    //console.log('showPluginOptions called.');
    showPluginOptions();
}
/*
 Show user the registered plugins.
*/
function showPluginOptions() {

    divCapabilitiesMessage.innerHTML += 'Please select one or more capabilities to activate. ';

    // Create a Service client with details of the service's name and service type.
    var getRegisteredPluginsClient = new ROSLIB.Service({
        ros: ros,
        name: s_get_registered_plugins,
        serviceType: 'cav_srvs/PluginList'
    });

    // Create a Service Request.
    var request = new ROSLIB.ServiceRequest({});

    // Call the service and get back the results in the callback.
    getRegisteredPluginsClient.callService(request, function (result) {

        var pluginList = result.plugins;
        var divSubCapabilities = document.getElementById('divSubCapabilities');

        for (i = 0; i < pluginList.length; i++) {

            var cbTitle = pluginList[i].name + ' ' + pluginList[i].versionId + ' (' + pluginList[i].name.trim().match(/\b(\w)/g).join('') + ')'; //get abbreviation;
            var cbId = pluginList[i].name.replace(/\s/g, '_') + '&' + pluginList[i].versionId.replace(/\./g, '_');
            var isChecked = pluginList[i].activated;
            var isRequired = pluginList[i].required;

            //Create the checkbox based on the plugin properties.
            createCheckboxElement(divSubCapabilities, cbId, cbTitle, pluginList.length, 'groupPlugins', isChecked, isRequired, 'activatePlugin');

            //Call Carma Widget to activate for selection for required plugins that are pre-checked.
            //if (Boolean(isChecked) == true)
            //{
                CarmaJS.WidgetFramework.activatePlugin(cbId, cbTitle, isChecked);
            //}
        }

        //If no selection available.
        if (pluginList.length == 0) {
            divCapabilitiesMessage.innerHTML = 'Sorry, there are no selection available, and cannot proceed without one. <br/> Please contact your System Admin.';
        }

        //Enable the CAV Guidance button if plugins are selected
        enableGuidance();
    });
}

/*
  Activate the plugin based on user selection.
*/
function activatePlugin(id) {

    var cbCapabilities = document.getElementById(id);
    var lblCapabilities = document.getElementById(id.toString().replace('cb', 'lbl'));

    //NOTE: Already set by browser to have NEW checked value.
    var newStatus = cbCapabilities.checked;

    //If the plugin is required to be on all times, it cannot be deactivated by the user, so need to notify users with a specific message.
    //Regardless, the call to activate plugin will fail.
    if (newStatus == false && lblCapabilities.innerHTML.indexOf('*') > 0) {
        divCapabilitiesMessage.innerHTML = 'Sorry, this capability is required. It cannot be deactivated.';
        //Need to set it back to original value.
        cbCapabilities.checked = !newStatus;
        return;
    }

    // If guidance is engaged, at least 1 plugin must be selected.
    if (isGuidance.engaged == true) {
        var divSubCapabilities = document.getElementById('divSubCapabilities');
        var cntCapabilitiesSelected = getCheckboxesSelected(divSubCapabilities).length;

        if (cntCapabilitiesSelected == 0) {
            divCapabilitiesMessage.innerHTML = 'Sorry, CAV Guidance is engaged and there must be at least one active capability.'
                + '<br/>You can choose to dis-engage to deactivate all capablities.';

            //Need to set it back to original value.
            cbCapabilities.checked = !newStatus;
            return;
        }
    }

    // Calling service
    var activatePluginClient = new ROSLIB.Service({
        ros: ros,
        name: s_activate_plugins,
        serviceType: 'cav_srvs/PluginActivation'
    });

    // Get name and version.
    var splitValue = id.replace('cb', '').split('&');
    var name = splitValue[0].replace(/\_/g, ' ');
    var version = splitValue[1].replace(/\_/g, '.');

    // Setup the request.
    var request = new ROSLIB.ServiceRequest({
        header: {
            seq: 0
            , stamp: Date.now()
            , frame_id: ''
        },
        pluginName: name,
        pluginVersion: version,
        activated: newStatus
    });

    // If it did NOT get into the callService below, need to set it back.
    cbCapabilities.checked = !newStatus;

    // Call the service and get back the results in the callback.
    activatePluginClient.callService(request, function (result) {

        if (result.newState != newStatus) //Failed
        {
            divCapabilitiesMessage.innerHTML = 'Activating the capability failed, please try again.';
        }
        else {
            var divSubCapabilities = document.getElementById('divSubCapabilities');
            divSubCapabilities.style.display = 'block';
            divCapabilitiesMessage.innerHTML = 'Please select one or more capabilities to activate.';
        }

        //Set to new state set by the PluginManager.
        cbCapabilities.checked = result.newState;

        if (cbCapabilities.checked == false) {
            lblCapabilities.style.backgroundColor = 'gray';
        }
        else if (cbCapabilities.checked == true) {
            lblCapabilities.style.backgroundColor = 'cornflowerblue';
        }

        //Call the widget fw to activate for selection.
        var cbTitle = name + ' ' + version;
        var cbId = id.substring(2,id.length);

        //Populate list for Widget Options.
        CarmaJS.WidgetFramework.activatePlugin(cbId, cbTitle, cbCapabilities.checked);

        //Enable the CAV Guidance button if plugins are selected
        enableGuidance();
    });
}


/*
    Enable the Guidance if at least 1 capability is selected.
    NOTE: This should only be called after route has been selected.
*/
function enableGuidance() {

    //Subscribe to guidance/state.
    checkGuidanceState();

    var divSubCapabilities = document.getElementById('divSubCapabilities');
    var cntSelectedPlugins = getCheckboxesSelected(divSubCapabilities).length;
    var cntSelectedWidgets = CarmaJS.WidgetFramework.countSelectedWidgets();

    //If more than on plugin is selected, enable button.
    if (cntSelectedPlugins > 0 && cntSelectedWidgets > 0) {
        //If guidance is engage, leave as green.
        //Else if not engaged, set to blue.
        if (isGuidance.engaged == false) {
            setCAVButtonState('ENABLED');
            divCapabilitiesMessage.innerHTML += '<br/>' + host_instructions;
        }

        //Load Widgets
        //CarmaJS.WidgetFramework.showWidgetOptions();
        //CarmaJS.WidgetFramework.loadWidgets();
    }
    else {//else if no plugins have been selected, disable button.
        setCAVButtonState('DISABLED');

        if (cntSelectedPlugins > 0)
            CarmaJS.WidgetFramework.showWidgetOptions();

        if (cntSelectedWidgets == 0 )
        {
            if (divCapabilitiesMessage.innerHTML.indexOf('Please go to Driver View to select Widgets') == -1)
                divCapabilitiesMessage.innerHTML += '<br/> Please go to Driver View to select Widgets.';
        }
    }
}

/*
    To activate and de-activate guidance.
    NOTE:
    1) Setting active=true is not the same as engaging. Guidance has to issue engage status based on other criteria.
    2) Setting active=false is the same as disengaging.
*/
function activateGuidance() {

    //audio-fix needs to be on an actual button click event on the tablet.
    loadAudioElements();

    ////Sets the new status OPPOSITE to the current value.
    var newStatus = !isGuidance.active;

    //Call the service to engage guidance.
    var setGuidanceClient = new ROSLIB.Service({
        ros: ros,
        name: s_set_guidance_active,
        serviceType: 'cav_srvs/SetGuidanceActive'
    });

    //Setup the request.
    var request = new ROSLIB.ServiceRequest({
        guidance_active: newStatus
    });

    // Call the service and get back the results in the callback.
    setGuidanceClient.callService(request, function (result) {

        if (Boolean(result.guidance_status) != newStatus) //NOT SUCCESSFUL.
        {
            divCapabilitiesMessage.innerHTML = 'Guidance failed to set the value, please try again.';
            return;
        }

        //When active = false, this is equivalent to disengaging guidance. Would not be INACTIVE since inactivity is set by guidance.
        if (newStatus == false)
        {
            setCAVButtonState('DISENGAGED');
            return;
        }

        //Open to DriveView tab after activating and show the widget options.
        //checkAvailability will call setCAVButtonState
        if (newStatus == true){
            openTab(event, 'divDriverView');
            CarmaJS.WidgetFramework.loadWidgets(); //Just loads the widget
            checkAvailability(); //Start checking availability (or re-subscribe) if Guidance has been engaged.
            checkRobotEnabled(); //Start checking if Robot is active
            return;
        }
    });
}

/*
    Change status and format the CAV button
*/
function setCAVButtonState(state) {

    var btnCAVGuidance = document.getElementById('btnCAVGuidance');

    switch (state) {

        case 'ENABLED': // equivalent READY where user has selected 1 route and at least 1 plugin.
            btnCAVGuidance.disabled = false;
            btnCAVGuidance.className = 'button_cav button_enabled'; //color to blue
            btnCAVGuidance.title = 'Start CAV Guidance';
            btnCAVGuidance.innerHTML = 'CAV Guidance - READY <i class="fa fa-thumbs-o-up"></i>';

            isGuidance.active = false;
            isGuidance.engaged = false;

            break;
        case 'DISABLED': // equivalent NOT READY awaiting user selection.
            btnCAVGuidance.disabled = true;
            btnCAVGuidance.className = 'button_cav button_disabled'; //color to gray
            btnCAVGuidance.title = 'CAV Guidance is disabled.';
            btnCAVGuidance.innerHTML = 'CAV Guidance';

            isGuidance.active = false;
            isGuidance.engaged = false;

            break;
        case 'ACTIVE':
            btnCAVGuidance.disabled = false;
            btnCAVGuidance.className = 'button_cav button_active'; //color to purple
            btnCAVGuidance.title = 'CAV Guidance is now active.';
            btnCAVGuidance.innerHTML = 'CAV Guidance - ACTIVE <i class="fa fa-check"></i>';

            isGuidance.active = true;
            isGuidance.engaged = false;

            break;
        case 'INACTIVE':  //robot_active is inactive
            btnCAVGuidance.disabled = false;
            btnCAVGuidance.className = 'button_cav button_inactive'; // color to orange
            btnCAVGuidance.title = 'CAV Guidance status is inactive.';
            btnCAVGuidance.innerHTML = 'CAV Guidance - INACTIVE <i class="fa fa-times-circle-o"></i>';

            isGuidance.active = false;
            //isGuidance.engaged = false; //LEAVE value as-is.

            //This check to make sure inactive sound is only played once even when it's been published multiple times in a row.
            //It will get reset when status changes back to engage.
            if (sound_played_once == false) {
                playSound('audioAlert3', false);
                sound_played_once = true; //sound has already been played once.
            }
            break;
        case 'ENGAGED':
            btnCAVGuidance.disabled = false;
            btnCAVGuidance.className = 'button_cav button_engaged'; // color to green.

            btnCAVGuidance.title = 'Click to Stop CAV Guidance.';
            btnCAVGuidance.innerHTML = 'CAV Guidance - ENGAGED <i class="fa fa-check-circle-o"></i>';

            isGuidance.active = true;
            isGuidance.engaged = true;

            //reset to replay inactive sound if it comes back again.
            sound_played_once = false;

            break;
        case 'DISENGAGED':
            btnCAVGuidance.disabled = false;
            btnCAVGuidance.className = 'button_cav button_disabled';

            //Update the button title
            btnCAVGuidance.title = 'Start CAV Guidance';
            btnCAVGuidance.innerHTML = 'CAV Guidance - DISENGAGED <i class="fa fa-stop-circle-o"></i>';

            isGuidance.active = false;
            isGuidance.engaged = false;

            //When disengaging, mark all selected plugins to gray.
            setCbSelectedBgColor('gray');

            //Unsubscribe from the topic when dis-engaging from guidance.
            if (listenerPluginAvailability != 'undefined' && listenerPluginAvailability != null)
                listenerPluginAvailability.unsubscribe();

            //AFTER dis-engaging, redirect to a page. Guidance is sending all the nodes to stop.
            //Currently, only way to re-engage would be to re-run the roslaunch file.
            //Discussed that UI DOES NOT need to wait to disconnect and redirect to show any shutdown errors from Guidance.
            showModal(true, 'You are disengaging guidance. <br/> <br/> PLEASE TAKE MANUAL CONTROL OF THE VEHICLE.', true);

            break;
        default:
            break;
    }
}

/**
* Check Guidance State
**/
function checkGuidanceState() {

    // Subscribing to a Topic
    listenerGuidanceState = new ROSLIB.Topic({
        ros: ros,
        name: t_guidance_state,
        messageType: 'cav_msgs/GuidanceState'
    });

    // Then we add a callback to be called every time a message is published on this topic.
    /*
    uint8 STARTUP = 1
    uint8 DRIVERS_READY = 2
    uint8 ACTIVE = 3
    uint8 ENGAGED = 4
    uint8 INACTIVE = 5
    uint8 SHUTDOWN = 0
    */
    listenerGuidanceState.subscribe(function (message) {

        var messageTypeFullDescription = divCapabilitiesMessage.innerHTML;

        switch (message.state) {
            case 1: //STARTUP
                messageTypeFullDescription = 'Guidance is starting up.';
                break;
            case 2: //DRIVERS_READY
                break;
            case 3: //ACTIVE
                messageTypeFullDescription = 'Guidance is now ACTIVE.';
                setCAVButtonState('ACTIVE');
                break;
            case 4: //ENGAGED
                //start the timer when it first engages.
                messageTypeFullDescription = 'Guidance is now ENGAGED.';
                startEngagedTimer();
                setCAVButtonState('ENGAGED');
                break;
            case 5: //INACTIVE
                //Set based on whatever guidance_state says, regardless if UI has not been engaged yet.
                messageTypeFullDescription = 'CAV Guidance is INACTIVE. <br/> To re-engage, double tap the ACC switch downward on the steering wheel.';
                setCAVButtonState('INACTIVE');
                break;
            case 0: //SHUTDOWN
                //Show modal popup for Shutdown alerts from Guidance, which is equivalent to Fatal since it cannot restart with this state.
                messageTypeFullDescription = 'System received a Guidance SHUTDOWN. <br/><br/>' + message.description;
                messageTypeFullDescription += '<br/><br/>PLEASE TAKE MANUAL CONTROL OF THE VEHICLE.';

                if(listenerSystemAlert != null && listenerSystemAlert != 'undefined')
                    listenerSystemAlert.unsubscribe();

                showModal(true, messageTypeFullDescription, false);
                break;
            default:
                messageTypeFullDescription = 'System alert type is unknown. Assuming system it not yet ready.  ' + message.description;
        }

        divCapabilitiesMessage.innerHTML = messageTypeFullDescription;
    });
}

/*
 Check for availability when Guidance is engaged
*/
function checkAvailability() {
    //Subscribing to a Topic
    listenerPluginAvailability = new ROSLIB.Topic({
        ros: ros,
        name: t_available_plugins,
        messageType: 'cav_msgs/PluginList'
    });

    // Then we add a callback to be called every time a message is published on this topic.
    listenerPluginAvailability.subscribe(function (pluginList) {

        //If nothing on the list, set all selected checkboxes back to blue (or active).
        if (pluginList == null || pluginList.plugins.length == 0) {
            setCbSelectedBgColor('cornflowerblue');
            return;
        }

        pluginList.plugins.forEach(showAvailablePlugin);

    });//listener
}

/*
    Loop through each available plugin
*/
function showAvailablePlugin(plugin) {

    var cbTitle = plugin.name + ' ' + plugin.versionId;
    var cbId = plugin.name.replace(/\s/g, '_') + '&' + plugin.versionId.replace(/\./g, '_');
    var isActivated = plugin.activated;
    var isAvailable = plugin.available;

    //If available, set to green.
    if (isAvailable == true) {
        setCbBgColor(cbId, '#4CAF50');
    }
    else //if not available, go back to blue.
    {
        setCbBgColor(cbId, 'cornflowerblue');
    }
}

/*
    Get all parameters for display.
*/
function getParams() {

    ros.getParams(function (params) {
        params.forEach(printParam); //Print each param into the log view.
    });

}

/*
 forEach function to print the parameter listing.
*/
function printParam(itemName, index) {

    if (itemName.startsWith('/ros') == false) {
        //Sample call to get param.
        var myParam = new ROSLIB.Param({
            ros: ros,
            name: itemName
        });

        myParam.get(function (myValue) {

            //Commented out for now to only show system alerts on divLog.
            //document.getElementById('divLog').innerHTML += '<br/> Param index[' + index + ']: ' + itemName + ': value: ' + myValue + '.';

            if (itemName == p_host_instructions && myValue != null) {
                host_instructions = myValue;
            }
        });
    }
}

/*
    Check for Robot State
    If no longer active, show the Guidance as Yellow. If active, show Guidance as green.
*/
function checkRobotEnabled() {

    var driverList = [];

    //controller
    driverList.push(tbn_robot_status);

    // Create a Service Request
    var request = new ROSLIB.ServiceRequest({
    capabilities: driverList
    });

    // Call the service and get back the results in the callback.
    serviceClientForGetDriversWithCap.callService(request, function (result) {

        if (result.driver_data.length == 0)
        {
            console.log('getDriversWithCapabilities() returned no CONTROLLER driver for robot_status: ' + result.driver_data.length);
            return;
        }

        //JS ES6 syntax to assign the fully qualified name of the topic to the specific variable.
        t_robot_status = result.driver_data.find(element => element.endsWith(tbn_robot_status));

        //console.log('t_robot_status:' + t_robot_status);

        var listenerRobotStatus = new ROSLIB.Topic({
            ros: ros,
            name: t_robot_status,
            messageType: 'cav_msgs/RobotEnabled'
        });

        //Issue #606 - removed the dependency on UI state on robot_status. Only show on Status tab.
        listenerRobotStatus.subscribe(function (message) {
            insertNewTableRow('tblFirstB', 'Robot Active', message.robot_active);
            insertNewTableRow('tblFirstB', 'Robot Enabled', message.robot_enabled);
        });
    });
}


/*
   Log for Diagnostics
*/
function showDiagnostics() {

    var driverList = [];

    //controller
      driverList.push(tbn_acc_engaged);

      request = new ROSLIB.ServiceRequest({
            capabilities: driverList
      });

      // Call the service and get back the results in the callback.
      serviceClientForGetDriversWithCap.callService(request, function (result) {

            if (result.driver_data.length == 0)
            {
                console.log('getDriversWithCapabilities() returned no CAN drivers for acc_engaged: ' + result.driver_data.length);
                return;
            }

            //JS ES6 syntax to assign the fully qualified name of the topic to the specific variable.

            t_acc_engaged = result.driver_data.find(element => element.endsWith(tbn_acc_engaged));

            //console.log('t_acc_engaged:' + t_acc_engaged  );

            var listenerACCEngaged = new ROSLIB.Topic({
                ros: ros,
                name: t_acc_engaged,
                messageType: 'std_msgs/Bool'
            });

            listenerACCEngaged.subscribe(function (message) {
                insertNewTableRow('tblFirstB', 'ACC Engaged', message.data);
            });

            var listenerDiagnostics = new ROSLIB.Topic({
                ros: ros,
                name: t_diagnostics,
                messageType: 'diagnostic_msgs/DiagnosticArray'
            });

            listenerDiagnostics.subscribe(function (messageList) {

                messageList.status.forEach(
                    function (myStatus) {
                        insertNewTableRow('tblFirstA', 'Diagnostic Name', myStatus.name);
                        insertNewTableRow('tblFirstA', 'Diagnostic Message', myStatus.message);
                        insertNewTableRow('tblFirstA', 'Diagnostic Hardware ID', myStatus.hardware_id);

                        myStatus.values.forEach(
                            function (myValues) {
                                if (myValues.key == 'Primed') {
                                    insertNewTableRow('tblFirstB', myValues.key, myValues.value);
                                    var imgACCPrimed = document.getElementById('imgACCPrimed');

                                    if (myValues.value == 'True')
                                        imgACCPrimed.style.backgroundColor = '#4CAF50'; //Green
                                    else
                                        imgACCPrimed.style.backgroundColor = '#b32400'; //Red
                                }
                                // Commented out since Diagnostics key/value pair can be many and can change. Only subscribe to specific ones.
                                // insertNewTableRow('tblFirstA', myValues.key, myValues.value);
                            }); //foreach
                    }
                );//foreach
            });

    });

}

/*
    Show Drivers Status for PinPoint.
*/
function showDriverStatus() {

    var listenerDriverDiscovery = new ROSLIB.Topic({
        ros: ros,
        name: t_driver_discovery,
        messageType: 'cav_msgs/DriverStatus'
    });

    listenerDriverDiscovery.subscribe(function (message) {

        var targetImg;

        //Get PinPoint status for now.
        if (message.position == true) {
            targetImg = document.getElementById('imgPinPoint');
        }

        if (targetImg == null || targetImg == 'undefined')
            return;

        switch (message.status) {
            case 0: //OFF
                targetImg.style.color = '';
                break;
            case 1: //OPERATIONAL
                targetImg.style.color = '#4CAF50'; //Green
                break;
            case 2: //DEGRADED
                targetImg.style.color = '#ff6600'; //Orange
                break;
            case 3: //FAULT
                targetImg.style.color = '#b32400'; //Red
                break;
            default:
                break;
        }
    });
}

/*
    Show which plugins are controlling the lateral and longitudinal manuevers.
*/
function showControllingPlugins()
{
        var listenerControllingPlugins = new ROSLIB.Topic({
            ros: ros,
            name: t_controlling_plugins,
            messageType: 'cav_msgs/ActiveManeuvers'
        });

        listenerControllingPlugins.subscribe(function (message) {
            insertNewTableRow('tblFirstB', 'Lon Plugin', message.longitudinal_plugin);
            insertNewTableRow('tblFirstB', 'Lon Manuever', message.longitudinal_maneuver);
            insertNewTableRow('tblFirstB', 'Lon Start Dist', message.longitudinal_start_dist.toFixed(6));
            insertNewTableRow('tblFirstB', 'Lon End Dist', message.longitudinal_end_dist.toFixed(6));
            insertNewTableRow('tblFirstB', 'Lat Plugin', message.lateral_plugin);
            insertNewTableRow('tblFirstB', 'Lat Maneuver', message.lateral_maneuver);
            insertNewTableRow('tblFirstB', 'Lat Start Dist', message.lateral_start_dist.toFixed(6));
            insertNewTableRow('tblFirstB', 'Lat End Dist', message.lateral_end_dist.toFixed(6));

        //Longitudinal Controlling Plugin
        var spanLonPlugin = document.getElementById('spanLonPlugin');

        if (spanLonPlugin != null && spanLonPlugin != 'undefined'){
            if (message.longitudinal_plugin.trim().length > 0) {
                spanLonPlugin.innerHTML = message.longitudinal_plugin.trim().match(/\b(\w)/g).join(''); //abbreviation
            }
            else {
                spanLonPlugin.innerHTML = '';
            }
        }

        //Lateral Controlling Plugin
        var spanLatPlugin = document.getElementById('spanLatPlugin');

        if (spanLatPlugin != null && spanLatPlugin != 'undefined'){
            if (message.lateral_plugin.trim().length > 0) {
                spanLatPlugin.innerHTML = message.lateral_plugin.trim().match(/\b(\w)/g).join(''); //abbreviation
            }else{
                spanLatPlugin.innerHTML = '';
            }
        }
   });
}
/*
    Show the Lateral Control Driver message
*/
function checkLateralControlDriver() {

    var driverList = [];

    //controller
    driverList.push(tbn_lateral_control_driver);

    // Create a Service Request
    var request = new ROSLIB.ServiceRequest({
        capabilities: driverList
    });

    // Call the service and get back the results in the callback.
    serviceClientForGetDriversWithCap.callService(request, function (result) {

        if (result.driver_data.length == 0)
        {
            console.log('getDriversWithCapabilities() returned no MOCK driver for lateral_control_driver: ' + result.driver_data.length);
            return;
        }

        //JS ES6 syntax to assign the fully qualified name of the topic to the specific variable.
        t_lateral_control_driver = result.driver_data.find(element => element.endsWith(t_lateral_control_driver));

        //console.log('t_lateral_control_driver:' + t_lateral_control_driver);

        //Subscription
        var listenerLateralControl = new ROSLIB.Topic({
            ros: ros,
            name: t_lateral_control_driver,
            messageType: 'cav_msgs/LateralControl'
        });

        listenerLateralControl.subscribe(function (message) {
            insertNewTableRow('tblFirstB', 'Lateral Axle Angle', message.axle_angle);
            insertNewTableRow('tblFirstB', 'Lateral Max Axle Angle Rate', message.max_axle_angle_rate);
            insertNewTableRow('tblFirstB', 'Lateral Max Accel', message.max_accel);
        });

    });
}

/*
    Show UI instructions
    NOTE: Currently UI instructions are handled at the carma level.
    TODO: Future this topic indicator to handle at carma and plugin level to allow plugin specific actions/icons. For now, will remain here.
*/
function showUIInstructions() {

    var UIInstructionsType = {
        INFO: { value: 0, text: 'INFO' }, //Notification of status or state change
        ACK_REQUIRED: { value: 1, text: 'ACK_REQUIRED' }, //A command requiring driver acknowledgement
        NO_ACK_REQUIRED: { value: 2, text: 'NO_ACK_REQUIRED' }, //A command that does not require driver acknowledgement
    };

    // List out the expected commands to handle that applies at the carma level or generic enough.
    var UIExpectedCommands = {
        LEFT_LANE_CHANGE: { value: 0, text: 'LEFT_LANE_CHANGE' }, //From lateral controller driver
        RIGHT_LANE_CHANGE: { value: 1, text: 'RIGHT_LANE_CHANGE' }, //From lateral controller driver
        //Add new ones here.
    };

    var listenerUiInstructions = new ROSLIB.Topic({
        ros: ros,
        name: t_ui_instructions,
        messageType: 'cav_msgs/UIInstructions'
    });

    listenerUiInstructions.subscribe(function (message) {

        if (message.type == UIInstructionsType.INFO.value) {
            divCapabilitiesMessage.innerHTML = message.msg;
        }
        else {
            var msg = '';

            //NOTE: Currently handling lane change for it's icons
            switch (message.msg) {
                case UIExpectedCommands.LEFT_LANE_CHANGE.text:
                    msg = '<i class="fa fa-angle-left faa-flash animated faa-slow" aria-hidden="true" ></i>';
                    break;
                case UIExpectedCommands.RIGHT_LANE_CHANGE.text:
                    msg = '<i class="fa fa-angle-right faa-flash animated faa-slow" aria-hidden="true" ></i>';
                    break;
                default:
                    msg = message.msg; //text display only.
                    break;
            }

            if (message.type == UIInstructionsType.NO_ACK_REQUIRED.value)
                showModalNoAck(msg); // Show the icon or text  for 3 seconds.

            //Implement ACK_REQUIRED logic to call specific service.
            //For now, no custom icons for acknowledgement, simply YES/NO button. Later may have other options.
            if (message.type == UIInstructionsType.ACK_REQUIRED.value)
            {
                //Show popup to user for acknowledgement and send the response over to the specific plugin.
                showModalAck(msg, message.response_service);
            }
        }
    });

}

/*
    Watch out for route completed, and display the Route State in the System Status tab.
    Route state are only set and can be shown after Route has been selected.
*/
function checkRouteInfo() {

    //Get Route Event
    var listenerRouteEvent = new ROSLIB.Topic({
        ros: ros,
        name: t_route_event,
        messageType: 'cav_msgs/RouteEvent'
    });

    listenerRouteEvent.subscribe(function (message) {
        insertNewTableRow('tblSecondA', 'Route Event', message.event);

        //If completed, then route topic will publish something to guidance to shutdown.
        //For UI purpose, only need to notify the USER and show them that route has completed.
        //Allow user to be notified of route completed/left route even if guidance is not active/engaged.
        if (message.event == 3) //ROUTE_COMPLETED=3
        {
            showModal(false, 'ROUTE COMPLETED. <br/> <br/> PLEASE TAKE MANUAL CONTROL OF THE VEHICLE.', true);
        }

        if (message.event == 4)//LEFT_ROUTE=4
        {
            showModal(true, 'You have LEFT THE ROUTE. <br/> <br/> PLEASE TAKE MANUAL CONTROL OF THE VEHICLE.', true);
        }
    });

    //Get Route State
    var listenerRouteState = new ROSLIB.Topic({
        ros: ros,
        name: t_route_state,
        messageType: 'cav_msgs/RouteState'
    });

    listenerRouteState.subscribe(function (message) {

        insertNewTableRow('tblSecondA', 'Route ID', message.routeID);
        insertNewTableRow('tblSecondA', 'Route State', message.state);
        insertNewTableRow('tblSecondA', 'Cross Track / Down Track', message.cross_track.toFixed(2) + ' / ' + message.down_track.toFixed(2));

        insertNewTableRow('tblSecondA', 'Current Segment ID', message.current_segment.waypoint.waypoint_id);
        insertNewTableRow('tblSecondA', 'Current Segment Max Speed', message.current_segment.waypoint.speed_limit);

        if (message.lane_index != null && message.lane_index != 'undefined') {
            insertNewTableRow('tblSecondA', 'Lane Index', message.lane_index);
        }

        if (message.current_segment.waypoint.lane_count != null
            && message.current_segment.waypoint.lane_count != 'undefined') {
            insertNewTableRow('tblSecondA', 'Current Segment Lane Count', message.current_segment.waypoint.lane_count);
            insertNewTableRow('tblSecondA', 'Current Segment Req Lane', message.current_segment.waypoint.required_lane_index);
        }

        //Display the lateset route name and timer.
        var divRouteInfo = document.getElementById('divRouteInfo');
        if (divRouteInfo != null || divRouteInfo != 'undefined')
            divRouteInfo.innerHTML = selectedRoute.name + ' : ' + engaged_timer;
    });
}


/*
    Watch out for route completed, and display the Route State in the System Status tab.
    Route state are only set and can be shown after Route has been selected.
*/
function showActiveRoute() {

    //Get Route State
    var listenerRoute = new ROSLIB.Topic({
        ros: ros,
        name: t_active_route,
        messageType: 'cav_msgs/Route'
    });

    listenerRoute.subscribe(function (message) {

        //if route hasn't been selected.
        if (selectedRoute.name == 'No Route Selected')
            return;

        //If nothing on the list, set all selected checkboxes back to blue (or active).
        if (message.segments == null || message.segments.length == 0) {
            divCapabilitiesMessage.innerHTML += 'There were no segments found the active route.';
            return;
        }

        //Only map the segment one time.
        //alert('routePlanCoordinates: ' + sessionStorage.getItem('routePlanCoordinates') );
        if (sessionStorage.getItem('routePlanCoordinates') == null) {
            message.segments.forEach(mapEachRouteSegment);
        }
    });
}

/*
    Loop through each available plugin
*/
function mapEachRouteSegment(segment) {

    var segmentLat;
    var segmentLon;
    var position;
    var routeCoordinates; //To map the entire route

    //1) To map the route
    //create new list for the mapping of the route
    if (sessionStorage.getItem('routePlanCoordinates') == null) {
        segmentLat = segment.prev_waypoint.latitude;
        segmentLon = segment.prev_waypoint.longitude;
        position = new google.maps.LatLng(segmentLat, segmentLon);

        routeCoordinates = [];
        routeCoordinates.push(position);
        sessionStorage.setItem('routePlanCoordinates', JSON.stringify(routeCoordinates));
    }
    else //add to existing list.
    {
        segmentLat = segment.waypoint.latitude;
        segmentLon = segment.waypoint.longitude;
        position = new google.maps.LatLng(segmentLat, segmentLon);

        routeCoordinates = sessionStorage.getItem('routePlanCoordinates');
        routeCoordinates = JSON.parse(routeCoordinates);
        routeCoordinates.push(position);
        sessionStorage.setItem('routePlanCoordinates', JSON.stringify(routeCoordinates));
    }
}

/*
    Update the host marker based on the latest NavSatFix position.
*/
function showNavSatFix() {

    var driverList = [];

      driverList.push(tbn_nav_sat_fix);

      request = new ROSLIB.ServiceRequest({
        capabilities: driverList
      });

      // Call the service and get back the results in the callback.
      serviceClientForGetDriversWithCap.callService(request, function (result) {

        if (result.driver_data.length == 0)
        {
            console.log('getDriversWithCapabilities() returned no POSITION drivers for nav_sat_fix: ' + result.driver_data.length);
            return;
        }

        //JS ES6 syntax to assign the fully qualified name of the topic to the specific variable.
        t_nav_sat_fix = result.driver_data.find(element => element.endsWith(tbn_nav_sat_fix));
        //console.log('t_nav_sat_fix: ' + t_nav_sat_fix );

        var listenerNavSatFix = new ROSLIB.Topic({
            ros: ros,
            name: t_nav_sat_fix,
            messageType: 'sensor_msgs/NavSatFix'
        });

        listenerNavSatFix.subscribe(function (message) {

            if (message.latitude == null || message.longitude == null)
                return;

            insertNewTableRow('tblFirstA', 'NavSatStatus', message.status.status);
            insertNewTableRow('tblFirstA', 'Latitude', message.latitude.toFixed(6));
            insertNewTableRow('tblFirstA', 'Longitude', message.longitude.toFixed(6));
            insertNewTableRow('tblFirstA', 'Altitude', message.altitude.toFixed(6));

            if (hostmarker != null) {
                moveMarkerWithTimeout(hostmarker, message.latitude, message.longitude, 0);
            }

            //listenerNavSatFix.unsubscribe();
        });

    });

}

/*
    Display the close loop control of speed
*/
function showSpeedAccelInfo() {

    var driverList = [];

    //controller
    driverList.push(tbn_cmd_speed);

    // Create a Service Request
    var request = new ROSLIB.ServiceRequest({
    capabilities: driverList
    });

    // Call the service and get back the results in the callback.
    serviceClientForGetDriversWithCap.callService(request, function (result) {

        if (result.driver_data.length == 0)
        {
            console.log('getDriversWithCapabilities() returned no CONTROLLER driver for cmd_speed: ' + result.driver_data.length);
            return;
        }

        //JS ES6 syntax to assign the fully qualified name of the topic to the specific variable.
        t_cmd_speed = result.driver_data.find(element => element.endsWith(tbn_cmd_speed));
        //console.log('t_cmd_speed:' + t_cmd_speed);

        //Get Speed Accell Info
        var listenerSpeedAccel = new ROSLIB.Topic({
            ros: ros,
            name: t_cmd_speed,
            messageType: 'cav_msgs/SpeedAccel'
        });

        listenerSpeedAccel.subscribe(function (message) {

            var cmd_speed_mph = Math.round(message.speed * METER_TO_MPH);

            insertNewTableRow('tblFirstB', 'Cmd Speed (m/s)', message.speed.toFixed(2));
            insertNewTableRow('tblFirstB', 'Cmd Speed (MPH)', cmd_speed_mph);
            insertNewTableRow('tblFirstB', 'Max Accel', message.max_accel.toFixed(2));

        });
    });

}

/*
    Display the CAN speeds
*/
function showCANSpeeds() {

    var driverList = [];

    //can drivers
    driverList.push(tbn_can_engine_speed);
    driverList.push(tbn_can_speed);

    request = new ROSLIB.ServiceRequest({
        capabilities: driverList
    });

    // Call the service and get back the results in the callback.
    serviceClientForGetDriversWithCap.callService(request, function (result) {

        if (result.driver_data.length == 0)
        {
            console.log('getDriversWithCapabilities() returned no CAN drivers for can_engine_speed and can_speed: ' + result.driver_data.length);
            return;
        }

        //JS ES6 syntax to assign the fully qualified name of the topic to the specific variable.
        t_can_engine_speed = result.driver_data.find(element => element.endsWith(tbn_can_engine_speed));
        t_can_speed = result.driver_data.find(element => element.endsWith(tbn_can_speed));

        //console.log('t_can_engine_speed:' + t_can_engine_speed  );
        //console.log('t_can_speed:' + t_can_speed  );

        //Listeners below

        var listenerCANEngineSpeed = new ROSLIB.Topic({
            ros: ros,
            name: t_can_engine_speed,
            messageType: 'std_msgs/Float64'
        });

        listenerCANEngineSpeed.subscribe(function (message) {
            insertNewTableRow('tblFirstB', 'CAN Engine Speed', message.data);
        });

        var listenerCANSpeed = new ROSLIB.Topic({
            ros: ros,
            name: t_can_speed,
            messageType: 'std_msgs/Float64'
        });

        listenerCANSpeed.subscribe(function (message) {
            var speedMPH = Math.round(message.data * METER_TO_MPH);
            insertNewTableRow('tblFirstB', 'CAN Speed (m/s)', message.data);
            insertNewTableRow('tblFirstB', 'CAN Speed (MPH)', speedMPH);
        });

    });

}

/*
    The Sensor Fusion velocity can be used to derive the actual speed.
*/
function showActualSpeed(){

    var listenerSFVelocity = new ROSLIB.Topic({
        ros: ros,
        name: t_sensor_fusion_filtered_velocity,
        messageType: 'geometry_msgs/TwistStamped'
    });

    listenerSFVelocity.subscribe(function (message) {

        //If nothing on the Twist, skip
        if (message.twist == null || message.twist.linear == null || message.twist.linear.x == null) {
            return;
        }

        var actualSpeedMPH = Math.round(message.twist.linear.x * METER_TO_MPH);
        insertNewTableRow('tblFirstB', 'SF Velocity (m/s)', message.twist.linear.x);
        insertNewTableRow('tblFirstB', 'SF Velocity (MPH)', actualSpeedMPH);
    });
}
/*
    Display the Vehicle Info in the System Status tab.
*/
function getVehicleInfo() {

    ros.getParams(function (params) {
        params.forEach(showVehicleInfo); //Print each param into the log view.
    });
}

/*
   This called by forEach and doesn't introduce RACE condition compared to using for-in statement.
   Shows only Vehicle related parameters in System Status table.
*/
function showVehicleInfo(itemName, index) {
    if (itemName.startsWith('/saxton_cav/vehicle') == true && itemName.indexOf('database_path') < 0) {
        //Sample call to get param.
        var myParam = new ROSLIB.Param({
            ros: ros,
            name: itemName
        });

        myParam.get(function (myValue) {
            insertNewTableRow('tblSecondB', toCamelCase(itemName), myValue);
        });
    }
}


/* 10/16/2018 MF Issue #1015: commented out to enforce this logic individually *
    The interface manager manages the fully qualified topic names based on available capability.
    Currently interface manager can only handle list from same capability/driver at a time.
*
function getDriversWithCapabilities()
{
      if (bGetDriversWithCapCalled == true)
        return;

      bGetDriversWithCapCalled = true;

      //Get the drivers for inbound and outbound
      //rosservice call /saxton_cav/interface_manager/get_drivers_with_capabilities "['inbound_binary_msg','outbound_binary_msg']"
      //driver_data: [/saxton_cav/drivers/dsrc/comms/inbound_binary_msg, /saxton_cav/drivers/dsrc/comms/outbound_binary_msg]
      var serviceClient = new ROSLIB.Service({
          ros: ros,
          name: t_get_drivers_with_capabilities,
          serviceType: 'cav_srvs/GetDriversWithCapabilities'
      });

      var driverList = [];

      //controller
      driverList.push(tbn_robot_status);
      driverList.push(tbn_cmd_speed);

      // Create a Service Request
      var request = new ROSLIB.ServiceRequest({
        capabilities: driverList
      });

      // Call the service and get back the results in the callback.
      serviceClient.callService(request, function (result) {

          if (result.driver_data.length == 0)
          {
            console.log('getDriversWithCapabilities() returned no CONTROLLER drivers: ' + result.driver_data.length);
            return;
          }

          //JS ES6 syntax to assign the fully qualified name of the topic to the specific variable.
          t_robot_status = result.driver_data.find(element => element.endsWith(tbn_robot_status));
          t_cmd_speed = result.driver_data.find(element => element.endsWith(tbn_cmd_speed));

          //console.log(t_robot_status + ';' + t_cmd_speed);
      });

      //mock controller
      driverList = [];
      driverList.push(tbn_lateral_control_driver);

      request = new ROSLIB.ServiceRequest({
            capabilities: driverList
      });

      serviceClient.callService(request, function (result) {

          if (result.driver_data.length == 0)
          {
            console.log('getDriversWithCapabilities() returned no MOCK drivers: ' + result.driver_data.length);
            return;
          }

          //JS ES6 syntax to assign the fully qualified name of the topic to the specific variable.
          t_lateral_control_driver = result.driver_data.find(element => element.endsWith(tbn_lateral_control_driver));
          //console.log(t_lateral_control_driver );
      });

      //position
      driverList = [];
      driverList.push(tbn_nav_sat_fix);

      request = new ROSLIB.ServiceRequest({
        capabilities: driverList
      });

      serviceClient.callService(request, function (result) {

        if (result.driver_data.length == 0)
        {
          console.log('getDriversWithCapabilities() returned no POSITION drivers: ' + result.driver_data.length);
          return;
        }

        //JS ES6 syntax to assign the fully qualified name of the topic to the specific variable.
        t_nav_sat_fix = result.driver_data.find(element => element.endsWith(tbn_nav_sat_fix));
        console.log(t_nav_sat_fix );
      });

      //can drivers
      driverList = [];
      driverList.push(tbn_can_engine_speed);
      driverList.push(tbn_can_speed);
      driverList.push(tbn_acc_engaged);

      request = new ROSLIB.ServiceRequest({
            capabilities: driverList
      });

      serviceClient.callService(request, function (result) {

          if (result.driver_data.length == 0)
          {
            console.log('getDriversWithCapabilities() returned no CAN drivers: ' + result.driver_data.length);
            return;
          }

          //JS ES6 syntax to assign the fully qualified name of the topic to the specific variable.
          t_can_engine_speed = result.driver_data.find(element => element.endsWith(tbn_can_engine_speed));
          t_can_speed = result.driver_data.find(element => element.endsWith(tbn_can_speed));
          t_acc_engaged = result.driver_data.find(element => element.endsWith(tbn_acc_engaged));

          //console.log(t_can_engine_speed + ';' + t_can_speed + ';' + t_acc_engaged );
      });



      //comms drivers
      driverList = [];
      driverList.push(tbn_inbound_binary_msg);
      driverList.push(tbn_outbound_binary_msg);

      request = new ROSLIB.ServiceRequest({
            capabilities: driverList
      });

      serviceClient.callService(request, function (result) {

          if (result.driver_data.length == 0)
          {
            console.log('getDriversWithCapabilities() returned no COMMS drivers: ' + result.driver_data.length);
            return;
          }

          //JS ES6 syntax to assign the fully qualified name of the topic to the specific variable.
          t_inbound_binary_msg = result.driver_data.find(element => element.endsWith(tbn_inbound_binary_msg));
          t_outbound_binary_msg = result.driver_data.find(element => element.endsWith(tbn_outbound_binary_msg));

          //console.log(t_inbound_binary_msg + ';' + t_outbound_binary_msg );
      });

}
*/

/*
    Show the system name and version on the footer.
*/
function showSystemVersion() {

    // Calling service
    var serviceClient = new ROSLIB.Service({
        ros: ros,
        name: s_get_system_version,
        serviceType: 'cav_srvs/GetSystemVersion'
    });

    // Then we create a Service Request.
    var request = new ROSLIB.ServiceRequest({
    });

    // Call the service and get back the results in the callback.
    serviceClient.callService(request, function (result) {

        var elemSystemVersion = document.getElementsByClassName('systemversion');
        elemSystemVersion[0].innerHTML = result.system_name + ' ' + result.revision;
    });
}

/*
    Subscribe to topic and add each vehicle as a marker on the map.
    If already exist, update the marker with latest long and lat.
*/
function mapOtherVehicles() {

    //alert('In mapOtherVehicles');

    //Subscribe to Topic
    var listenerClient = new ROSLIB.Topic({
        ros: ros,
        name: t_incoming_bsm,
        messageType: 'cav_msgs/BSM'
    });


    listenerClient.subscribe(function (message) {
        insertNewTableRow('tblSecondB', 'BSM Temp ID - ' + message.core_data.id + ': ', message.core_data.id);
        insertNewTableRow('tblSecondB', 'BSM Latitude - ' + message.core_data.id + ': ', message.core_data.latitude.toFixed(6));
        insertNewTableRow('tblSecondB', 'BSM Longitude - ' + message.core_data.id + ': ', message.core_data.longitude.toFixed(6));

        setOtherVehicleMarkers(message.core_data.id, message.core_data.latitude.toFixed(6), message.core_data.longitude.toFixed(6));
    });
}


/*
    Update the signal icon on the status bar based on the binary incoming and outgoing messages.
*/
function showCommStatus() {

    var driverList = [];

    //comms drivers
    driverList.push(tbn_inbound_binary_msg);
    driverList.push(tbn_outbound_binary_msg);

    request = new ROSLIB.ServiceRequest({
        capabilities: driverList
    });

    // Call the service and get back the results in the callback.
    serviceClientForGetDriversWithCap.callService(request, function (result) {

      if (result.driver_data.length == 0)
      {
            console.log('getDriversWithCapabilities() returned no COMMS drivers: ' + result.driver_data.length);
            return;
      }

      //JS ES6 syntax to assign the fully qualified name of the topic to the specific variable.
      t_inbound_binary_msg = result.driver_data.find(element => element.endsWith(tbn_inbound_binary_msg));
      t_outbound_binary_msg = result.driver_data.find(element => element.endsWith(tbn_outbound_binary_msg));

      //console.log(t_inbound_binary_msg + ';' + t_outbound_binary_msg );

        // Get the Object by ID
        var a = document.getElementById('objOBUBroadcast');
        // Get the SVG document inside the Object tag
        var svgDoc = a.contentDocument;

        if (t_outbound_binary_msg != null && t_outbound_binary_msg != '')
        {
           //Subscribe to Topic
           var listenerClientOutboundMsg = new ROSLIB.Topic({
               ros: ros,
               name: t_outbound_binary_msg,
               messageType: 'cav_msgs/ByteArray'
           });

           listenerClientOutboundMsg.subscribe(function (message) {

               // Get one of the SVG items by ID;
               var svgItem1 = svgDoc.getElementById('signal-right');
               // Set the colour to something else
               svgItem1.setAttribute('fill', '#4CAF50'); //green

               //set back to black after 5 seconds.
              setTimeout(function(){
                   // Set the colour to something else
                   svgItem1.setAttribute('fill', '#000000'); //black
              }, 5000);
           });
        }

        if (t_inbound_binary_msg != null && t_inbound_binary_msg != '')
        {
           //Subscribe to Topic
            var listenerClientInboundMsg = new ROSLIB.Topic({
                ros: ros,
                name: t_inbound_binary_msg,
                messageType: 'cav_msgs/ByteArray'
            });

            listenerClientInboundMsg.subscribe(function (message) {

               // Get one of the SVG items by ID;
               var svgItem2 = svgDoc.getElementById('signal-left');
               // Set the colour to something else
               svgItem2.setAttribute('fill', '#4CAF50'); //green

               //set back to black after 5 seconds.
               setTimeout(function(){
                   svgItem2.setAttribute('fill', '#000000'); //black
               }, 5000);

            });
        }

    });
}

/*
 Changes the string into Camel Case.
*/
function toCamelCase(str) {
    // Lower cases the string
    return str.toLowerCase()
        // Replaces any with /saxton_cav/
        .replace('/saxton_cav/', ' ')
        // Replaces any - or _ characters with a space
        .replace(/[-_]+/g, ' ')
        // Removes any non alphanumeric characters
        .replace(/[^\w\s]/g, '')
        // Uppercases the first character in each group immediately following a space
        // (delimited by spaces)
        .replace(/ (.)/g, function ($1) { return $1.toUpperCase(); })
        // Removes spaces
        .trim();
    //.replace( / /g, '' );
}

function showStatusandLogs() {
    getParams();
    getVehicleInfo();

    //getDriversWithCapabilities(); //10/16/18 MF: Duplicating the logic to each function so doesn't have to wait for all services at once.

    showSystemVersion();
    showNavSatFix();
    showSpeedAccelInfo();
    showCANSpeeds();
    showActualSpeed();
    showDiagnostics();
    showDriverStatus();
    showControllingPlugins();
    checkLateralControlDriver();
    showUIInstructions();
    mapOtherVehicles();
    showCommStatus();
}

/*
    Start timer after engaging Guidance.
*/
function startEngagedTimer() {
    // Start counter
    if (timer == null && isGuidance.engaged == true)
    {
        timer = setInterval(countUpTimer, 1000);
        //console.log('*** setInterval & countUpTimer was called.');
    }
}

/*
  Loop function to
   for System Ready status from interface manager.
*/
function waitForSystemReady() {

    setTimeout(function () {   //  call a 5s setTimeout when the loop is called
        checkSystemAlerts();   //  check here
        ready_counter++;       //  increment the counter

        //  if the counter < 4, call the loop function
        if (ready_counter < ready_max_trial && isSystemAlert.ready == false) {
            waitForSystemReady();             //  ..  again which will trigger another
            divCapabilitiesMessage.innerHTML = 'Awaiting SYSTEM READY status ...';
        }

        //If system is now ready
        if (isSystemAlert.ready == true) {
            evaluateNextStep(); //call to evaluate next step after system is ready.
        }
        else { //If over max tries
            if (ready_counter >= ready_max_trial)
                divCapabilitiesMessage.innerHTML = 'Sorry, did not receive SYSTEM READY status, please refresh your browser to try again.';
        }
    }, 3000)//  ..  setTimeout()
}

/*
Ensures all driver topics needed are populated from getDriversWithCapablities
//Issue#1015 MF: NOT used but will keep for now in case need to revert.
*
function isDriverTopicsAllAvailable()
{
    if  ( t_robot_status == null || t_robot_status == '' ||
          t_cmd_speed == null || t_cmd_speed == '' ||
          t_lateral_control_driver == null || t_lateral_control_driver == '' ||
          t_can_engine_speed == null || t_can_engine_speed == '' ||
          t_can_speed == null || t_can_speed == '' ||
          t_acc_engaged == null || t_acc_engaged == '' ||
          t_inbound_binary_msg == null || t_inbound_binary_msg == '' ||
          t_outbound_binary_msg == null || t_outbound_binary_msg == ''
         )
            return false;
     else
     {

            console.log( 't_robot_status : ' + t_robot_status);
            console.log( 't_cmd_speed: ' + t_cmd_speed);
            console.log( 't_lateral_control_driver: ' + t_lateral_control_driver);
            console.log( 't_can_engine_speed: ' + t_can_engine_speed);
            console.log( 't_can_speed: ' + t_can_speed);
            console.log( 't_acc_engaged: ' + t_acc_engaged);
            console.log( 't_inbound_binary_msg: ' + t_inbound_binary_msg);
            console.log( 't_outbound_binary_msg: ' + t_outbound_binary_msg);

            return true;
     }
}
*/
/*
    Wait to get all the service responses from interface manager.
    //Issue#1015 MF: NOT USED, but keeping for now.
*
function waitForGetDriversWithCapabilities() {

    setTimeout(function () {   //  call a 5s setTimeout when the loop is called

        getDriversWithCapabilities(); //  subscribe if hasn't been done yet.

        //If over max tries
        if (getDriversWithCap_counter >= getDriversWithCap_max_trial)
        {
            //console.log('***waitForGetDriversWithCapabilities 1 ***: ' + getDriversWithCap_counter);
            divCapabilitiesMessage.innerHTML = 'Sorry, did not receive driver topics, please refresh your browser to try again.';
            return;
        }

        //  if the counter < max, call the loop function
        if ( isDriverTopicsAllAvailable() == false )
        {
            //console.log('***waitForGetDriversWithCapabilities 2 ***: ' + getDriversWithCap_counter);
            getDriversWithCap_counter++;  //  increment the counter when waiting
            divCapabilitiesMessage.innerHTML = 'Awaiting driver topics ...';
            waitForGetDriversWithCapabilities();
        }
        else //isDriverTopicsAllAvailable() == true
        {

            //console.log('***waitForGetDriversWithCapabilities 3 ***: ' + getDriversWithCap_counter);
            evaluateNextStep(); //call to evaluate next step after system is ready.
        }

    }, 3000)//  ..  setTimeout()
}
*/

/*
    Evaluate next step AFTER connecting
    Scenario1 : Initial Load
    Scenario 2: Refresh on particular STEP
*/
function evaluateNextStep() {

    if (isSystemAlert.ready == false) {
        waitForSystemReady();
        return;
    }

    //Issue#1015 MF: Not used Commented out for now until further testing to make sure we don't need this again.
    //if (isDriverTopicsAllAvailable() == false){
    //    //console.log ('evaluateNextStep: calling waitForGetDriversWithCapabilities')
    //    waitForGetDriversWithCapabilities();
    //}

    if (selectedRoute.name == 'No Route Selected') {
        showRouteOptions();
        showStatusandLogs();
        //enableGuidance(); Should not enable guidance as route has not been selected.

    }
    else {
        //ELSE route has been selected and so show plugin page.

        //Show Plugin
        showSubCapabilitiesView2();

        //Subscribe to active route to map the segments
        showActiveRoute();

        //Display the System Status and Logs.
        showStatusandLogs();

        //Enable the CAV Guidance button regardless plugins are selected
        enableGuidance();
    }

}//evaluateNextStep

/*
 Onload function that gets called when first loading the page and on page refresh.
*/
window.onload = function () {

    //Check if localStorage/sessionStorage is available.
    if (typeof (Storage) !== 'undefined') {

        if (!SVG.supported) {
            console.log('SVG not supported. Some images will not be displayed.');
        }

        //Refresh widget
        CarmaJS.WidgetFramework.onRefresh();

        // Adding Copyright based on current year
        var elemCopyright = document.getElementsByClassName('copyright');
        elemCopyright[0].innerHTML = '&copy LEIDOS ' + new Date().getFullYear();

        //Refresh requires connection to ROS.
        connectToROS();

        //TODO: Figure out how to focus to the top when div innerhtml changes. This doesn't seem to work.
        //divCapabilitiesMessage.addListener('change', function (){divCapabilitiesMessage.focus();}, false);


    } else {
        // Sorry! No Web Storage support..
        divCapabilitiesMessage.innerHTML = 'Sorry, cannot proceed unless your browser support HTML Web Storage Objects. Please contact your system administrator.';

    }
}

/* When the user clicks anywhere outside of the modal, close it.
//TODO: Enable this later when lateral controls are implemented. Currently only FATAL, SHUTDOWN and ROUTE COMPLETED are modal popups that requires users acknowledgement to be routed to logout page.
//TODO: Need to queue and hide modal when user has not acknowledged, when new messages come in that are not fatal, shutdown, route completed, or require user acknowlegement.
window.onclick = function (event) {
    var modal = document.getElementById('modalMessageBox');

    if (event.target == modal) {
        modal.style.display = 'none';
    }
}
*/

