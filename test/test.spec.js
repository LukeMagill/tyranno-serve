/*!
 * test
 * MIT License
 *
 * This file holds some tests.
 */

'use strict';

var _ = require('lodash');
var assert = require('assert');
var path = require('path');
var request = require('request');

var TyrannoServe = require('../tyranno-serve');
var tyrannoInput = require('../tyranno-input');

describe('TyrannoServer', function() {
  describe('serving files', function () {
    it('should serve 1.txt from test/samples/1.txt', function (done) {
      let server = basicServe();
      let always = () => server.close();
      requestAssert('http://127.0.0.1:2314/1.txt', 200, "text 1 from file", done, always);
    });

    it('should add a script tag to an html file', function(done) {
      let server = basicServe();
      request('http://127.0.0.1:2314/', function(error, response, body) {
        assert.equal(null, error);
        assert.equal(200, response.statusCode);
        assert.notEqual(-1, body.indexOf('<script>'));
        server.close(done);
      });
    });

    it('should be able to do a fallback', function(done) {
      let paths = {
        '': [
          path.join(__dirname, 'samples/1'),
          path.join(__dirname, 'samples/2')
        ]
      };
      let server = basicServe(paths);

      let ifSuccess = _.after(2, done);
      let always = _.after(2, () => server.close());

      requestAssert('http://127.0.0.1:2314/1.txt', 200, "text 1 from file", ifSuccess, always);
      requestAssert('http://127.0.0.1:2314/2.txt', 200, "Text for 2", ifSuccess, always);
    });

    it('should be able to serve different folders with different paths', function(done) {
      let paths = {
        '': path.join(__dirname, 'samples/1'),
        '2': path.join(__dirname, 'samples/2')
      };
      let server = basicServe(paths);

      let ifSuccess = _.after(2, done);
      let always = _.after(2, () => server.close());

      requestAssert('http://127.0.0.1:2314/1.txt', 200, "text 1 from file", ifSuccess, always);
      requestAssert('http://127.0.0.1:2314/2/2.txt', 200, "Text for 2", ifSuccess, always);
    });

    it('should be able to nest variables and paths under each other', function(done) {
      var server = new TyrannoServe({ quiet: true, noBrowser: true, port: 2314 });

      let ifSuccess = _.after(2, done);
      let always = _.after(2, () => server.close());

      server.addRoute('GET', '/users/:userId', function(request, response) {
        assert.equal(1, request.routeParams.userId);
        response.ok().data("hola");
      });
      server.addRoute('GET', '/users/:userId/products/:productId', function(request, response) {
        assert.equal(2, request.routeParams.userId);
        assert.equal(3, request.routeParams.productId);
        response.ok().data("namaste");
      });

      server.listen();

      requestAssert('http://127.0.0.1:2314/users/1', 200, '"hola"', ifSuccess, always);
      requestAssert('http://127.0.0.1:2314/users/2/products/3', 200, '"namaste"', ifSuccess, always);
    });

    it('should be able to listen to a different host', function(done) {
      let settings = tyrannoInput.fromArgv(['tyranno-serve',
        '--no-browser', '--quiet',
        '--hostname', 'localhost',
        '--path', '=' + path.join(__dirname, 'samples/1')]);
      let server = new TyrannoServe(settings);
      server.listen();
      let always = () => server.close();
      requestAssert('http://127.0.0.1:2314/1.txt', 200, "text 1 from file", done, always);
      done();
    });

    it('has descriptions for all options.', function() {
      let argvOptions = require('../argv-options.json');
      for (let name in argvOptions) {
        let description = argvOptions[name].description;
        assert.ok(description, "Argument '" + name + "' must have a description.");
        assert.ok(_.isString(description), "Argument '" + name + "' must be a string.");
        assert.ok(10 < description.length, "Argument '" + name + "' must have a real description.");
      }
    });

    it('can load paths from a settings file specified on the command line and merge', function(done) {
      let settings = tyrannoInput.fromArgv(['tyranno-serve',
        '--no-browser', '--quiet',
        '--port', 2314,
        '--path', '=' + path.join(__dirname, 'samples/2'),
        '--settings', path.join(__dirname, 'samples/simplest-config.json')]);
      let server = new TyrannoServe(settings);
      server.listen();

      let ifSuccess = _.after(2, done);
      let always = _.after(2, () => server.close());

      requestAssert('http://127.0.0.1:2314/1.txt', 200, "text 1 from file", ifSuccess, always);
      requestAssert('http://127.0.0.1:2314/2.txt', 200, "Text for 2", ifSuccess, always);
    });

    it('adds an open command if none are specified', function() {
      let settings = tyrannoInput.fromArgv(['tyranno-serve',
        '--settings', path.join(__dirname, 'samples/simplest-config.json')]);
      assert.ok(settings.open.length > 0, "Settings should have at least one open command.");

      settings = tyrannoInput.fromArgv(['tyranno-serve']);
      assert.ok(settings.open.length > 0, "Settings should have at least one open command.");
    });

    it('should not add a script tag to an html file when no-listen is specified', function(done) {
      let settings = tyrannoInput.fromArgv(['tyranno-serve',
        '--no-browser', '--quiet', '--no-listen',
        '--port', 2314,
        '--settings', path.join(__dirname, 'samples/simplest-config.json')]);
      let server = new TyrannoServe(settings);
      server.listen();

      request('http://127.0.0.1:2314/', function(error, response, body) {
        try {
          assert.equal(null, error);
          assert.equal(200, response.statusCode);
          assert.equal(-1, body.indexOf('<script>'));
          done();
        }
        finally {
          server.close();
        }
      });
    });

    it('can create a path from a name free argument parameter', function(done) {
      let settings = tyrannoInput.fromArgv(['tyranno-serve',
        '--no-browser', '--quiet',
        '--port', 2314,
        path.join(__dirname, 'samples/1')]);
      let server = new TyrannoServe(settings);
      server.listen();

      let always = () => server.close();
      requestAssert('http://127.0.0.1:2314/1.txt', 200, "text 1 from file", done, always);
    });

    it('sends a default 404 message', function(done) {
      let server = basicServe();
      let always = () => server.close();
      requestAssert('http://127.0.0.1:2314/doesntExist.txt', 404, "Not found.", done, always);
    });

    it('has a customizeable 404 message.', function(done) {
      let server = basicServe();
      server.notFoundDefault(path.join(__dirname, 'samples/1/not-found.txt'));
      let always = () => server.close();
      requestAssert('http://127.0.0.1:2314/doesntExist.txt', 404, "Custom not found message.", done, always);
    });

    it('can load a not found default from a settings file', function(done) {
      let settings = tyrannoInput.fromArgv(['tyranno-serve',
        '--no-browser', '--quiet',
        '--port', 2314,
        '--not-found', path.join(__dirname, 'samples/1/not-found.txt'),
        path.join(__dirname, 'samples/1')]);
      let server = new TyrannoServe(settings);
      server.listen();

      let always = () => server.close();
      requestAssert('http://127.0.0.1:2314/doesntExist.txt', 404, "Custom not found message.", done, always);
    });

    it('automatically adds an open parameter if nobrowser is not specified.', function() {
      let settings = tyrannoInput.fromInput({});
      assert.equal(1, settings.open.length);
      assert.equal('', settings.open[0]);
    });

    it('should be able to serve a route both with and without a trailing slash.', function(done) {
      var server = new TyrannoServe({ quiet: true, noBrowser: true, port: 2314 });

      server.addRoute('GET', '/one', function(request, response) {
        response.ok().content('one');
      });
      server.addRoute('GET', '/two/', function(request, response) {
        response.ok().content('two');
      });
      server.listen();

      let ifSuccess = _.after(4, done);
      let always = _.after(4, () => server.close());

      requestAssert('http://127.0.0.1:2314/one', 200, 'one', ifSuccess, always);
      requestAssert('http://127.0.0.1:2314/one/', 200, 'one', ifSuccess, always);
      requestAssert('http://127.0.0.1:2314/two', 200, 'two', ifSuccess, always);
      requestAssert('http://127.0.0.1:2314/two/', 200, 'two', ifSuccess, always);
    });

    it('can serve files with special characters in the names', function(done) {
      let settings = tyrannoInput.fromArgv(['tyranno-serve',
        '--no-browser', '--quiet',
        '--port', 2314,
        path.join(__dirname, 'samples/3')]);
      let server = new TyrannoServe(settings);
      server.listen();

      let ifSuccess = _.after(2, done);
      let always = _.after(2, () => server.close());

      requestAssert('http://127.0.0.1:2314/%C3%A9toile.txt', 200, 'étoile', ifSuccess, always);
      requestAssert('http://127.0.0.1:2314/cute%20monster%23.txt', 200, 'cute monster#', ifSuccess, always);
    });

  });
});

