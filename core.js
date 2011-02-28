var app = require('express').createServer()
    , socket = require('socket.io').listen(app)
    , _ = require('underscore')._
    , Backbone = require('backbone')
    , redis = require('redis')
    , redisClient = redis.createClient();

redisClient.on("error", function(err) {
    console.log("Error " + err);
});

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

redisClient.get("NodeChatModel:2", function(err, data) {
    if (err)
    {
        console.log("Error: " + err);
    }
    else if (data) {
        nodeChatModel.mport(JSON.parse(data));
        console.log("Revived " + nodeChatModel.chats.length + " chats");
    }
    else {
        console.log("No data returned for key");
    }
});


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

    //Prune old stuff
    console.log("Length before " + nodeChatModel.chats.length);
    if (nodeChatModel.chats.length >= 10) 
    {
        var length = nodeChatModel.chats.length;
        while (length >= 10)
        {
            nodeChatModel.chats.remove(nodeChatModel.chats.first());
            length--;
        }
    }

    console.log("Length after " + nodeChatModel.chats.length);

    var expandedMsg = chat.get("name") + ": " + chat.get("text");
    console.log("(" + client.sessionId + ") " + expandedMsg);
    redisClient.set("NodeChatModel:2", JSON.stringify(nodeChatModel.xport()), redis.print);

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
