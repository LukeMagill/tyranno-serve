#!/usr/bin/env node
/*!
 * index
 * MIT License
 *
 * This file does command line interpretation for tyranno-serve
 */

'use strict'

/**
 * Module dependencies.
 * @private
 */
var TyrannoServe = require('./tyranno-serve');
var tyrannoInput = require('./tyranno-input');
var argvOptions = require('./argv-options.json');

var settings = tyrannoInput.fromArgv(process.argv);
if (settings.version) {
  console.log("Version:\n" + require('./package.json').version);
}
else if (settings.help) {
  for (let name in argvOptions) {
    let option = argvOptions[name];

    if (!option.disabled) {
      console.log('\n--' + name);
      console.log(option.description);
    }
  }
}
else {
  var tyrannoServe = new TyrannoServe(settings);
  tyrannoServe.listen();
}
