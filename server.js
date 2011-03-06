var express = require('express');
var app = express.createServer();
var redis = require('redis');

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
    var uuid = require("./uuid");
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
    console.log('socket.io: connection');
    r.incr("socketio-conn");

    client.on('message', function(msg) {
        console.log('message: ' + msg);
    });
    client.on('disconnect', function() {
        console.log('socket.io: disconnect');
        r.decr("socketio-conn");
    });
});

