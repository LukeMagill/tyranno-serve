# Tyranno Serve

![Curdely Drawn Dinosaur](https://raw.githubusercontent.com/LukeMagill/tyranno-serve/master/icon.JPG)

Tyranno Serve is a server written in nodejs. It's purpose is to function both as a super lightweight static file server but to be flexible enough to expand to a more powerful system as the developer's needs increase. It is also meant to provide as many commonly used features as is reasonably possible and make everything very easy to access.

## Why?

- Tyranno-Serve sounds kind of like tyrannosaur and tyrannosaurs are awesome.
- Tyranno-Serve works from the command line, from a settings file, or from your node code.
- Tyranno-Serve can operate as a simple static file server.
- Tyranno-Serve can also do rest routing.
- Tyranno-Serve can do live reloads and automatically open a browser tab when it starts.

## Usage

### Command Line

To use tyranno-serve from the command line, it must be installed like this:

```
npm install -g tyranno-serve
```

The simplest possible example is as a static file server. Create a folder and add index.html like this:

index.html:
```
<!DOCTYPE html>
<html>
    <head><title>Simple example</title></head>
    <body>
        <p>Tyrannosaurs rule!</p>
    </body>
</html>
```

Then in your command line window, type

```
tyranno-serve
```

Wow! It just opened up a browser tab with your file in it! Also when you make changes the page reloads. Sweet.

The next thing you might want to do is serve files from a different folder. Let's say your folder is called src:

```
tyranno-serve src
```

Will serve from the src folder.

Wow it's so cool you say! What else can it do? The next big thing you might want to do is download an NPM module like angular2. Now, you notice that when you install angular2 in npm it shows up in your node__modules folder. Since your other files are served from your src folder you would have to copy them there. But then what if you update? You would have to copy them again. What a pain.

Never fear. Tyranno-serve let's you assign different paths to different folders. You can assign node__modules/angular2 to one path and src to everything else like this:

```
tyranno-serve --path =src --path node_modules/angular2=node_modules/angular2
```

Note that in this example, the paths overlap. The rule here is that if two paths overlap, the one with the most specific rule wins.

Are there any other features related to paths? Indeed yes!

Suppose you want to have tyranno-serve first look in one folder then, if it can't find anything, look in another. You can assign as many folders as you want to a particular path which causes it to fallback:

```
tyranno-serve --path =src --path =extra
```

Also, other options are suported. Try tyranno-serve --help for info on these.

### Settings File

Over time, you may start to realize that your command line instructios are becoming really hard to read. One way to help this is to create a settings json file. If your settings file is called tyranno.json, it will be read automatically. Otherwise you can specify a location with --settings. Here is an example:

tyranno.json:
```
{
    "paths": {
        "": "src",
        "node_modules/angular2": "node_modules/angular2"
    },
    "no-browser": true
}
```

### In code

Now at some point, you are probably going to decide that your service needs to have a little more complexity. You may need to add some rest APIs to back your app. At this point you may want to actually start using tyranno-serve from node code. The good news is that's very easy:

app.js:
```
var TyrannoServe = require('tyranno-serve')

var server = new TyrannoServer({ // could also be the string "tyranno.json" which will load from the settings file you had earlier.
    "paths": {
        "": "src",
        "node_modules/angular2": "node_modules/angular2"
    },
    "no-browser": true
});

var db = new Db();
server.addRoute('GET', '/api/v1.0/users/:userId', db.get);
server.addRoute('POST', '/api/v1.0/users/:userId', db.post);

// Write your database code here
function Db() {
    this.get = function(request, response) {
        // resuset.routeParams.userId has the user id
        mybackend.get(request.routeParams.userId).then(function(user) {
            response.ok().data(user);
        }, function() {
            request.internalServerError().doDefault();
        });
    }
    this.post = function(request, response) {
        // response.body is the user object
        mybackend.set(request.routeParams.userId, request.body).then(function() {
            request.ok().content("");
        }, function() {
            request.internalServerError().doDefault();
        });
    }
}
```

Notice that tyranno-serve allows you to set up certain paths as rest endpoints, so you can do with them whatever you want. The rest APIs act just like a regular function to the node http server but we add a few extra utilities for you:
  - If you specified route parameters (like :userId) then request.routeParams will have it.
  - If it is a post or put, you can look up the body with request.body.
  - Methods ok, internalServerError, badRequest, and notFound have been added to the response object. Each of these methods returns a ResponseSender which has data (to which you pass json data), content (to which you pass string content), and file (to which you pass a filename to serve).
  - Method redirect has been added to the response which can be called with a url as a parameter.

## FAQ

This section provides answers to problems that people have that I can't actually fix as far as I know.

- "Help! Everything seems fine but tyranno-serve just won't start up with certain folders." Check to see if there are a lot of files in the folder. File watcher can get overloaded which freezes your whole node instance. You can fix this by turning listening off or turning listening off for particular folders. Hopefully some of these will not actually be js files so you can safely ignore their change.

# NOTES

## Local editing

If you edit locally and want to test the command, do this:

```
<<cd to source directory>>
npm install -g .

npm link .

<<cd into other directory>>
npm uninstall tyranno-serve
npm link tyranno-serve
```

## Local testing

TyrannoServe uses mocha for testing. Be sure to run

```
npm install -g mocha
```
