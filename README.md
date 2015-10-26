# Dino Serve

Dino Serve is a server written in nodejs. It's purpose is to function both as a super lightweight static file server but to be flexible enough to expand to a more powerful system as the developer's needs increase. It is also meant to provide as many commonly used features as is reasonably possible and make everything very easy to access.

Note that I actually didn't write most of this code, I just brought it together so if you really like it, don't give me too much credit.

## Why?

- Dino Serve sounds kind of like dinosaur and dinosaurs are awesome.
- Dino serve works from the command line, from a settings file, or from your node code.
- Dino serve can operate as a simple static file server.
- Dino serve can do live reloads.
- Dino serve automatically loads the browser window when it starts.
- Dino serve can also do rest routing.

## How?

### Command Line

To use dino-serve from the command line, it must be installed like this:

```
npm-install -g dino-serve
```

The simplest possible example is as a static file server. Create a folder and add index.html like this:

index.html:
```
<!DOCTYPE html>
<html>
    <head><title>Simple example</title></head>
    <body>
        <p>Dinosaurs rule!</p>
    </body>
</html>
```

Then in your command line window, type

```
dino-serve
```

The first thing you might want to do is serve files from a different folder. Let's say your folder is called src:

```
dino-serve src
```

Let's say you want to serve different paths from different folders. This will allow you to keep different kinds of files in different parts of your filesystem if you want to. Do this:

```
dino-serve --paths "/=src;/node_modules/angular2=/node_modules/angular2"
```

Note that in this example, the paths overlap. The rule here is that if two paths overlap, the one with the most specific rule wins

Also, other options are suported...

### Settings File

Over time, the readability of the command line may become an annoyance. One way to help this is to create a settings json file. If your settings file is called dino.json, it will be read automatically. Otherwise you can specify a location with --settings. Here is an example:

dino.json:
```
{
    "paths": {
        "/": "src",
        "/node_modules/angular2": "/node_modules/angular2"
    },
    "no-browser": true
}
```

### In code

If you decide that your service needs to have a little more complexity, like a simple CRUD API, you should move dino.json into your node code. The good news is that's very easy:

app.js:
```
var DinoServe = require('dino-serve')

var server = new DinoServer({ // could also be the string "dino.json" which will load from the settings file you had earlier.
    "paths": {
        "/": "src",
        "/node_modules/angular2": "/node_modules/angular2"
    },
    "no-browser": true
});

var db = new Db();
server.folder('/api/v1.0')
    .get('/users/:userId', db.get)
    .post('/users/:userId', db.post);

// Write your database code here
function Db() {
    this.get = function(routeParams) {
        // routeParams.userId has the user id
        // return the user object from your database
        // If there is an error throw any object with an integer status (like 404)
    }
    this.post = function(body, routeParams) {
        // body is the user object
        // Don't return anything, just throw on error as before
    }
}
```
