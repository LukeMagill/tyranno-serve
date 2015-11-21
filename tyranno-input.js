//!
// tyranno-input
// MIT License
//
// This file provides a class to convert between user input and a standardized settings file

'use strict';

var path = require('path');
var fs = require('fs');
var _ = require('lodash');

var argvOptions = require('./argv-options.json');

/**
 * Class for interpreting settings files and settings objects and converting them into a standard, easy to use format.
 * @internal
 */
class TyrannoInput {
  /**
   * Creates a settings object from the given filename.
   *
   * @param settingsFile {string} The filename to load the settings from.
   */
  fromFile(settingsFile) {
    settingsFile = path.resolve(settingsFile);
    let settingsCwd = path.dirname(settingsFile);
    let settings = JSON.parse(fs.readFileSync(settingsFile));

    settings = this._fromObject(settings);

    this._remapPaths(settings, settingsCwd);
    return settings;
  }

  // remap the paths. This is so if the tyranno.json is in a different path than the current, we use
  // it's path as the cwd.
  _remapPaths(settings, settingsCwd) {
    var self = this;

    settings.paths = _.mapValues(settings.paths, function(staticPaths) {
      return _.map(staticPaths, (sp) => self._remapPath(sp, settingsCwd));
    });

    let defaults = ['notFound', 'badRequest', 'internalServerError'];
    defaults.forEach(function(def) {
      if (settings[def]) {
        settings[def] = self._remapPath(settings[def], settingsCwd);
      }
    });
  }

  _remapPath(staticPath, settingsCwd) {
    if (!path.isAbsolute(staticPath)) {
      staticPath = path.join(settingsCwd, staticPath);
    }
    return staticPath;
  }

  // Does some normalization
  _fromObject(settings) {
    if (!settings.paths) {
      settings.paths = {};
    }

    if (!_.isObject(settings.paths)) {
      throw new Error("Paths must be an object.");
    }

    settings.paths = _.mapValues(settings.paths, function(value) {
      if (_.isString(value)) {
        return [value];
      }
      return value;
    });

    if (settings.noBrowser) {
      settings.open = [];
    }
    else if (_.isString(settings.open)) {
      settings.open = [settings.open];
    }
    else if (!settings.open) {
      settings.open = [''];
    }

    let ignorePaths = settings.ignorePaths;
    if (!ignorePaths) {
      settings.ignorePaths = false;
    }

    return settings;
  }

  /**
   * Instantiates a settings object from an arbitrary input parameter.
   *
   * @param input {string|object} If a string it reads the filename, otherwise it loads and normalizes it as an object.
   */
  fromInput(input) {
    // Instantiate with defaults
    let settings = this._fromObject({ });

    let type = typeof input;
    if (type === "string") {
      if (!path.isAbsolute(input)) {
        throw "You must specify an absolute filename. Consider something like:\nnew TyrannoServe(path.join(__dirName, 'tyranno.json'))";
      }
      settings = this.fromFile(input);
    }
    else if (type === "object") {
      // If it's null we'll just use the default
      if (input) {
        settings = this._fromObject(input);
      }
    }
    else if (type === "undefined") {
      // No problem, use default
    }
    else {
      throw "Not a valid constructor input: " + input;
    }

    return settings;
  }

  /**
   * From argv converts an argument input into a standard settings json object that can be used by tyranno-serve.
   *
   * @param {[string]} argv The command line arguments.
   * @return {object} The json-like argument object.
   */
  fromArgv(argv) {
    let settings = this._convertArgvToObject(argv);

    let fileSettings = {};
    if (settings.settings) {
      let settingsFile = path.resolve(settings.settings);
      let settingsCwd = path.dirname(settingsFile);

      let fileSettings = JSON.parse(fs.readFileSync(settingsFile));
      this._remapPaths(fileSettings, settingsCwd);

      this._mergeSettings(settings, fileSettings);
    }
    else if (fs.existsSync('tyranno.json')) {
      this._mergeSettings(settings, this.fromFile('tyranno.json'));
    }

    this._initializeDefaultSettings(settings);

    return settings;
  }

