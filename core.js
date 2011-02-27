var app = require('express').createServer();
var socket = require('socket.io').listen(app);
var _ = require('underscore')._,
    Backbone = require('backbone');

var models = require('./models/models');

require('jade');
app.set('view engine', 'jade');
app.set('view options', {layout: false});

//routes
app.get('/*.(js|css)', function(req, res){
    res.sendfile("./"+req.url);
});

app.get('/', function(req, res){
    res.render('index');
});

var activeClients = 0;

socket.on('connection', function(client){
    activeClients += 1;
    socket.broadcast({clients:activeClients});
    client.on('disconnect', function(){clientDisconnect(client)});
    client.on('message', function(msg){chatMessage(client, socket, msg)});
});

function chatMessage(client, socket, msg){
    var expandedMsg = msg.name + ": " + msg.text;
    socket.broadcast({chat:expandedMsg}); 
    console.log("(" + client.sessionId + ") " + expandedMsg);
}

function clientDisconnect(client) {
    activeClients -= 1;
    client.broadcast({clients:activeClients})
}

app.listen(8000)
