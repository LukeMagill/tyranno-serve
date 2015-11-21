/*!
 * tyranno-serve
 * MIT License
 *
 * This file provides the server class that can be used to host services with minimal set up for both static files and rest.
 */

'use strict';

/**
 * Module dependencies.
 * @private
 */
var watchr = require('watchr');
var WebSocket = require('faye-websocket');
var path = require('path');

class FileWatcher {

  /**
   * @param wait {Number} Milliseconds to wait between the time a change is detected and the time a
   * reload command is sent.
   * @param ignorePaths {false|[string]}
   */
  constructor(wait, ignorePaths) {
    this.wait = wait;
    this.ignorePaths = ignorePaths;
  }

  listenOn(server) {
    var self = this;
    this._clients = [];
    server.addListener('upgrade', function(request, socket, head) {
      var ws = new WebSocket(request, socket, head);
      ws.onopen = function() { ws.send('connected'); };

      if (self.wait > 0) {
        var wssend = ws.send;
        var waitTimeout;

        ws.send = function() {
          var args = arguments;
          if (waitTimeout) {
            clearTimeout(waitTimeout);
          }

          waitTimeout = setTimeout(function(){
            wssend.apply(ws, args);
          }, self.wait);
        };
      }

      ws.onclose = function() {
        self._clients = self._clients.filter(function (x) {
          return x !== ws;
        });
      };

      self._clients.push(ws);
    });
  }

  addWatch(directoryPath) {
    var self = this;

    // Setup file watcher
    return watchr.watch({
      path: directoryPath,
      ignorePaths: this.ignorePaths,
      ignoreCommonPatterns: true,
      ignoreHiddenFiles: true,
      preferredMethods: [ 'watchFile', 'watch' ],
      interval: 503,
      listeners: {
        error: function(err) {
          console.error("Error with watchr.");
          console.error(err);
        },
        change: function(eventName, filePath, fileCurrentStat, filePreviousStat) {
          self._clients.forEach(function(ws) {
            if (!ws) {
              return;
            }
            if (path.extname(filePath) === ".css") {
              ws.send('refreshcss');
            }
            else {
              ws.send('reload');
            }
          });
        }
      }
    });
  }
}

module.exports = FileWatcher;
