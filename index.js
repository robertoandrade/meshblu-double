'use strict';
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var debug = require('debug')('meshblu-double');
var DoubleDrive = require('./double-drive');
var extend = require('node.extend');

var MESSAGE_SCHEMA = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      required: true,
      enum: [
		"getListOfRobots",
		"getStateUpdate",
		"connectTo",
		"disconnect",
		"reset",
		"fireDriveCommands",
		"park",
		"flip",
		"turnLeft",
		"turnRight",
		"poleUp",
		"poleDown",
		"moveForward",
		"moveBackward",
		"move",
		"look",
		"takePhoto"
      ]
    },
    args: {
      type: 'array',
      required: false
    },
  }
};

var OPTIONS_SCHEMA = {
  type: 'object',
  properties: {
    userId: {
      type: 'string',
      required: true
    },
    gatewayInstallationId: {
      type: 'string',
      required: false
    },
    robotInstallationId: {
      type: 'string',
      required: true
    },
    public_key: {
      type: 'string',
      required: false
    }
  }
};

function getDefaultOptions(callback) {
	debug("getDefaultOptions");
	
	//TODO: Figure out how to receive the userId from options (first) to use when producing a list for robotInstallationId (id = name style on the GUI if possible)
	var robotInstallations = [];
	
	if (this.drive) {
		this.drive.getListOfRobots();
		this.drive.on("robots", function(robots) {
			robotInstallations.concat(robots);
		});
	}
	
	callback(null, {
		gatewayInstallationId: makeInstallationId(),
		public_key: 'doubledemo',
		robotInstallationId: robotInstallations //TODO: How to render friendly names on list but pick ID instead
	});
}

//TODO: Do we need to receive messenger, options, api, deviceObj?
function Plugin(){
  debug("constructing...");  
  this.options = {};
  this.messageSchema = MESSAGE_SCHEMA;
  this.optionsSchema = OPTIONS_SCHEMA;
  return this;
}
util.inherits(Plugin, EventEmitter);

Plugin.prototype.onMessage = function(message){
  debug("onMessage", message);
	
  var payload = message.payload;
  var func = this.drive[payload.action];
  
  if (payload.action) {
	  debug("invoking action:", payload.action, "with params:", payload.args, func);
	  
	  if (func) func.apply(this.drive, payload.args || []);
  }
	  
  this.lastAction = payload.action;
  
  //this.emit('message', {devices: ['*'], topic: 'echo', payload: payload});
};

Plugin.prototype.onConfig = function(device){
  debug("onConfig", device);
  this.setOptions(device.options||{});
};

Plugin.prototype.setOptions = function(options){
  if (JSON.stringify(this.options) == JSON.stringify(options)) return;
  
  var plugin = this;
  
  debug("setOptions", options);
  this.options = options;
  
  var drive = this.drive = new DoubleDrive({
	userId: options.userId,
	installationId: options.gatewayInstallationId,
	public_key: options.public_key
  });
  
  debug("isConnected:", drive.socketIsConnected());
  
  function emitIf(action, topic, payload) {
	  if (plugin.lastAction == action) {
		  plugin.lastAction = "";
		  
		  plugin.emit("message", {devices: ['*'], topic: topic, payload: payload});
	  }
  }
  
  drive.on("robots", function(robots) {
	  if (!drive.connectedTo) {
		  debug("connected. calling robot...");
	  
		  drive.connectTo(options.robotInstallationId);
		  
		  drive.connectedTo = options.robotInstallationId;
	  }
	  
	  emitIf("getListOfRobots", 'robots', robots);
  });
  
  drive.on("state_updated", function() {
	  var state = extend({}, drive);
	  
	  for (i in state) {
		  if (typeof i == "string" && (i.match(/self|debug|_events|robots/) || typeof state[i] == "function")) {
			  delete state[i];
		  }
	  }
	  
	  emitIf("getStateUpdate", 'robot_state', state);
  });
  
  drive.on("downloaded", function() {
	  if (plugin.lastAction == "takePhoto") {
		  plugin.lastAction = "uploadPhoto";
		  
		  drive.uploadPhoto();
	  }
  });
  
  drive.on("uploaded", function(img) {
	  emitIf("uploadPhoto", 'photo', { url: img });
  });
  
  drive.on("error", function(error) {
	  plugin.emit("message", {devices: ['*'], topic: "error", payload: error});
  });
};

module.exports = {
  messageSchema: MESSAGE_SCHEMA,
  optionsSchema: OPTIONS_SCHEMA,
  getDefaultOptions: getDefaultOptions,
  Plugin: Plugin
};
