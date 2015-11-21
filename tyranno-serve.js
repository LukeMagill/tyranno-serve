//!
// tyranno-serve
// MIT License
//
// This file provides the server class that can be used to host services with minimal set up for both static files and rest.

'use strict';

// Module dependencies.
// @private
var _ = require('lodash');
var EventEmitter = require('events');
var fs = require('fs');
var http = require('http');
var open = require('opn');
var url = require('url');

var tyrannoInput = require('./tyranno-input');
var addStaticPaths = require('./add-static-paths.js');
var serveFile = require('./serve-file.js');
var FileWatcher = require('./file-watcher');

// Module constants.
// @private
const METHODS = new Set(["GET", "POST", "PUT", "DELETE", "PATCH"]);
const BODY_METHODS = new Set(["POST", "PUT"]);

/**
 * Tyrannosaurus server. Does everything you want from a server. Defaults to a simple static server, but rest callbacks
 * can be added later.
 * @public
 */
class TyrannoServe {
  /**
   * Constructs the tyranno serve. Can be constructed similarly to how it is used on the command line.
   *
   * @param input {string|object} Either a path to a json file to use for settings or an object of settings. Note
   * that this parameter is optional.
   */
  constructor(input) {
    var self = this;

    this._settings = tyrannoInput.fromInput(input);
    this.hostname = this._settings.hostname;
    this.shouldListen = !this._settings.noListen

    this._fileWatcher = new FileWatcher(this._settings.wait, this._settings.noListenPaths);

    this._routes = {};

    this._emitter = new EventEmitter();

    for (let myUrl in this._settings.paths) {
      let staticPaths = this._settings.paths[myUrl];
      this.addPaths(myUrl, staticPaths);
    }

    if (this._settings.port) {
      this.port = this._settings.port;
    }

    // util
    this._responseAugmenter = new ResponseAugmenter(this);

    let defaults = ['notFound', 'badRequest', 'internalServerError'];
    defaults.forEach(function(def) {
      if (self._settings[def]) {
        self[def + 'Default'](self._settings[def]);
      }
    });
  }

  /**
   * Adds a listener function to the given event name. Currently we only do close
   * events, but we could add more.
   *
   * @param eventName {string} The name of the event.
   * @param listener {function} The callback to be called when the event happens.
   */
  addListener(eventName, listener) {
    this._emitter.addListener(eventName, listener);
  }

  /**
   * Adds the given set of paths to the specified route. Note that if multiple static paths are specified they
   * are treated as fallbacks.
   *
   * @param urlPath {string} The url path to listen on.
   * @param staticPaths {string|array} The set of static paths that this url should map to. When multiple are
   * specified, if a resource cannot be found in the first static path the next paths will be searched in
   * order.
   */
  addPaths(urlPath, staticPaths) {
    if (!_.isString(urlPath)) {
      throw new Error("Url path must be a string.");
    }
    if (!_.isArray(staticPaths)) {
      throw new Error("Static paths must be an array.");
    }

    urlPath = normalizePath(urlPath);
    addStaticPaths(this, urlPath, staticPaths, this._fileWatcher);
  }

  /**
   * Adds a route to the given method and path.
   *
   * @param method {string} The method. Should be GET, PUT, POST, DELETE, or PATCH.
   *
   * @param pathname {string} The path. In general, a path should be a series of strings with slashes between, but
   * tyranno-serve also allows you to specify route variables by starting a folder with a colon. For example,
   * /users/:userId/products/:productId would allow any string to be specified for the userId and productId. In
   * addition, if you specify a path with two colons, it will consume all characters after including slashes (this
   * is how the static file server works.).
   * In general, multiple url definitions may conflict, (for example '/users/:userId' for getting user info but then
   * '/users/:userId/products/:productId' for getting a user's product). Tyranno-Serve will try to find the most
   * specific possible match for a particular url by matching folders. For example, if the user and product paths were
   * specified and nothing else, if you looked for '/users/abc/products' it would come out with not found. This is
   * because there was something specified under products but it required an id, and nothing was specified under
   * just products. '/users/abc' and 'users/abc/products/def' would work as expected however.
   *
   * @param callback A callback function that takes a request and a response object. The request and response object
   * are the same that would be received from the http.Server.listen command with some additions:
   *   * The request object will have a routeParams variable added with the route parameters defined in the url.
   *   * The response object will have extra methods ok, notFound, badRequest, internalServerError, and redirect. Please
   *     see the response augmenter for information about these.
   */
  addRoute(method, pathname, callback) {
    if (!_.isString(method) || !METHODS.has(method)) {
      throw new Error("Method must be a string and one of these values: " + Array.from(METHODS).join(', ') + ".");
    }
    if (!_.isString(pathname)) {
      throw new Error("Path must be a string");
    }
    if (!_.isFunction(callback)) {
      throw new Error("Must provide a valid callback.");
    }

    pathname = normalizePath(pathname);
    var stripped = pathname.replace(/[:\/]/g, '');
    if (encodeURIComponent(stripped) != stripped) {
      throw new Error("The pathname contains illegal characters: '" + pathname + "'.");
    }

    method = method.toUpperCase();
    if (!METHODS.has(method)) {
      throw new Error("Invalid method supplied.");
    }
    
    var pieces = getPieces(pathname, method);
    var current = this._routes;
    var hasDoubleColon = false;

    pieces.forEach(function(piece) {
      if (hasDoubleColon) {
        throw new Error("Double colon variables must be final.");
      }
      if (piece.startsWith('::')) {
        hasDoubleColon = true;
      }

      var otherPieces = _.omit(current, piece, '^callback');
      var variablePieces = _.filter(otherPieces, isRouteVariable)
      var constantPieces = _.filter(otherPieces, _.negate(isRouteVariable))

      let variableLength = _.size(variablePieces);

      if (isRouteVariable(piece)) {
        if (variableLength > 1 || (variableLength == 1 && variablePieces[0] != piece)) {
          let message = [
            "A route cannot have more than one variable at any one location.",
            " You already have '", variablePieces[0],
            "' so you must rename variable '", piece,
            "' to '", variablePieces[0], "'."
          ].join('');
          throw new Error(message);
        }
      }

      if (current[piece] == null) {
        current[piece] = {};
      }
      current = current[piece];
    });

    // ^ is an illegal character for uris, so by using this we force a unique, untaken
    // string (i.e. what if the user picks /callback/ as their route?)
    current['^callback'] = callback;
  }

