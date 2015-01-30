// Double Driver App
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var extend = require('node.extend');
var debug = require('debug')('double-drive');
var io = require('socket.io-client'); 
var https = require('https');
https.globalAgent.options.rejectUnauthorized = false;

var APP_VERSION_NUM = "2.0.0";
var APP_BUILD_NUM = "9";

// commands
var commands = {};
commands.kDRCommandDriverToRobotHello = 1;
commands.kDRCommandRobotToDriverHello = 2;
commands.kDRCommandDriverToRobotGoodbye = 3;
commands.kDRCommandGoodbye = 4;
commands.kDRCommandControlDrive = 8;
commands.kDRCommandControlPole = 9;
commands.kDRCommandKickstandDeploy = 10;
commands.kDRCommandKickstandRetract = 11;
commands.kDRCommandRobotIsAvailable = 19;
commands.kDRCommandRobotIsBusy = 20;
commands.kDRCommandDriverIsReady = 21;
commands.kDRCommandRequestListOfRobots = 22;
commands.kDRCommandListOfRobots = 23;
commands.kDRCommandRequestOpenTokSession = 24;
commands.kDRCommandOpenTokSession = 25;
commands.kDRCommandFlipCamera = 26;
commands.kDRCommandRequestStatusData = 29;
commands.kDRCommandStatusData = 30;
commands.kDRCommandTurnBy = 36;
commands.kDRCommandPoleStand = 37;
commands.kDRCommandPoleSit = 38;
commands.kDRCommandPoleStop = 39;
commands.kDRCommandPoleMoving = 40;
commands.kDRCommandVolumeChanged = 41;
commands.kDRCommandRequestRobotiPadOrientation = 44;
commands.kDRCommandRobotiPadOrientation = 45;
commands.kDRCommandLogSessionError = 50;
commands.kDRRequestFirmwareConstants = 51;
commands.kDRFirmwareConstantsSent = 52;
commands.kDRSetFirmwareConstants = 53;
commands.kDRCommandRemoteVideoFroze = 54;
commands.kDRCommandRemoteVideoUnfroze = 55;
commands.kDRCommandFlashlightOn = 56;
commands.kDRCommandFlashlightOff = 57;
commands.kDRCommandTakePhoto = 58;
commands.kDRCommandPhoto = 59;
commands.kDRCommandZoom = 60;
commands.kDRCommandResetVideoLink = 61;
commands.kDRCommandDidFinishFlipping = 62;
commands.kDRCommandJoinSession = 63;
commands.kDRCommandRequestJoinKey = 64;
commands.kDRCommandJoinKey = 65;
commands.kDRCommandViewerDidLeaveSession = 66;
commands.kDRCommandSetRobotScreenBrightness = 67;
commands.kDRCommandLowLightModeOn = 68;
commands.kDRCommandLowLightModeOff = 69;
commands.kDRCommandKnockKnock = 70;
commands.kDRCommandFocusOnPoint = 71;
commands.kDRCommandRobotFrameRate = 72;
commands.kDRCommandKickDriver = 73;
commands.kDRCommandKickAndBlockDriver = 74;
commands.kDRCommandUnblockDriver = 75;
commands.kDRCommandWebURLShow = 76;
commands.kDRCommandWebURLHide = 77;
commands.kDRCommandVideoStabilizationOn = 78;
commands.kDRCommandVideoStabilizationOff = 79;
commands.kDRCommandReloadConfiguration = 80;
commands.kDRCommandGACycle = 81;
commands.kDRCommandSetPreferences = 82;
commands.kDRCommandViewerDidJoinSession = 83;
commands.kDRCommandViewerDidPublishAudio = 84;
commands.kDRCommandMultipartyViewers = 85;
commands.find = function(code) {
	for (i in commands) {
		if (commands[i] == code) return i;
	}
};

// Kickstand states
var kDRKickstand_stateNone = 				0;
var kDRKickstand_stateDeployed =  			1;
var kDRKickstand_stateRetracted = 			2;
var kDRKickstand_stateDeployWaiting = 		3;
var kDRKickstand_stateDeployBeginning = 	4;
var kDRKickstand_stateDeployMiddle =  		5;
var kDRKickstand_stateDeployEnd =  			6;
var kDRKickstand_stateDeployAbortMiddle = 	7;
var kDRKickstand_stateDeployAbortEnd = 		8;
var kDRKickstand_stateRetractBeginning =  	9;
var kDRKickstand_stateRetractMiddle =  		10;
var kDRKickstand_stateRetractEnd =  		11;

// robot status
var kDRRobotStatusAvailable = 0;
var kDRRobotStatusInUse = 1;
var kDRRobotStatusAway = 2;


