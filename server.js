var express = require('express')
    , app = express.createServer()
    , connect = require('connect')
    , jade = require('jade')
    //, socket = require('socket.io').listen(app, {transports: ['websocket', 'htmlfile', 'xhr-multipart', 'xhr-polling','jsonp-polling']})
    , socket = require('socket.io').listen(app)
    , _ = require('underscore')._
    , Backbone = require('backbone')
    , models = require('./models/models')
    , path = require('path');

require('joose');
require('joosex-namespace-depended');
require('hash');

var redis = require('redis')
    , rc = redis.createClient()
    , redisStore = require('connect-redis');
    //, redisStore = require('./connect-redis');

rc.on('error', function(err) {
    console.log('Error ' + err);
});

redis.debug_mode = false;
var dev_port = 8000;
var server_port = 80;
var config_file = '/home/node/nodechat_config';
 
//configure express 
app.use(express.bodyParser());
app.use(express.cookieParser());
//app.use(express.session({ store: new redisStore({maxAge: 10 * 24 * 60 * 60 * 1000}), secret: 'Secretly I am an elephant' }));
app.use(express.session({ store: new redisStore({maxAge: 10 * 1000}), secret: 'Secretly I am an elephant' }));

app.set('view engine', 'jade');
app.set('view options', {layout: false});


function authenticate(name, pass, fn) {
    console.log('Auth for ' + name + ' with password ' + pass);
    
    rc.get('user:' + name, function(err, data){
        if (!data) {
            rc.set('user:' + name, name, function(err, data){
                rc.set('user:' + name + '.password', pass, function(err, data){
                    var user = {};
                    user.name = name;
                    return fn(null, user);
                });
            });
        }
        else {
            var user = {};
            user.name = data;
            rc.get('user:' + name + '.password', redis.print);
            rc.get('user:' + name + '.password', function(err, data){
                if (pass == data) {
                    user.pass = pass;
                    console.log('Auth succeeded for ' + name + ' with password ' + pass);
                    return fn(null, user);
                }
                fn(new Error('invalid password'));
            });
        }
    });
}

function restrict(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    req.session.error = 'Access denied!';
    res.redirect('/login');
  }
}

//setup routes
app.get('/logout', function(req, res){
  // destroy the user's session to log them out
  // will be re-created next request
  req.session.destroy(function(){
    res.redirect('home');
  });
});

app.get('/login', function(req, res){
  console.log('GET /login - sessionid: ' + req.session.sid);
  res.render('login');
});

app.get('/disconnect', function(req, res){
    res.render('disconnect');
});

app.post('/login', function(req, res){
  authenticate(req.body.username, req.body.password, function(err, user){
    if (user) {
      // Regenerate session when signing in
      // to prevent fixation 
      req.session.regenerate(function(){
        // Store the user's primary key 
        // in the session store to be retrieved,
        // or in this case the entire user object
        console.log('regenerated session id ' + req.session.id);
        req.session.cookie.maxAge = 100 * 24 * 60 * 60 * 1000; //Force longer cookie age
        req.session.cookie.httpOnly = false;
        req.session.user = user;
        req.session.hash = Hash.sha512(user.pass);
        console.log('Storing new hash for user ' + user.name + ': ' + req.session.hash);
        res.redirect('/');
      });
    } else {
      req.session.error = 'Authentication failed, please check your '
        + ' username and password.';
      res.redirect('back');
    }
  });
});

app.get('/*.(js|css|swf)', function(req, res){
    res.sendfile('./'+req.url);
});



//create local state
var nodeChatModel = new models.NodeChatModel();

rc.lrange('chatentries', -1000, -1, function(err, data) {
    if (err)
    {
        console.log('Error: ' + err);
    }
    else if (data) {
        _.each(data, function(jsonChat) {
            try {
                var chat = new models.ChatEntry();
                chat.mport(jsonChat);
                nodeChatModel.chats.add(chat);
            }
            catch(err) {
                console.log('Failed to revive chat ' + jsonChat + ' with err ' + err);
            }
        });

        console.log('Revived ' + nodeChatModel.chats.length + ' chats');
    }
    else {
        console.log('No data returned for key');
    }
});

function disconnectAndRedirectClient(client, fn) {
    console.log('Disconnecting unauthenticated user');
    client.send({ event: 'disconnect' });
    client.connection.end();
    fn();
    return;
}

