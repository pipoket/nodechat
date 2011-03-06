var express = require('express');
var app = express.createServer();

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
app.get('/', function(req, res){
    var uuid = require("./uuid");
    if (!req.session.uid) {
        req.session.uid = uuid.uuid();
    }
    res.render('base.jade', { variable: "Hell World!", uid: req.session.uid });
});
app.listen(3000);


// Socket.IO
var io = require('socket.io');
var socket = io.listen(app);
socket.on('connection', function(){
    console.log('socket.io: connection');
});