  /**
   * Serves a particular request for this server object. Does routing logic and adds
   * utility functions to the request and response objects before they are passed
   * into the callback registered for a particular route.
   *
   * @param request The incoming http request.
   * @param response The response object to send data to.
   */
  serve(request, response) {
    var pathname = url.parse(request.url).pathname;
    pathname = normalizePath(pathname);
    var method = request.method;
    var pieces = getPieces(pathname, method);

    var routeParams = {};

    var current = this._routes;
    var doubleColonPieces = [];

    pieces.forEach(function(piece) {
      if (current != null) {
        if (_.has(current, piece)) {
          current = current[piece];
          return;
        }

        let variable = _.find(_.keys(current), isRouteVariable);
        if (variable) {
          if (variable.length > 1 && variable[1] == ':') {
            // Note we don't modify current, this allows us to gobble up the rest
            // of the url.
            doubleColonPieces.push(piece);
          }
          else {
            let name = variable.substring(1);
            routeParams[name] = decodeURIComponent(piece);
            current = current[variable];
          }
        }
        else {
          current = null;
        }
      }
    });

    let doubleColon = _.find(_.keys(current), (s) => s.startsWith('::'));
    if (doubleColon) {
      current = current[doubleColon];
      let name = doubleColon.substring(2);
      routeParams[name] = decodeURIComponent(doubleColonPieces.join('/'));
    }

    this._responseAugmenter.augment(request, response);
    request.routeParams = routeParams;

    if (_.has(current, '^callback')) {
      if (BODY_METHODS.has(method)) {
        var callback = function(body) {
          request.body = body;
          current['^callback'].call(null, request, response);
        };
        getBodyData(request, callback);
      }
      else {
        current['^callback'].call(null, request, response);
      }
    }
    else {
      response.notFound().doDefault();
    }
  }

  /**
   * Actually starts listening for incoming requests.
   *
   * @param callback {function} A callback function for when listening has started.
   */
  listen(callback) {
    if (!callback) {
      callback = () => { };
    }
    else if (!_.isFunction(callback)) {
      throw new Error("Callback must be a function or nothing.");
    }

    // If we don't wrap it we lose this
    var self = this;
    function serve(request, response) {
      self.serve(request, response);
    }

    this._server = http.createServer(serve);

    if (!this.port) {
      this.port = 1024 + Math.floor(Math.random() * (65535 - 1024));
    }

    this._server.listen(this.port, this.hostname, 511, callback);
    
    _.each(this._settings.open, function(pathname) {
      open("http://127.0.0.1:" + self.port + "/" + normalizePath(pathname));
    });

    if (!this._settings.quiet) {
      console.log("Serving at http://127.0.0.1:" + this.port);
    }

    this._fileWatcher.listenOn(this._server);
  }

  /**
   * Turns off this server so that resources like ports and file watchers are released.
   *
   * @param callback {function} A callback function for when closing has started.
   */
  close(callback) {
    this._server.close(callback);
    this._emitter.emit('close');
  }

  /**
   * Sets the default callback for not found.
   *
   * @param input {string|function} Either a string or a function. If it's a callback it is used directly. If it's
   * a string it is treated as a filename. WARNING: because the fallback and path mechanism is incompatible with this
   * this string must either be an absolute path or relative to the CWD. Otherwise it can't find it.
   */
  notFoundDefault(input) {
    this._setDefault('notFoundDefault', 'notFound', input);
  }


  /**
   * Sets the default callback for bad request.
   *
   * @param input {string|function} @see notFoundDefault.
   */
  badRequestDefault(input) {
    this._setDefault('badRequestDefault', 'badRequest', input);
  }

