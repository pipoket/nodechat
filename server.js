var express = require('express');
var app = express.createServer();
var redis = require('redis');
var uuid = require("./uuid");

function assert(exp, message) {
    if (!exp) {
        throw Error("Assertion Failed: " + message);
    }
}

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
        res.redirect('back');
    } else {
        res.render('chat.jade', { uid: req.session.uid });
    }
});


var port = 3000;
if (process.env["NODE_PORT"])
    port = process.env["NODE_PORT"];
app.listen(port);


redis.createClient().flushdb();


// Matching thread
var timerId;
var matchPartner = function() {
    client = redis.createClient();
    client.lpop('waitinglist', function(err, val) {
        if (!val) return;
        var uid1 = val;
        client.lpop('waitinglist', function(err, val) {
            if (!val) {
                client.lpush('waitinglist', uid1);
                return;
            }
            var uid2 = val;
            var rid = uuid.uuid();
            client.rpush("rooms", rid);
            client.incr("room-count");
            client.publish("waiting:" + uid1, "JOIN " + rid);
            client.publish("waiting:" + uid2, "JOIN " + rid);
        });
    });
    timerId = setTimeout(matchPartner, 1000);
}
timerId = setTimeout(matchPartner, 1000);


// Socket.IO
var io = require('socket.io');
var socket = io.listen(app);
socket.on('connection', function(client){
    var r = redis.createClient();
    var r_pubsub;
    r.on("error", function(err) {
        console.log(err);
    });
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
            r_pubsub = redis.createClient();
            r_pubsub.on("message", function(channel, message) {
                console.log("Room found!");
                assert(channel == "waiting:" + uid, "UID does not match");
                result = message.match(/JOIN ([a-f0-9\-]+)/);
                assert(result, "Message is wrong");
                r_pubsub.unsubscribe("waiting:" + uid);
                rid = result[1];
                r.sadd('joined-room:' + uid, rid);
                cstatus = "JOINED"
                r.hset(uid, 'status', cstatus);
                client.send("OK " + cstatus + " " + rid);

                // Process the messages
                r_pubsub = redis.createClient();
                r_pubsub.on("message", function(channel, message) {
                    client.send("MSG " + message);
                });
                r_pubsub.subscribe("room:" + rid);
            });
            r_pubsub.subscribe("waiting:" + uid);
        }
        else if (cstatus == 'JOINED' && (result = msg.match(/MSG (.+)/))) {
            // Send a message in the joined room
            var message = result[1];
            console.log('MSG: ' + message);
            r.publish("room:" + rid, uid + " " + message);
        }
    });
    client.on('disconnect', function() {
        if (cstatus == 'JOINED') {
            r.publish("room:" + rid, "PART " + uid);
            r_pubsub.unsubscribe("room:" + rid);
        }
        console.log('socket.io: disconnect');
        r.decr("socketio-conn");
    });
});