function DoubleDrive(options) 
{
	var self = this;
	self.self = self;
	self.options = options;
	
//************************************************************************************
var isFlipped = false;
var isMuted = false;
var speakerIsMuted = false;
var kickstandState = kDRKickstand_stateNone;
var poleIsMoving = false;
var flipKeyDidRelease = true;
var statusValues = {};
var lastVolume = 0;
var justGotVolume = false;
var robotiPadOrientation = 0;

var opentokAPIKey = 10772502; // OpenTok sample API key. Replace with your own API key.
var opentokSession;
var opentokPublisher;
var opentokSubscriber = undefined;
var opentokViewSubscribers = [];

var blinkArray = [];

var forwardState = 0;
var backwardState = 0;
var leftState = 0;
var rightState = 0;
var poleUpState = 0;
var poleDownState = 0;
var shouldZoomAfterLoadingRobots = true;
var zoomLevel = 1.0;
var zoomCenter = [ 0.5, 0.5 ];
var nextZoomCenter = null;
var sessionIsMultipartyHost = false;
var sessionIsViewer = false;
var multipartyViewerName = "Viewer";
var multipartyViewerId = null;
var multipartyLink = null;
var multipartyViewers = [];
var centerRemoteVideoInterval = null;

var neutralDriveCommandsSent = 0;
var neutralPoleCommandsSent = 0;
var poleToSend = -1;
var allowPoleUpdate = true;
var allowRobotSpeakerUpdate = true;
var allowRobotSpeakerUpdateTimeout = null;
var robotSpeakerVolumeToSend = -1;

var showingWebPage = false;

var sessionBatteryButton = null;

var drivingTallTimeout = null;
var drivingTallInterval = null;

// Socket.io
var socket;
var isConnected = false;
var nodeServer = "node.doublerobotics.com";
var nodePort = 443;

// OpenTok
var opentokSessionId;
var opentokSessionToken;
var remoteIsLandscape;

// map
var mapboxMap;
var markerLayer;
var kDRClusterDistance = 64.0;
var panTimeout;
var robots = [];
var robotsPrivate = [];
var robotsPublic = [];
var robotsList = [];
var lastRobotsString = "";

// driving
var commandsTimer;
var mouseMoveInterval;
var mouseMoveCountdown;
var mouseMoved = false;
var mouseY = 0;

var leftKeyDownStartTime = 0;
var leftTurnTimeout;
var rightKeyDownStartTime = 0;
var rightTurnTimeout;

var freezeDetectionTimer = null;

// client types
var kDRClientTypeUnknown = 0;
var kDRClientTypeiPad = 1;
var kDRClientTypeiPhone = 2;
var kDRClientTypeWeb = 3;

var scrollValue = 0;

var nightVisionEnabled = false;
var lastBrightnessSent = -1;

var publicRobotsSwitch = -1;

function checkTimedReset(timeout) {
	if (timeout) {
		setTimeout(reset, timeout);
	}
}

function turnLeft(timeout) {
	leftState = 1;
	fireDriveCommands();
	checkTimedReset(timeout);
}

function turnRight(timeout) {
	rightState = 1;
	fireDriveCommands();
	checkTimedReset(timeout);
}

function poleUp(timeout) {
	poleUpState = 1;
	checkTimedReset(timeout);
}

function poleDown(timeout) {
	poleDownState = 1;
	checkTimedReset(timeout);
}

function moveForward(timeout) {
	forwardState = 1;
	checkTimedReset(timeout);
}

function moveBackward(timeout) {
	backwardState = 1;
	checkTimedReset(timeout);
}

function keydown(e) {
	if (!opentokSessionId) {
		return;
	}
		
	switch (e.keyCode) {
		case 37: // left, arrow
		case 65: // left, a

			// If key down is less than 200ms, do turn by degree
			// So we are firing a timer here after 200ms to update leftState for firing driver commands		
			if (leftKeyDownStartTime == 0) {
				leftKeyDownStartTime = Date.now();
				leftTurnTimeout = setTimeout(turnLeft, 200);
			}
			
			return false;

		case 39: // right, arrow
		case 68: // right, d

			// If key down is less than 200ms, do turn by degree
			// So we are firing a timer here after 200ms to update leftState for firing driver commands		
			if (rightKeyDownStartTime == 0) {
				rightKeyDownStartTime = Date.now();
				rightTurnTimeout = setTimeout(turnRight, 200);
			}
			
			return false;
			
		case 38: // forward, arrow
		case 87: // forward, w
			if (forwardState == 0 && kickstandState == kDRKickstand_stateDeployed) {
				parkAction();
			}
			moveForward();
			return false;

 		case 40: // backward, arrow
 		case 83: // backward, s
 			moveBackward();
			return false;

 		case 82: // pole up, r
			if (remoteRobotSupports("oculus")) {
				sensorDevice.resetSensor();
			} else {
	 			poleUp();
			}
			return true;

 		case 70: // pole down, f
			if (navigator.getVRDevices) {
				beginOculusMode();
			} else {
				poleDown();
			}
			return false;

 		case 32: // flip, space bar
			if (hmdDevice) {
				sensorDevice.resetSensor();
			} else {
	 			if (flipKeyDidRelease) {
		 			flipAction();
		 			flipKeyDidRelease = false;
	 			}
			}
			return false;
 	}
	return; //using "return" other attached events will execute
};

function keydrive() {
	var keyupdown = require('keyupdown');
	
	var stdin = process.openStdin(); 
	process.stdin.setRawMode(true);  
	keyupdown(stdin);

	var keyobj = {};
	var keycode = -1;
	
	var codes = {
		up: 38,
		down: 40,
		left: 37,
		right: 39,
	};
	
	stdin.on('keydown', function(chunk, key){
	  keyobj = key;
	  keycode = key && codes[key.name] || new Buffer(chunk || key && key.sequence)[0];
	  
	  //debug('keydown - Code: %s (%s), Key: %j', keycode, chunk || key.sequence, key);
	  keydown({
		 keyCode: keycode,
		 shiftKey: keyobj && keyobj.shift
	  });
	});
	
	stdin.on('keyup', function(a, b){
	  //debug('keyup - Code: %s', keycode);
	  keyup({
		 keyCode: keycode,
		 shiftKey: keyobj && keyobj.shift
	  });
	});
}

function keyup(e) {
	if (!opentokSessionId) {
		if (e.keyCode != 27) { // allow esc
			return;
		}
	}

	switch (e.keyCode) {
		case 37: // left, arrow
		case 65: // left, a
			clearTimeout(leftTurnTimeout);				
			var diff = Date.now() - leftKeyDownStartTime;
			//debug("keyup " + diff + "ms");
			if (diff < 100) {
				//debug("turn by 5 degrees");
				var degree = 5.0;
				sendCommandWithData(kDRCommandTurnBy, { "degrees" : degree, "degreesWhileDriving" : degree/2.0});	
			} else if (diff < 200) {
				//debug("Turn 8 degrees");
				var degree = 8.0;				
				sendCommandWithData(commands.kDRCommandTurnBy, { "degrees" : degree, "degreesWhileDriving" : degree/2.0});	
			}
			leftKeyDownStartTime = 0;
			leftState = 0;
			return false;

		case 67: // capture photo, c
			takePhoto();
			break;

		case 39: // right, arrow
		case 68: // right, d
		
			clearTimeout(rightTurnTimeout);				
			var diff = Date.now() - rightKeyDownStartTime;
			//debug("keyup " + diff + "ms");
			if (diff < 100) {
				//debug("turn by -5 degrees");
				var degree = -5.0;
				sendCommandWithData(commands.kDRCommandTurnBy, { "degrees" : degree, "degreesWhileDriving" : degree/2.0});	
			} else if (diff < 200) {
				//debug("Turn -8 degrees");
				var degree = -8.0;				
				sendCommandWithData(commands.kDRCommandTurnBy, { "degrees" : degree, "degreesWhileDriving" : degree/2.0});	
			}
			rightKeyDownStartTime = 0;
			rightState = 0;
			return false;
			
		case 38: // forward, arrow
		case 87: // forward, w
			forwardState = 0;
			return false;

 		case 40: // backward, arrow
 		case 83: // backward, s
 			backwardState = 0;
			return false;

 		case 82: // pole up, r
 			poleUpState = 0;
			return false;

 		case 70: // pole down, f
 			poleDownState = 0;
			return false;

 		case 32: // flip, space bar
 			flipKeyDidRelease = true;
			return false;

 		case 80: // park, p
			parkAction();
			return false;

 		case 27: // end call, esc
			disconnect();
			return false;

 		case 77: // mute, m
			muteAction();
			return false;

 		case 78: // speaker mute, n
			speakerMuteAction();
			return false;

		case 219: // speaker volume down, []
			speakerVolumeDown();
			return false;

		case 221: // speaker volume up, ]
			speakerVolumeUp();
			return false;

		case 187:
			if (e.shiftKey) {
				// volume up, + key
				volumeUp();
			}
			return false;

		case 189:
			if (e.shiftKey) {
				// volume down, - key
				volumeDown();
			}
			return false;

		case 107:
			// volume up, num pad + key
			volumeUp();
			return false;

		case 109:
			// volume down, num pad - key
			volumeDown();
			return false;

 	}
	return; // using "return" other attached events will execute
};

function reset() {
	leftState = 0;
	forwardState = 0;
	rightState = 0;
	backwardState = 0;
	poleUpState = 0;
	poleDownState = 0;
	flipKeyDidRelease = true;
};

// functions

function setup() {
	debug("App version "+ APP_VERSION_NUM +", Build "+ APP_BUILD_NUM);

	setupSocket();	
}

function setupSocket() {
	// setup socket.io
	socket = io.connect(nodeServer, {port: nodePort, secure: (nodePort == 443), forceNew: true, 'force new connection': true, agent: https.globalAgent});
	
	socket.on('connect', function () {
		isConnected = true;
		debug("did connect to socket.io");
		if (self.options) {
			var access_token = self.options.userId;
			if (access_token) {
				didLogin();
			} else {
				debug("failed to get user");
			}
		}
		self.emit('connect');
	});
	socket.on('disconnect', function () {
		isConnected = false;
		debug("socket.io did disconnect");
		self.emit('disconnect');
	});
	socket.on('error', function () {
		isConnected = false;
		debug("socket.io failed to connect");
		self.emit('error');
	});
	socket.on("message", function (data) {
		if (!self.options) { return; }

		logCommand('received', data);
		
		var command = data["c"];
		var values = data["d"];
		switch (command) {
			case commands.kDRCommandListOfRobots:
				robotsList = values.robots;
				updateRobotsOnMap();
				break;

			case commands.kDRCommandDriverToRobotHello:
				debug("Hello from driver.");
				if (IS_ROBOT_MODE) {
					beginSession();
					sendCommand(commands.kDRCommandRobotToDriverHello);
					setTimeout(function () {
						sendRobotStatus();
					}, 500);
				}
				break;

			case commands.kDRCommandRequestStatusData:
				if (IS_ROBOT_MODE) {
					sendRobotStatus();
				}
				break;

			case commands.kDRCommandRobotToDriverHello:
				debug("Hello from robot.");
				sendCommand(commands.kDRCommandRequestOpenTokSession);
				break;

			case commands.kDRCommandGoodbye:
				debug("Goodbye from robot.");
				setTimeout(endSession, 100);
				if (values && values["error"]) {
					debug("Error: "+ values["error"]);
				}
				break;

			case commands.kDRCommandOpenTokSession:
				// start opentok
				opentokSessionId = values.openTokSessionId;
				opentokSessionToken = values.openTokSessionToken;
				opentokConnect();
				break;

			case commands.kDRCommandStatusData:
/* 				debug("status: "+ JSON.stringify(values)); */
				kickstandState = values.kickstand;
				statusValues = values;
				updateUserState();
				break;

			case commands.kDRCommandPoleMoving:
				// TODO: implement pole button flashing
				break;
				
			case commands.kDRCommandRobotiPadOrientation:
				robotiPadOrientation = values.robot_ipad_orientation;
				updateUserState();
	
				if (values.robot_ipad_orientation == 1) {
					// don't flip upside down
					self.downwardCameraNotAvailable = false;
				} else {
					self.downwardCameraNotAvailable = true;
				}
				break;

			case commands.kDRCommandPhoto:
				var fileName = "photo.jpg";
				
				downloadFile(values["photo"], fileName);
				
				debug("Photo Downloaded: ", fileName);
				
				break;

			case commands.kDRCommandResetVideoLink:
				resetVideoLink();
				break;

			case commands.kDRCommandViewerDidJoinSession:
				debug("Viewer did join: ", values);
				
				if (values && values.viewerId) {
					addViewer(values.viewerId, values.name);
				}
				
				break;
				
			case commands.kDRCommandViewerDidPublishAudio:
				debug("Viewer did publish audio: ", values);

				if (values && values.viewerId && values.streamId) {
					attachAudioToViewer(values.viewerId, values.streamId);
				}
				
				break;
				
			case commands.kDRCommandViewerDidLeaveSession:
				debug("Viewer did leave: ", values);

				if (values && values.viewerId) {
					removeViewer(values.viewerId);
				}

				break;

			case commands.kDRCommandMultipartyViewers:
				if (values && values.viewers) {
					debug("Viewers: ", values.viewers);
					
					multipartyViewers = values.viewers;
					redrawMultipartyViewers();
				}
				break;

		}
	});
	
	debug('connecting...');
	
	self.emit('connecting');
}

function socketIsConnected() {
	return isConnected;
}

function didLogin() {
	if (self.options) {
		var userId = self.options.userId;
		debug("found user: "+ userId);
		var installationId = self.options.installationId || makeInstallationId();
		
		var options = { "userId" : userId, "installationId" : installationId, "clientType" : kDRClientTypeWeb };
		if (self.options.public_key) {
			options.public_key = self.options.public_key;
		}
		sendCommandWithData(commands.kDRCommandDriverIsReady, options);

		shouldZoomAfterLoadingRobots = true;
		getListOfRobots();
	}
}

function didLogOut() {
	robots = [];
	robotsPrivate = [];
	robotsPublic = [];
	socket.disconnect();
	setTimeout(setupSocket, 200);
}

function getListOfRobots() {
	lastRobotsString = "";
	sendCommand(commands.kDRCommandRequestListOfRobots);
}

function deployKickstands() {
	sendCommand(commands.kDRCommandKickstandDeploy);
}

function retractKickstands() {
	sendCommand(commands.kDRCommandKickstandRetract);
}

function flip() {
	if (!isFlipped) {
		resetZoom();
	}

	isFlipped = !isFlipped;
	updateUserState();
	sendCommand(commands.kDRCommandFlipCamera);
}

function logOut() {
	didLogOut();
}

function logCommand(direction, out) {
	debug('%s command[%s]: %j', direction, commands.find(out.c), out);
}

function sendCommand(commandId) {
	if (socket) {
		var out = new Object;
		out.c = commandId;
		logCommand('sending', out);
		socket.emit("message", out);
	}
}

function sendCommandWithData(commandId, data) {
	if ((commandId == commands.kDRCommandControlDrive || commandId == commands.kDRCommandTurnBy) && self.options.peerToPeerDriving) {
		// send peer to peer driving commands
		var signalType = (commandId == commands.kDRCommandControlDrive) ? "kDRCommandControlDrive" : ((commandId == commands.kDRCommandTurnBy) ? "kDRCommandTurnBy" : "");
		if (opentokSession != undefined && opentokSubscriber != undefined) {
			opentokSession.signal({
				type: signalType,
				data: JSON.stringify(data),
			}, function(error) {
				if (error) {
					debug("signal error: " + error.reason);
				}
			});
		}
	} else {
		// regular commands via node server
		if (socket) {
			var out = new Object;
			out.c = commandId;
			out.d = data;
			logCommand('sending', out);
			socket.emit("message", out);
		}
	}
}

function connectTo(installationId, access_key) {
	if (!self.robots) { return; }
	
	installationId = installationId || self.robots[0].dictionary.installationId;
	 
	debug("connecting to", installationId);
	
	var options = { "robotInstallationId" : installationId };
	if (access_key) {
		options.access_key = access_key;
	}
	sendCommandWithData(commands.kDRCommandDriverToRobotHello, options);
	beginSession();

	for (var i = 0; i < robots.length; i++) {
		var r = robots[i];
		if (r.dictionary.installationId == installationId) {
			self.emit("connecting", r.dictionary);
		}
	}
}

function disconnect() {
	if (sessionIsViewer) {
		sendCommandWithData(commands.kDRCommandViewerDidLeaveSession, { viewerId: multipartyViewerId });
		debug("disconnected, was viewer");
	} else {
		setTimeout(function () {
			sendCommand(commands.kDRCommandGoodbye);
			debug("disconnected, sending goodbye");
		}, 1000);
	}
	endSession();
}

function resetSessionVariables() {
	isFlipped = false;
	isMuted = false;
	speakerIsMuted = false;
	kickstandState = kDRKickstand_stateNone;
	poleIsMoving = false;
	flipKeyDidRelease = true;
	statusValues = {};
	lastVolume = 0;
	justGotVolume = false;
	blinkArray = [];

	forwardState = 0;
	backwardState = 0;
	leftState = 0;
	rightState = 0;
	poleUpState = 0;
	poleDownState = 0;
}

function beginSession() {
	// if (currentUser == null) { return; }

	self.emit("connecting");

	resetSessionVariables();
	updateUserState();

	if (sessionIsViewer) {
	} else {
		clearInterval(commandsTimer);
		commandsTimer = setInterval(fireDriveCommands, 200);

		// setTimeout(beginFreezeDetection, 5000);

		if (drivingTallInterval) {
			clearInterval(drivingTallInterval);
		}
		drivingTallInterval = setInterval(checkDrivingTall, 1000);

		// turn by scrolling
		self.scroll = function (e) {
			e = e || {};
			if (e.preventDefault) {
				e.preventDefault();
			}
			e.returnValue = false;  

			if (e.wheelDeltaX > 0) {
				scrollValue = Math.min(scrollValue + e.wheelDeltaX, 1500);
			} else {
				scrollValue = Math.max(scrollValue + e.wheelDeltaX, -1500);
			}
		};
	}
	
	// centerRemoteVideoInterval = setInterval(function () {
	// 	centerRemoteVideo();
	// }, 100);
}

function endSession() {
	clearInterval(commandsTimer);
	clearInterval(freezeDetectionTimer);
	self.onmousewheel = null;
	clearInterval(mouseMoveInterval);
	clearInterval(centerRemoteVideoInterval);

	sessionIsViewer = false;
	multipartyViewerId = null;
	multipartyViewers = [];

	opentokDisconnect();
}

function fireDriveCommands() {
	var drive = (forwardState == 1) ? -100 : ((backwardState) ? 50 : 0);
	var turn = (leftState == 1) ? 100 : ((rightState) ? -100 : 0);
	var pole = (poleUpState == 1) ? 200 : ((poleDownState) ? -200 : 0);

	// turn by scroll
	if (drive == 0) {
		scrollValue = 0;
	}
	if (scrollValue != 0) {
		if (scrollValue > 0) {
			// scroll left
			turn = -35;
			scrollValue = Math.max(scrollValue - 200, 0);
		} else {
			// scroll right
			turn = 35;
			scrollValue = Math.min(scrollValue + 200, 0);
		}
	}

	// Only send neutral drive/turn commands 10 times then stop
	if (drive == 0 && turn == 0) {
		neutralDriveCommandsSent++;
	} else {
		neutralDriveCommandsSent = 0;
	}

	if (neutralDriveCommandsSent < 10) {
		//debug("drive: " + drive + ", turn: " + turn);
		sendCommandWithData(commands.kDRCommandControlDrive, { "drive" : drive, "turn" : turn });
	}

	if (robotSpeakerVolumeToSend != -1) {
		sendCommandWithData(commands.kDRCommandVolumeChanged, { volume: robotSpeakerVolumeToSend });
		robotSpeakerVolumeToSend = -1;
	}

	if (poleToSend != -1) {
		if (remoteRobotSupports("poleTargets")) {
			sendCommandWithData(commands.kDRCommandControlPole, { "target" : poleToSend });
		}
		poleToSend = -1;
	} else {
		// Only send neutral pole commands 10 times then stop
		if (pole == 0) {
			neutralPoleCommandsSent++;
		} else {
			neutralPoleCommandsSent = 0;
		}

		if (neutralPoleCommandsSent < 10) {
			//debug("pole: " + pole);
			sendCommandWithData(commands.kDRCommandControlPole, { "pole" : pole });
		}
	}

	if (nextZoomCenter) {
		sendZoom();
	}

	// send brightness
	var value = self.options.brightness;
	
	if (lastBrightnessSent != -1 && lastBrightnessSent != value) {
		sendCommandWithData(commands.kDRCommandSetRobotScreenBrightness, { "brightness" : value });
		lastBrightnessSent = value;
	}
}

// Button Actions

function updateUserState() {
	// park
	switch (kickstandState) {
		case kDRKickstand_stateDeployed:
        	self.isParked = true;
        	self.isParking = false;
			break;

        case kDRKickstand_stateDeployWaiting: // It's retracted, but waiting to be deployed
		case kDRKickstand_stateDeployBeginning:
		case kDRKickstand_stateDeployMiddle:
		case kDRKickstand_stateDeployEnd:
		case kDRKickstand_stateRetractBeginning:
		case kDRKickstand_stateRetractMiddle:
		case kDRKickstand_stateRetractEnd:
        case kDRKickstand_stateDeployAbortMiddle:
        case kDRKickstand_stateDeployAbortEnd:                                            
        	self.isParked = false;
        	self.isParking = true;
			break;

		case kDRKickstand_stateRetracted:
		case kDRKickstand_stateNone:
		default:
        	self.isParked = false;
    		self.isParking = false;
			break;
	}

	// flip
	if (robotiPadOrientation == 1) {
		self.flipEnabled = false;
	} else if (robotiPadOrientation == 2) {
		self.flipEnabled = true;
		self.isFlipped = isFlipped;
	} else {
		self.flipEnabled = false;
	}

	// Microphone mute
	self.isMuted = isMuted;

	// Microphone volume slider
	if (allowRobotSpeakerUpdate && statusValues.volume != undefined) {
		self.volume = statusValues.volume;
	}

	// Speaker mute
	self.speakerIsMuted = speakerIsMuted;

	// pole
	if (allowPoleUpdate && statusValues.pole !== undefined) {
		self.pole = statusValues.pole * 100;
	}

	// update battery level
	self.sessionBattery = {};
	self.sessionBattery.robotBatteryLevel = statusValues.robot_battery;
	self.sessionBattery.iPadBatteryLevel = statusValues.ipad_battery;
	self.sessionBattery.supportsiPadMeter = true;
	self.sessionBattery.isRobotCharging = statusValues.is_robot_charging;

	// update warning message about driving while too tall
	checkDrivingTall();

	self.status = statusValues;
	
	self.emit('state_updated');
}

function checkDrivingTall() {
	if (statusValues.pole >= 0.5 && forwardState == 1) {
		if (!drivingTallTimeout) {
			drivingTallTimeout = setTimeout(function () {
				// show the warning
				if (!self.isDrivingTall) {
					self.isDrivingTall = true;
				}
				drivingTallTimeout = null;
			}, 3000);
		}
	} else {
		clearTimeout(drivingTallTimeout);
		drivingTallTimeout = null;
		if (self.isDrivingTall) {
			self.isDrivingTall = false;
		}
	}
}

function endAction() {
	disconnect();
	updateUserState();
}

function parkAction() {
	switch (kickstandState) {
		case kDRKickstand_stateDeployed:
			retractKickstands();
			break;

        case kDRKickstand_stateDeployWaiting: // It's retracted, but waiting to be deployed
		case kDRKickstand_stateDeployBeginning:
		case kDRKickstand_stateDeployMiddle:
		case kDRKickstand_stateDeployEnd:
		case kDRKickstand_stateRetractBeginning:
		case kDRKickstand_stateRetractMiddle:
		case kDRKickstand_stateRetractEnd:
        case kDRKickstand_stateDeployAbortMiddle:
        case kDRKickstand_stateDeployAbortEnd:                                            
			break;

		case kDRKickstand_stateRetracted:
		case kDRKickstand_stateNone:
		default:
			deployKickstands();
			break;
			break;
	}
	updateUserState();
}

function flipAction() {
	if (robotiPadOrientation != 1) {
		flip();
	}
}

// Microphone Actions

function muteAction() {
	if (isMuted) {
		muteDisable();
	} else {
		muteEnable();
	}
}

function muteEnable() {
	opentokPublisher.publishAudio(false);
	isMuted = true;
	updateUserState();
}

function muteDisable() {
	opentokPublisher.publishAudio(true);
	isMuted = false;
	updateUserState();
}

var volumeTimeout;
function volumeSliderDidChange(theValue) {
	if (justGotVolume == true) { return; }

	if (volumeTimeout) {
		clearTimeout(volumeTimeout);
	}

	volumeTimeout = setTimeout(function () {
		sendCommandWithData(commands.kDRCommandVolumeChanged, { volume: theValue });
	}, 100);
}

function volumeUp() {
	if (isMuted) {
		muteDisable();
	}
	robotSpeakerVolumeToSend = Math.min(1, statusValues.volume + 0.1);
	statusValues.volume = robotSpeakerVolumeToSend;
	updateUserState();
}

function volumeDown() {
	robotSpeakerVolumeToSend = Math.max(0, statusValues.volume - 0.1);
	statusValues.volume = robotSpeakerVolumeToSend;
	if (statusValues.volume <= 0.01) {
		muteEnable();
	}
	updateUserState();
}

// Speaker Actions

function speakerMuteAction() {
	if (speakerIsMuted) {
		speakerMuteDisable();
	} else {
		speakerMuteEnable();
	}
}

function speakerMuteEnable() {
	opentokSubscriber.subscribeToAudio(false);
	speakerIsMuted = true;
	updateUserState();
}

function speakerMuteDisable() {
	opentokSubscriber.subscribeToAudio(true);
	speakerIsMuted = false;
	updateUserState();
}

function speakerVolumeSliderDidChange(theValue) {
	if (opentokSubscriber != undefined) {
		opentokSubscriber.setAudioVolume(Math.round(theValue * 100));
	}
}

function speakerVolumeUp() {
	if (opentokSubscriber != undefined) {
		if (speakerIsMuted) {
			speakerMuteDisable();
		}
		opentokSubscriber.setAudioVolume(Math.min(100, opentokSubscriber.getAudioVolume() + 10));
		updateUserState();
	}
}

function speakerVolumeDown() {
	if (opentokSubscriber != undefined) {
		opentokSubscriber.setAudioVolume(Math.max(0, opentokSubscriber.getAudioVolume() - 10));
		if (opentokSubscriber.getAudioVolume() <= 0.01) {
			speakerMuteEnable();
		}
		updateUserState();
	}
}

function downloadFile(b64Data, fileName) {
	require("fs").writeFileSync(fileName, b64Data, 'base64', function(err) {
	  console.log(err);
	});
		
	self.downloadedData = b64Data;
	self.downloadedFileName = fileName;
	
	self.emit('downloaded', fileName);
}

function takePhoto() {
	if (!remoteRobotSupports("photo")) {
		debug("Capturing a photo appears to be disabled or not supported on the remote iPad.");
		return;
	}

	setTimeout(function () {
		sendCommand(commands.kDRCommandTakePhoto);
	}, 50);
}

function remoteRobotSupports(key) {
	return (statusValues && statusValues.supports && statusValues.supports.indexOf(key) >= 0);
}

function resetVideoLink(multiparty) {
	if (multiparty) {
		// switch to multiparty
		opentokDisconnect();
		resetSessionVariables();
		// sendCommand(commands.kDRCommandResetVideoLink);
		setTimeout(function() {
			sendCommandWithData(commands.kDRCommandRequestOpenTokSession, { "multiparty" : true });
			sessionIsMultipartyHost = true;
			sendCommand(commands.kDRCommandRequestStatusData);
		}, 500);
	} else {
		// normal
		opentokStopPublishing();
		setTimeout(function() {
			sendCommand(commands.kDRCommandRequestOpenTokSession);
			sendCommand(commands.kDRCommandRequestStatusData);
		}, 500);
	}	
	
	updateUserState();
}

function toggleNightVision() {
	if (nightVisionEnabled) {
		sendCommand(commands.kDRCommandLowLightModeOff);
		nightVisionEnabled = false;
	} else {
		sendCommand(commands.kDRCommandLowLightModeOn);
		nightVisionEnabled = true;
	}
}

function configAction() {
	
}

function qualityPreferenceDidChange() {
	sendCommandWithData(commands.kDRCommandResetVideoLink, { "qualityPreference" : self.qualityPreference });
}

function setQualityPreference(value) {
	sendCommandWithData(commands.kDRCommandResetVideoLink, { "qualityPreference" : self.qualityPreference = value });
}

function updateRobotsOnMap() {
	var hash = JSON.stringify(robotsList) +"-"+ publicRobotsSwitch;
	if (lastRobotsString != "" && lastRobotsString === hash) {
		// private robotsList is the same, so skipping
		return;
	} else {
		// robotsList is different, so updating
		lastRobotsString = hash;
	}

	robots = [];
	robotsPrivate = [];
	robotsPublic = [];

	if (robotsList.length > 0) {
		for (var i = 0; i < robotsList.length; i++) {
			if (robotsList[i].missingRobot == true && robotsList[i].status == kDRRobotStatusAway) {
				// hide these
			} else {
				if (robotsList[i].public_key != null) {
					robotsPublic.push(RobotWithSetup(robotsList[i].longitude, robotsList[i].latitude, robotsList[i]));
				} else if (robotsList[i].public_key == null) {
					robotsPrivate.push(RobotWithSetup(robotsList[i].longitude, robotsList[i].latitude, robotsList[i]));
				}
			}
		}

		if (publicRobotsSwitch == 1) {
			robots = robotsPublic;
		} else if (publicRobotsSwitch == 0) {
			robots = robotsPrivate;
		} else {
			robots = robotsPublic.concat(robotsPrivate);
		}
		
		self.robots = robots;

		if (robots.length > 0) {
			debug('robots[%s]:', robots.length);
			for (i in robots) {
				debug(robots[i]);
			}
			
			self.emit('robots', robots);
		} else {
			self.emit('error', new Error('No Robots Connected'));
		}
	} else {
		self.emit('error', new Error('No Robots Connected'));
	}
}

function showWebPage(URL) {
	opentokStopScreenSharing();

	URL = (URL.indexOf('://') == -1) ? 'http://' + URL : URL;
	sendCommandWithData(commands.kDRCommandWebURLShow, { "URL": URL });
	showingWebPage = true;
}

function hideWebPage() {
	sendCommandWithData(commands.kDRCommandWebURLHide);
	showingWebPage = false;
}

function makeInstallationId() {
	var text = "";
	var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

	for( var i = 0; i < 25; i++ ) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}

	return text;
}