  /**
   * Sets the default callback for internal server error.
   *
   * @param input {string|function} @see notFoundDefault.
   */
  internalServerErrorDefault(input) {
    this._setDefault('internalServerErrorDefault', 'internalServerError', input);
  }

  _setDefault(which, key, input) {
    let callback = input;
    if (_.isString(input)) {
      // Be sure the file exists
      fs.lstatSync(input);

      callback = (response) => response[key]().file(input);
    }
    if (!_.isFunction(callback)) {
      throw new Error("Must provide a vaid callback.");
    }
    this._responseAugmenter[which] = callback;
  }
}

/**
 * The ResponseAugmenter is responsible for augmenting responses that come in throught the server with utility functions.
 */
class ResponseAugmenter {
  /**
   * Constructs the augmenter with default values for notFound, badRequest, and internalServerError.
   */
  constructor(server) {
    this._server = server;
    this.notFoundDefault = (response) => response.notFound().content('Not found.', 'text/plain');
    this.badRequestDefault = (response) => response.baRequest().content('Bad request.', 'text/plain');
    this.internalServerErrorDefault = (response) => response.internalServerError().content('Internal server error.', 'text/plain');
  }

  /**
   * Actually augments the response. The augmented functions are: ok, notFound, badRequest, internalServerError, and
   * redirect. With the exception of redirect, all of these return a ResponseSender object. Redirect takes a redirectUrl
   * string as an argument. NotFound, BadRequest, and InternalServerError all have defaults that can be set up.
   *
   * @param response The object to augment.
   */
  augment(request, response) {
    response.ok = () => new ResponseSender(this._server, request, response, 200, null);
    response.notFound = () => new ResponseSender(this._server, request, response, 404, this.notFoundDefault);
    response.badRequest = () => new ResponseSender(this._server, request, response, 400, this.badRequestDefault);
    response.internalServerError = () => new ResponseSender(this._server, request, response, 500, this.internalServerErrorDefault);
    response.redirect = function redirect(redirectUrl) {
      response.writeHead(301, { 'Location': redirectUrl });
      response.end();
    }
    response.fromStatus = (statusCode) => new ResponseSender(this._server, request, response, statusCode, null);
  }
}

/**
 * The ResponseSender is a utility class that allows you to easily send data with
 * a particular response code.
 */
class ResponseSender {
  /**
   * Constructor.
   *
   * @param server {TyrannoServe} The server object; used for settings.
   * @param request The request object to use
   * @param response The response object to use.
   * @param statusCode {number} The status code to send when we write a response.
   * @param defaultCallback {function} Default function to call for this type.
   */
  constructor(server, request, response, statusCode, defaultCallback) {
    this._server = server;
    this._request = request;
    this._response = response;
    this._statusCode = statusCode;
    this._defaultCallback = defaultCallback;
  }

  /**
   * Sends the given content to the caller as a response.
   *
   * @param value {string} The value to send.
   * @param mimeType {string} The mime type to send.
   */
  content(value, mimeType) {
    this._response.writeHead(this._statusCode, { 'Content-Type': mimeType });
    this._response.write(value);
    this._response.end();
  }

  /**
   * Sends json data back to the caller as a response.
   *
   * @param value Any object to be sent.
   */
  data(value) {
    this._response.writeHead(this._statusCode, { 'Content-Type': 'application/json' });
    this._response.write(JSON.stringify(value));
    this._response.end();
  }

  /**
   * Serves a file from the given location.
   *
   * @param filePath {string} The path of the file in question.
   * @param nextCallback {function} A function to call if you get a not found.
   */
  file(filePath, nextCallback) {
    serveFile(this._server, filePath, this._request, this._response, this._statusCode, nextCallback);
  }

  /**
   * Does the default action if available.
   */
  doDefault() {
    if (!this._defaultCallback) {
      throw new Error("There is no default callback for this action (" + this._statusCode + ").");
    }
    this._defaultCallback(this._response);
  }
}

// Utility methods
// @private

function isRouteVariable(str) {
  return str.length > 0 && str[0] == ':';
}

/**
 * Splits a string path into an array based on the / character and prepends the
 * method.
 *
 * @param {string} pathname The string path to be split.
 * @param {string} method The method of the http request. Should be GET, PUT, POST, etc
 * @return {[string]} An array of split strings.
 */
function getPieces(pathname, method) {
  let pieces = pathname.split("/");
  pieces.unshift(method);
  return pieces;
}

function getBodyData(request, callback) {
  var body = '';
  request.on('data', function (data) {
    body += data;
  });
  request.on('end', function () {
    callback(JSON.parse(body));
  });
}

function normalizePath(pathname) {
  if (pathname[0] == '/') {
    pathname = pathname.substring(1);
  }
  if (pathname[pathname.length - 1] == '/') {
    pathname = pathname.substring(0, pathname.length - 1);
  }
  return pathname;
}

// Module exports.
// @public
module.exports = TyrannoServe;
module.exports.mime = require('send').mime;