  // Creates a settings object based on the argv-options.json file.
  _convertArgvToObject(argv) {
    let settings = { };

    // If running tyranno-serve directly, just lob off base command
    let startIndex = 1;
    if (argv[0].indexOf('tyranno-serve') == -1) {
      // Otherwise this is node, so we have to lob off node and index.js
      startIndex = 2;
    }

    for (let i = startIndex; i < argv.length; i++) {
      let name = 'path';
      let value = '';

      if (argv[i].startsWith('--')) {
        name = argv[i].substring(2);
      }
      else if (argv[i].startsWith('-')) {
        throw new Error("Single hyphen args not yet supported. Please use -- args.");
      }
      else {
        value = '=' + argv[i];
      }

      if (!_.has(argvOptions, name)) {
        throw new Error("Unknown option '" + name + "'.");
      }

      let option = argvOptions[name];

      let realName = name;
      if (option.name) {
        realName = option.name;
      }

      if (option.type == 'flag') {
        settings[realName] = true;
        continue;
      }

      // If it's not a flag we need to assume the next one is the value, unless we already grabbed
      // it.
      if (!value) {
        i++;

        if (i >= argv.length) {
          throw new Error("Expecting argument for key '" + name + "'.");
        }

        value = argv[i];
      }

      if (name == 'path') {
        // Paths work differently with special parsing rules
        if (!_.has(settings, 'paths')) {
          settings.paths = {};
        }

        let index = value.indexOf('=');
        let serverPath = value.substring(0, index);
        let filePath = value.substring(index + 1);

        if (!_.has(settings.paths, serverPath)) {
          settings.paths[serverPath] = [filePath];
        }
        else {
          settings.paths[serverPath].push(filePath);
        }
      }
      else if (option.type == 'array') {
        if (!_.has(settings, name)) {
          settings[realName] = [value];
        }
        else {
          settings[realName].push(value);
        }
      }
      else {
        if (!_.has(settings, name)) {
          settings[realName] = value;
        }
        else {
          throw new Error("Argument option '" + name + "' can only be specified once.");
        }
      }
    }

    return settings;
  }

  // Merges two different sets of settings together intelligently, keeping path and array values from both.
  _mergeSettings(settings, extraSettings) {
    for (let name in extraSettings) {
      if (name == 'paths') {
        continue;
      }

      if (!_.has(settings, name)) {
        settings[name] = extraSettings[name];
        continue;
      }

      let option = _.findWhere(argvOptions, { realName: name });

      if (option.type == 'array') {
        for (let value in extraSettings[name]) {
          if (!_.includes(settings[name], value)) {
            settings[name].push(value);
          }
        }
      }
    }

    if (extraSettings.paths) {
      if (!settings.paths) {
        settings.paths = {};
      }

      for (let urlPath in extraSettings.paths) {
        if (!_.has(settings.paths, urlPath)) {
          settings.paths[urlPath] = extraSettings.paths[urlPath];
        }
        else {
          extraSettings.paths[urlPath].forEach(function(staticPath) {
            if (!_.includes(settings.paths[urlPath], staticPath)) {
              settings.paths[urlPath].push(staticPath);
            }
          });
        }
      }
    }
  }

  // Initializes settings that have not yet been specified to their appropriate defaults.
  _initializeDefaultSettings(settings) {
    for (let name in argvOptions) {
      let option = argvOptions[name];

      let realName = name;
      if (option.name) {
        realName = option.name;
      }

      if (!_.has(settings, realName)) {
        if (realName == 'paths') {
          settings['paths'] = { '' : path.resolve('') };
        }
        else if (_.has(option, 'default')) {
          settings[realName] = option['default'];
        }
        else if (option.type == 'flag') {
          // Flags default to false
          settings[realName] = false;
        }
        else if (option.type == 'array') {
          settings[realName] = [];
        }
      }
    }
  }
}

module.exports = new TyrannoInput();