function Robot() {
	this.longitude = 0.0;
	this.latitude = 0.0;
	this.dictionary = {};
}

function RobotWithSetup(lon, lat, d) {
	var n = new Robot();
	n.longitude = (lon) ? lon : 0;
	n.latitude = (lat) ? lat : 0;
	n.dictionary = d;
	return n;
}

function opentokConnect() {
	debug('opentokSessionId:', opentokSessionId);
	debug('opentokSessionToken:', opentokSessionToken);
	//TODO: Figure out how to run opentok SDK from node to stream the WebRTC data
}

function opentokDisconnect() {
	
}

//************************************************************************************

	extend(self, {
		setup: setup,
		socketIsConnected: socketIsConnected,
		makeInstallationId: makeInstallationId,
		getListOfRobots: getListOfRobots,
		connectTo: connectTo,
		disconnect: disconnect,
		keydrive: keydrive,
		keydown: keydown,
		keyup: keyup,
		reset: reset,
		fireDriveCommands: fireDriveCommands,
		park: parkAction,
		flip: flipAction,
		turnLeft: turnLeft,
		turnRight: turnRight,
		poleUp: poleUp,
		poleDown: poleDown,
		moveForward: moveForward,
		moveBackward: moveBackward,
		takePhoto: takePhoto,
		debug: debug,
	});
	
	//initializing
	self.setup();
	
} //DoubleDrive

util.inherits(DoubleDrive, EventEmitter);

module.exports = DoubleDrive;