socket.on('connection', function(client){
    // helper function that goes inside your socket connection
    client.connectSession = function(fn) {
        if (!client.request || !client.request.headers || !client.request.headers.cookie) {
            disconnectAndRedirectClient(client,function() {
               console.log('Null request/header/cookie!');
            });
            return;
        }

        console.log('Cookie is' + client.request.headers.cookie);

        var match = client.request.headers.cookie.match(/connect\.sid=([^;]+)/);
        if (!match || match.length < 2) {
            disconnectAndRedirectClient(client,function() {
                console.log('Failed to find connect.sid in cookie')
            });
            return;
        }

        var sid = unescape(match[1]);

        rc.get(sid, function(err, data) {
            fn(err, JSON.parse(data));
        });
    };

    client.connectSession(function(err, data) {
        if(err) {
            console.log('Error on connectionSession: ' + err);
            return;
        }

        var connectedUser = getConnectedUser(data, client);
        if(connectedUser) {
            client.on('message', function(msg){message(client, socket, msg)});

            sendInitialDataToClient(client);
        }
        else 
            console.log("Failed to connect user");
    });
});

var topPoster = {};
topPoster.name = 'noone';
topPoster.count = 0;
topPoster.lettercount = 0;

function sendInitialDataToClient(client) {
    if (nodeChatModel.chats.length > 16)
        var chatHistory = nodeChatModel.chats.rest(nodeChatModel.chats.length-16);
    else 
        var chatHistory = nodeChatModel.chats;

    console.log('sending ' + chatHistory.length);

    nodeChatModel.users.forEach(function(user) {
        var sUser = new models.User({name:user.get('name')});
        client.send({
            event: 'user:add',
            data: sUser.xport()
        });
    });

    chatHistory.forEach(function(chat) {
        client.send({
            event: 'chat',
            data: chat.xport()
        });
    });
}

function getConnectedUser(data, client) {
    if(!data || !data.user || !data.user.name) {
        console.log('[getConnectedUser] called with null data, data.user or data.user.name');
        return;
    }

    cleanName = data.user.name.replace(/</g, "&lt;").replace(/>/g, "&gt;");

    var connectedUser = nodeChatModel.users.find(function(user){return user.get('name') == cleanName;});

    if(!connectedUser) {
        connectedUser = new models.User({'client': client, 'name': cleanName});
        connectedUser.clientList = new Array();
        connectedUser.clientList.push(client);

        nodeChatModel.users.add(connectedUser);
        console.log('new user: ' + connectedUser.get('name'));
    
        var sUser = new models.User({name:connectedUser.get('name')});
        console.log('Connected User ' + sUser.xport({recurse: false}));
        client.broadcast({
            event: 'user:add',
            data: sUser.xport({recurse: false})
        });

        //Count multiple connections in case someone has a window open
        connectedUser.currentConnections = 1;

        //Set disconnect here so we can destroy the user model
        client.on('disconnect', function(){ 
            clientDisconnect(client, function() {
                if(connectedUser.currentConnections > 1) {
                    connectedUser.currentConnections--;
                }
                else {
                    console.log('Removing user from active pool: ' + connectedUser.get('name'));
                    connectedUser.currentConnections = 0;
                    var sUser = new models.User({name:connectedUser.get('name')});
                    socket.broadcast({
                        event: 'user:remove',
                        data: sUser.xport({recurse: false})
                    });

                    nodeChatModel.users.remove(connectedUser);
                }
            });
        });
    } 
    //Looks like the user has a new session for some reason. try and deal with this
    else if (!_.any(connectedUser.clientList, function(c) { return c == client; })) {
        connectedUser.currentConnections++;
        connectedUser.clientList.push(client);

        //Set disconnect here so we can destroy the user model
        client.on('disconnect', function(){ 
            clientDisconnect(client, function() {
                if(connectedUser.currentConnections > 1) {
                    connectedUser.currentConnections--;
                }
                else {
                    console.log('Removing user from active pool: ' + connectedUser.get('name'));
                    connectedUser.currentConnections = 0;
                    var sUser = new models.User({name:connectedUser.get('name')});
                    socket.broadcast({
                        event: 'user:remove',
                        data: sUser.xport({recurse: false})
                    });

                    nodeChatModel.users.remove(connectedUser);
                }
            });
        });
    }

    return connectedUser;
}