function basicServe(paths) {
  if (!paths) {
    paths = { '': path.join(__dirname, 'samples/1') };
  }

  let settings = {
    port: 2314,
    paths: paths,
    noBrowser: true,
    quiet: true
  };

  let server = new TyrannoServe(settings);
  server.listen(); 

  return server;
}

/**
 * Gets a callback for request that asserts the response status code is correct and
 * that the text matches the expectation.
 *
 * @param {string} requestUrl Url to send the request to
 * @param {int} Expected status code
 * @param {string} expectedText The text that is expected. Note that equality is checked after both expected and actual are trimmed.
 * @param {function} ifSuccess Method to call if request completes successfully
 * @param {function} always Method to call no matter what
 */
function requestAssert(requestUrl, expectedStatusCode, expectedText, ifSuccess, always) {
  request(requestUrl, onRequested);

  function onRequested(error, response, body) {
    try {
      assert.equal(null, error, "Request to '" + requestUrl + "' resulted in a non-null error: " + error);
      assert.equal(expectedStatusCode, response.statusCode, "Invalid status code for '" + requestUrl + "'.");
      
      // Vim enters extra newlines...not worth fixing
      assert.equal(expectedText.trim(), body.trim(), "Invalid body for '" + requestUrl + "'.");

      ifSuccess();
    }
    finally {
      // Be sure to turn off the server even if there are failures, otherwise all other tests will fail.
      always();
    }
  };
}
