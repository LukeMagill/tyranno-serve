//!
// add-static-paths
// MIT License
//
// This file provides a class to convert between user input and a standardized settings file

'use strict';

var fs = require('fs');
var mime = require('send').mime;
var path = require('path');
var send = require('send');
var url = require('url');

// Module constants.
// @private
const INJECTABLE_EXTENSIONS = new Set(["", ".html", ".htm", ".xhtml", ".php"]);
const INJECTED_CODE = fs.readFileSync(path.join(__dirname, "injected.html"), "utf8");
const BODY_END_REGEX = new RegExp("</body>", "i");

function serveFile(server, filePath, request, response, statusCode, nextFallback) {
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

    // We can't use stream with any status code but 200
    if (injectHtml || statusCode != 200) {
      fs.readFile(filePath, 'utf8', function(err, html) {
        if (err) {
          fileErrorResponse(err);
          return;
        }

        if (injectHtml) {
          html = html.replace(BODY_END_REGEX, INJECTED_CODE + "</body>");
        }

        let mimeType = mime.lookup(filePath);
        response.fromStatus(statusCode).content(html, mimeType);
      });

      return;
    }

    send(request, filePath)
      .on('error', (error) => errorResponse("streaming file", error.status, error))
      .on('directory', () => response.redirect(url.parse(request.url).pathname))
      .pipe(response);
  });

  function fileErrorResponse(err) {
    let code = err.code = 'ENOENT' ? 404 : 500;
    errorResponse("lstat", code, err);
  }

  function errorResponse(what, code, error) {
    if (code == 404) {
      if (nextFallback) {
        nextFallback();
      }
      else {
        response.notFound().doDefault();
      }
    }
    else {
      console.error("Error with " + what + ".");
      console.error(error);
      response.internalServerError().doDefault();
    }
  }
}

module.exports = serveFile;
