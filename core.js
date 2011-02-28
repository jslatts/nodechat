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

var nodeChatModel = new models.NodeChatModel();

nodeChatModel.chats.add(new models.ChatEntry({text: 'greetings webling'}));
nodeChatModel.chats.add(new models.ChatEntry({text: 'how are you today?'}));

console.log("I have " + nodeChatModel.chats.length + " chats");

socket.on('connection', function(client){
    activeClients += 1;
    client.on('disconnect', function(){clientDisconnect(client)});
    client.on('message', function(msg){chatMessage(client, socket, msg)});

    client.send({
        event: 'initial',
        data: nodeChatModel.xport()
    });

    socket.broadcast({
        event: 'update',
        clients: activeClients
    });
});

function chatMessage(client, socket, msg){
    var chat = new models.ChatEntry();
    chat.mport(msg);
    nodeChatModel.chats.add(chat);

    var expandedMsg = chat.get("name") + ": " + chat.get("text");
    console.log("(" + client.sessionId + ") " + expandedMsg);

    socket.broadcast({
        event: 'chat',
        data:chat.xport()
    }); 
}

function clientDisconnect(client) {
    activeClients -= 1;
    client.broadcast({clients:activeClients})
}

app.listen(8000)
