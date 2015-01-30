'use strict';
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var debug = require('debug')('mobiblu-double');

var MESSAGE_SCHEMA = {
  type: 'object',
  properties: {
    exampleBoolean: {
      type: 'boolean',
      required: true
    },
    exampleString: {
      type: 'string',
      required: true
    }
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
      required: true
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
	//TODO: Figure out how to receive the userId from options to use when producing a list for robotInstallationId (id = name style on the GUI if possible) 
	callback(null, {
		gatewayInstallationId: makeInstallationId(),
		public_key: 'doubledemo',
	});
}

//TODO: Do we need to receive messenger, options, api, deviceObj?
function Plugin(){
  this.options = {};
  this.messageSchema = MESSAGE_SCHEMA;
  this.optionsSchema = OPTIONS_SCHEMA;
  return this;
}
util.inherits(Plugin, EventEmitter);

Plugin.prototype.onMessage = function(message){
  var payload = message.payload;
  this.emit('message', {devices: ['*'], topic: 'echo', payload: payload});
};

Plugin.prototype.onConfig = function(device){
  this.setOptions(device.options||{});
};

Plugin.prototype.setOptions = function(options){
  this.options = options;
};

module.exports = {
  messageSchema: MESSAGE_SCHEMA,
  optionsSchema: OPTIONS_SCHEMA,
  getDefaultOptions: getDefaultOptions,
  Plugin: Plugin
};