//Handle receipt of client messages over socket
function message(client, socket, msg){
    if(msg.rediskey) {
        console.log('received from client: ' + msg.rediskey);
    }
    if(msg.event === 'clientauthrequest') {
        console.log('clientauthrequest received with hash ' + msg.data);
    }
    else {
        var chat = new models.ChatEntry();
        chat.mport(msg);
        client.connectSession(function(err, data) {
            if(err) {
                disconnectAndRedirectClient(client,function() {
                    console.log('[message] Error on connectSession: ' + err);
                });
                return;
            }

            var connectedUser = getConnectedUser(data, client);
            if(!connectedUser) {
                disconnectAndRedirectClient(client,function() {
                    console.log('[message] connectedUser is null or empty');
                });
                return;
            }

            var cleanChat = chat.get('text') + ' ';
            if (cleanChat)
                cleanChat = cleanChat.replace(/</g, "&lt;").replace(/>/g, "&gt;");

            var userName = connectedUser.get('name');
            chat.set({'name': userName, 'text': cleanChat});

            rc.get('userban:'+userName, function(err, udata){
                if (err) { console.log('Error: ' + err); }
                else if (udata == 1)
                {
                    console.log('Banned: ' + udata); 
                    return;
                }
                else {
                    if (topPoster.name == userName && userName != 'jslatts') {
                        if(topPoster.count > 5 || topPoster.lettercount > 700)
                            return; 
                        else {
                            //set a timer to reset this
                            clearTimeout(topPoster.timeOut);
                            topPoster.timeOut = setTimeout(function() {
                                topPoster.count = 0;
                            },5000);

                            topPoster.count++;
                            topPoster.lettercount+=cleanChat.length;
                        }
                    }
                    else {
                        topPoster.name = userName;
                        topPoster.count = 1;
                        topPoster.lettercount = 1;
                    }

                    if(chat.get('text').length > 140)
                        return;

                    rc.incr('next.chatentry.id', function(err, newId) {
                        chat.set({id: newId, time:getClockTime(), datetime: new Date().getTime()});
                        console.log(chat.xport());

                        //If we have hashes, deal with them
                        var shouldBroadcast = handleDirects(chat, connectedUser); 
                        checkForMashTagUnSub(chat, connectedUser); 
                        handleMashTags(chat, connectedUser); 

                        if (shouldBroadcast)
                            broadcastChat(chat,client);

                    }); 
                }
            });
        });
    }
}

var broadcastChat = function(chat, client) {
    nodeChatModel.chats.add(chat);

    console.log('[' + client.sessionId + '] ' + chat.xport());

    rc.rpush('chatentries', chat.xport({recurse: false}), redis.print);

    socket.broadcast({
        event: 'chat',
        data:chat.xport()
    }); 
}

function handleDirects(chat, originalUser) {
    var direct = getDirectsFromString(chat.get('text'));

    if(direct) {
        console.log('looking for direct targer user ' + direct);
        var foundUser = nodeChatModel.users.find(function(user){return user.get('name') == direct;});
        
        console.log('found user is ' + foundUser);
        if (foundUser) {
            console.log('Located direct targer user' + foundUser.get('name'));
            foundUser.directs.add(chat);

            _.each(foundUser.clientList, function(client) { 
                client.send({
                    event: 'direct',
                    data: chat.xport()
                });
            });

            rc.rpush('user:' + foundUser.get('name') + '.directs', chat.xport({recurse: false}), redis.print);

            //Send back to the original user
            _.each(originalUser.clientList, function(client) { 
                client.send({
                    event: 'direct',
                    data: chat.xport()
                });
            });
        }
    }
    else
        return true;
}

function getDirectsFromString(chatText) {
    var directIndex = chatText.indexOf('@');

    var direct = null;
    if(directIndex > -1) {
        var endPos = chatText.indexOf(' ', directIndex+1);
        direct = chatText.substring(directIndex+1, endPos);
        console.log('Found direct: ' + direct);
    }

    return direct;
}

//Handles MashTag creation and notification
//TODO - refactor to use CPS
function handleMashTags(chat, user) {
    if(!user) {
        console.log('[handleMashTags] user is null');
        return;
    }

    var mashTags = getChunksFromString(chat.get('text'), '#');
    if(mashTags.length > 0) {
        var alreadyNotifiedUsers = new Array(); //Make sure we only send a multi-tagged chat once

        for (var t in mashTags) {
            var foundTag = nodeChatModel.mashTags.find(function(tag){return tag.get('name') == mashTags[t];});

            //Create a new mashTag if we need to
            if (!foundTag) {
                var createTag = function (tagName) {
                    rc.incr('next.mashtag.id', function(err, newMashId){
                        foundTag = new models.MashTagModel({'id': newMashId, 'name': tagName});

                        //Add the tag to the global list, the users list (since they submitted it), and the chat message. Then add subcribe the user
                        //to the mash tag.
                        nodeChatModel.mashTags.add(foundTag);
                        user.followedMashTags.add(foundTag);
                        foundTag.watchingUsers.add(user);
                        foundTag.mashes.add(chat);

                        //Send the tag back to the user
                        _.each(user.clientList, function(client) { 
                            client.send({
                                event: 'mashtag',
                                data: foundTag.xport({recurse: false})
                            });
                        });

                        notifySubscribedMashTagUsers(chat,foundTag, alreadyNotifiedUsers);
                    });
                };
                createTag(mashTags[t]);
            } 
            else {
                //In the case the tag exists, check to see if the submitting user has it
                if(!user.followedMashTags.some(function(t) { return t == foundTag; }))
                {
                    user.followedMashTags.add(foundTag);

                    _.each(user.clientList, function(client) { 
                        client.send({
                            event: 'mashtag',
                            data: foundTag.xport({recurse: false})
                        });
                    });
                }

                if(!foundTag.watchingUsers.some(function(u) { return u == user; })) 
                    foundTag.watchingUsers.add(user);

                if(!foundTag.mashes.some(function(m) { return m == chat; })) 
                    foundTag.mashes.add(chat);

                //Notify all the subscribed users
                notifySubscribedMashTagUsers(chat,foundTag, alreadyNotifiedUsers);
            }
        }
    }
}

