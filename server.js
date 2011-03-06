var express = require('express');
var app = express.createServer();
var redis = require('redis');
var uuid = require("./uuid");

// Configuration
app.configure(function(){
    app.use(express.methodOverride());
    app.use(express.bodyParser());
    var RedisStore = require('connect-redis');
    app.use(express.cookieParser());
    app.use(express.session({ secret: "asldfkjasdlkfjaskl", store: new RedisStore }));
    app.use(app.router);
});

app.configure('development', function(){
    app.use(express.static(__dirname + '/static'));
    app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
    var oneYear = 31557600000;
    app.use(express.static({ root: __dirname + '/static', maxAge: oneYear }));
    app.use(express.errorHandler());
});


// Express
app.get('/', function(req, res) {
    var client = redis.createClient();
    if (!req.session.uid) {
        req.session.uid = uuid.uuid();
        console.log("IP: " + req.connection.address().address);
        client.hset(req.session.uid, 'ip', req.connection.address().address);
    }
    res.render('index.jade', { variable: "Hell World!", uid: req.session.uid });
});

app.get('/chat', function(req, res) {
    if (!req.session.uid) {
    } else {
        res.render('chat.jade', { uid: req.session.uid });
    }
});


var port = 3000;
if (process.env["NODE_PORT"])
    port = process.env["NODE_PORT"];
app.listen(port);


// Socket.IO
var io = require('socket.io');
var socket = io.listen(app);
socket.on('connection', function(client){
    var r = redis.createClient();
    var cstatus = 'CONNECTED';  // Client Status
    var uid;  // User ID
    var rid;  // Room ID
    console.log('socket.io: connection');
    r.incr("socketio-conn");

    client.on('message', function(msg) {
        console.log('message: ' + msg);
        var result;
        if (cstatus == 'CONNECTED' && (result = msg.match(/UID ([a-f0-9\-]+)/))) {
            // Login
            uid = result[1];
            r.hget(uid, 'ip', function(err, ip) {
                console.log('UID: ' + uid);
                console.log('IP: ' + ip);
                cstatus = 'LOGGEDIN';
                r.hset(uid, 'status', cstatus);
                client.send("OK " + cstatus);
            });
        }
        else if (cstatus == 'LOGGEDIN' && (result = msg.match(/FIND/))) {
            // Find a partner
            // Add myself to the waiting list
            r.rpush('waitinglist', uid);
            r.on("message", function(channel, message) {
                assert(channel == "waiting:" + uid);
                result = message.match(/JOIN ([a-f0-9\-]+)/);
                assert(result);
                r.unsubscribe("waiting:" + uid);
                rid = result[1];
                r.sadd('joined-room:' + uid, rid);
                cstatus = "JOINED"
                client.send("OK " + cstatus + " " + rid);
                r.on("message", function(channel, message) {
                    client.send("MSG " + message);
                });
                r.subscribe("room:" + rid);
            });
            r.subscribe("waiting:" + uid);
        }
        else if (cstatus == 'JOINED' && (result = msg.match(/MSG ([a-z0-9\- ]+)/))) {
            // Send a message in the joined room
            var message = result[1];
            console.log('MSG: ' + message);
            r.publish("room:" + rid, message);
        }
    });
    client.on('disconnect', function() {
        console.log('socket.io: disconnect');
        r.decr("socketio-conn");
    });
});

