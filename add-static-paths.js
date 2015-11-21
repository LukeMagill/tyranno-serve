/*!
 * tyranno-input
 * MIT License
 *
 * This file provides a class to convert between user input and a standardized settings file
 */

'use strict';

var _ = require('lodash');
var fs = require('fs');
var mime = require('mime');
var path = require('path');
var send = require('send');
var url = require('url');

/**
 * Module constants.
 * @private
 */
const INJECTABLE_EXTENSIONS = new Set(["", ".html", ".htm", ".xhtml", ".php"]);
const INJECTED_CODE = fs.readFileSync(path.join(__dirname, "injected.html"), "utf8");
const BODY_END_REGEX = new RegExp("</body>", "i");

function addStaticPaths(server, urlPath, staticPaths, fileWatcher) {
  if (!_.isString(staticPaths) && !_.isArray(staticPaths)) {
    throw new Error("Static paths is required.");
  }
  if (!_.isString(urlPath)) {
    throw new Error("Url path is required.");
  }

  if (_.isString(staticPaths)) {
    staticPaths = [staticPaths];
  }

  let pathSpecifier = urlPath + '/::filePath';

  server.addRoute('GET', pathSpecifier, servePaths);

  if (server.shouldListen) {
    let watchers = [];
    _.each(staticPaths, function(staticPath) {
      let watcher = fileWatcher.addWatch(staticPath);

      if (!watcher) {
        throw new Error("Unable to add watcher for static path '" + staticPath + "'.");
      }

      watchers.push(watcher);
    });

    server.addListener('close', function() {
      _.each(watchers, function(watcher) {
        watcher.close();
      });
    });
  }

  function servePaths(request, response) {
    var index = 0;

    servePath(request, response);

    function servePath(request, response) {
      if (index >= staticPaths.length) {
          response.notFound().doDefault();
          return;
      }

      let staticPath = staticPaths[index];
      var filePath = path.join(staticPath, request.routeParams.filePath);

      fs.lstat(filePath, function(err, stats) {
        if (err) {
          fileErrorResponse(err);
          return;
        }

        if (stats.isDirectory()) {
          filePath = path.join(filePath, 'index.html');
        }

        let extension = path.extname(filePath).toLocaleLowerCase()
        let injectHtml = INJECTABLE_EXTENSIONS.has(extension) && server.shouldListen;

        if (injectHtml) {
          fs.readFile(filePath, 'utf8', function(err, html) {
            if (err) {
              fileErrorResponse(err);
              return;
            }

            html = html.replace(BODY_END_REGEX, INJECTED_CODE + "</body>");

            let mimeType = mime.lookup(filePath);
            response.ok().content(html, mimeType);
          });

          return;
        }

        stream();
      });

      function stream() {
        send(request, filePath)
          .on('error', (error) => errorResponse("streaming file", error.status, error))
          .on('directory', () => response.redirect(url.parse(request.url).pathname))
          .pipe(response);
      }

      function fileErrorResponse(err) {
        let code = err.code = 'ENOENT' ? 404 : 500;
        errorResponse("lstat", code, err);
      }

      function errorResponse(what, code, error) {
        if (code == 404) {
          index++;
          servePath(request, response);
        }
        else {
          console.error("Error with " + what + ".");
          console.error(error);
          response.internalServerError().doDefault();
          return;
        }
      }
    }
  }
}

module.exports = addStaticPaths;