//Look for unsubscription notifications
function checkForMashTagUnSub(chat, user) {
    var mashTagsToRemove = getChunksFromString(chat.get('text'), '-');
    if(mashTagsToRemove.length > 0) {
        for (var t in mashTagsToRemove) {
            var foundTag = nodeChatModel.mashTags.find(function(tag){return tag.get('name') == mashTagsToRemove[t];});

            if (foundTag) {
                user.followedMashTags.remove(foundTag);
                foundTag.watchingUsers.remove(user);

                //Notify client that tag was unsub'd
                _.each(user.clientList, function(client) { 
                    client.send({
                        event: 'mashtag:delete',
                        data: foundTag.xport({recurse: false})
                    });
                });
            }
        }
    }
}

//Send the chat to all currently subscribed users for a mashTag
function notifySubscribedMashTagUsers(chat, mashTag, doNotNotifyList){
    mashTag.watchingUsers.forEach(function(user){
        if (doNotNotifyList[user.get('name')]) return;

        console.log('notifying ' + user.get('name') + ' for chat' + chat.xport());
        _.each(user.clientList, function(client) { 
            client.send({
                event: 'mash',
                data: chat.xport()
            });
        });

        //Add the user to do not call list so they only get one copy
        doNotNotifyList[user.get('name')] = 1;
    });
}

//Returns chunks with the delimiter _stripped_
function getChunksFromString(chatText, delimiter) {
    var chunkIndex = chatText.indexOf(delimiter);
    var chunks = new Array();
    var startPos = 0;

    while(startPos <= chatText.length && chunkIndex > -1) {

        //Grab the tag and push it on the array
        var endPos = chatText.indexOf(' ', chunkIndex+1);
        chunks.push(chatText.substring(chunkIndex+1, endPos).toLowerCase());
        
        //Setup for the next one
        startPos = endPos +1;
        chunkIndex = chatText.indexOf(delimiter, startPos);
    }
    
    if(chunks.length > 0)
        console.log('Found chunks: ' + chunks + ' for delimiter: ' + delimiter);

    return chunks;
}

//Handle client disconnect decrementing the count then running the continuation
function clientDisconnect(client, next) {
    console.log('Client disconnecting: ' + client.sessionId);

    next();
}


//Helpers
function getClockTime()
{
   var now    = new Date();
   var hour   = now.getHours();
   var minute = now.getMinutes();
   var second = now.getSeconds();
   var ap = "AM";
   if (hour   > 11) { ap = "PM";             }
   if (hour   > 12) { hour = hour - 12;      }
   if (hour   == 0) { hour = 12;             }
   if (hour   < 10) { hour   = "0" + hour;   }
   if (minute < 10) { minute = "0" + minute; }
   if (second < 10) { second = "0" + second; }
   var timeString = hour +
                    ':' +
                    minute +
                    ':' +
                    second +
                    " " +
                    ap;
   return timeString;
}

//Open a config file (currently empty) to see if we are on a server
path.exists(config_file, function (exists) {
    console.log('Attempting to use config at ' + config_file);
    if (!exists) {
        console.log('no config found. starting in local dev mode');
        app.listen(dev_port);
        var port = dev_port;
    }
    else {
        console.log('config found. starting in server mode');
        app.listen(server_port);
        var port = server_port;
    }

    console.log('listening on port ' + port);

    app.get('/', restrict, function(req, res){
        res.render('index', {
            locals: { name: req.session.user.name, port: port, hash: JSON.stringify(req.session.hash) }
        });
    });
});

