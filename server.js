var express = require('express')
    , app = express.createServer()
    , connect = require('connect')
    , jade = require('jade')
    //, socket = require('socket.io').listen(app, {transports: ['websocket', 'htmlfile', 'xhr-multipart', 'xhr-polling','jsonp-polling']})
    , socket = require('socket.io').listen(app)
    , _ = require('underscore')._
    , Backbone = require('backbone')
    , models = require('./models/models')
    , mashlib = require('./lib/mashlib')
    , ncutils = require('./lib/ncutils')
    , stylus = require('stylus')
    , fs = require('fs')
    , http = require('http')
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
app.use(express.session({ store: new redisStore(), secret: 'Secretly I am an elephant' }));
app.use(express.static('./public'));

app.set('view engine', 'jade');
app.set('view options', {layout: false});

//setup stylus
function compile(str, path, fn) {
  stylus(str)
    .set('filename', path)
    .set('compress', true)
    .set('force', true)
};


app.use(stylus.middleware({
    src: './views'
  , dest: './public'
}));


//handle auth

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
  console.log('GET /login');
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
        if(user.pass)
            req.session.hash = Hash.sha512(user.pass);
        else
            req.session.hash = 'No Hash'; 

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


rc.smembers('mashtags', function(err, data) {
    if (err) { console.log('SMEMBERS for key mashtags failed with error: ' + err); }
    else if (data) {
        _.each(data, function(jsonMashTag) {
            try {
                var mashTag = new models.MashTagModel();
                mashTag.mport(jsonMashTag);
                nodeChatModel.globalMashTags.add(mashTag);
            }
            catch(err) {
                console.log('Failed to revive mashTag ' + jsonMashTag + ' with err ' + err);
            }
        });

        console.log('Revived ' + nodeChatModel.globalMashTags.length + ' mashtags');
    }
    else {
        console.log('SMEMBERS for key mashtags returned no data');
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
    if (nodeChatModel.chats.length > 100)
        var chatHistory = nodeChatModel.chats.rest(nodeChatModel.chats.length-100);
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

    nodeChatModel.globalMashTags.forEach(function(mashTag) {
        client.send({
            event: 'globalmashtag',
            data: mashTag.xport({recurse: false})
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
        console.log('[getConnectedUser] new user: ' + connectedUser.get('name') + ' on client: ' + client.sessionId);
    
        var sUser = new models.User({name:connectedUser.get('name')});
        client.broadcast({
            event: 'user:add',
            data: sUser.xport({recurse: false})
        });


        //Grab mashtag subscriptions for user
        var rKey = 'user:' + connectedUser.get('name') + '.mashtags';
        rc.smembers(rKey, function(err, data) {
            if (err) console.log('Error retrieving ' + rKey + ': ' + err); 
            else if (data) {
                _.each(data, function(tagId) {
                try {
                    //Try and find the tag in the current active list
                    mashTag = nodeChatModel.globalMashTags.get(tagId);

                    //If not found, create it and add it to the global list
                    if(!mashTag) {
                       console.log('[getConnectedUser] tried to add invalid tag to user subscription');
                       return;
                    }
                        
                    mashTag.watchingUsers.add(connectedUser);
                    sendMashTagsToUser(connectedUser, mashTag);
                    connectedUser.followedMashTags.add(mashTag);

                    console.log('[getConnectedUser] mashtag with id: ' + tagId + ' revived for user: ' + connectedUser.get('name'));
                }
                catch(err) {
                    console.log('[getConnectedUser] Failed to revive mashtag with key ' + rKey + ' with id ' + tagId + ' with err ' + err);
                }
            });

            console.log('[getConnectedUser] Revived ' + nodeChatModel.chats.length + ' chats');
            }
            else {
                console.log('[getConnectedUser] No data returned for key: ' + rKey);
            }
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

                    connectedUser.followedMashTags.forEach(function(t) {
                        console.log('Unsubscribping user: ' + connectedUser.get('name') + ' from mashtag: ' + t.get('name'));
                        t.watchingUsers.remove(connectedUser);
                    });

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
        console.log('[getConnectedUser] existing user: ' + connectedUser.get('name') + ' on new client: ' + client.sessionId);
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

                    if(chat.get('text').length > 400)
                        return;

                    rc.incr('next.chatentry.id', function(err, newId) {
                        chat.set({id: newId, time:ncutils.getClockTime(), datetime: new Date().getTime()});
                        console.log(chat.xport());

                        //If we have hashes, deal with them
                        var shouldBroadcast = handleDirects(chat, connectedUser); 
                        shouldBroadcast = shouldBroadcast && checkForMashTagUnSub(chat, connectedUser); 

                        if(shouldBroadcast)
                            shouldBroadcast = shouldBroadcast && handleMashTags(chat, connectedUser); 

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
        var foundUser = nodeChatModel.users.find(function(user){return user.get('name').toLowerCase() == direct;});
        
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
    if(chatText[0] === '@')
        var directIndex = 0;
    else
        var directIndex = chatText.indexOf(' @');

    var direct = null;
    if(directIndex > -1) {
        var endPos = chatText.indexOf(' ', directIndex+1);
        direct = chatText.substring(directIndex+1, endPos).toLowerCase();
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

    var mashTags = mashlib.getChunksFromString(chat.get('text'), '#');
    if(mashTags.length > 0) {
        var alreadyNotifiedUsers = new Array(); //Make sure we only send a multi-tagged chat once

        for (var t in mashTags) {
            var foundTag = nodeChatModel.globalMashTags.find(function(tag){return tag.get('name') == mashTags[t];});

            //Create a new mashTag if we need to
            if (!foundTag) {
                var createTag = function (tagName) {
                    rc.incr('next.mashtag.id', function(err, newMashId){
                        foundTag = new models.MashTagModel({'id': newMashId, 'name': tagName});

                        //Add the tag to the global list, the users list (since they submitted it), and the chat message. Then add subcribe the user
                        //to the mash tag.
                        nodeChatModel.globalMashTags.add(foundTag);
                        foundTag.watchingUsers.add(user);

                        addMashTagToStore(foundTag);
                        sendMashTagsToUser(user, foundTag);
                        broadcastGlobalMashTag(foundTag);
                        saveMashtagForUser(user, foundTag);

                        notifySubscribedMashTagUsers(chat,foundTag, alreadyNotifiedUsers);
                    });
                };
                createTag(mashTags[t]);
            } 
            else {
                //In the case the tag exists, check to see if the submitting user is watching it
                if(!foundTag.watchingUsers.some(function(u) { return u == user; })) { 
                    foundTag.watchingUsers.add(user);

                    sendMashTagsToUser(user, foundTag);
                    saveMashtagForUser(user, foundTag);
                }

                //Notify all the subscribed users
                notifySubscribedMashTagUsers(chat, foundTag, alreadyNotifiedUsers);
            }
        }

        return true;
    }
    else {
        return true;
    }
}

function addMashTagToStore(mashTag) {
    if(!mashTag) {
        console.log('[addMashTagToStore] called without valid tag.');
        return;
    }

    var rKey = 'mashtags';

    rc.sadd(rKey, mashTag.xport({recurse: false}), function(err,data) {
        if (err) console.log('[addMashTagToStore] SADD failed for key: ' + rKey + ' and value: ');
        else console.log('[addMashTagToStore] SADD succeeded for key: ' + rKey + ' and value: '); 
    });
}

//Helper function to persist a tag subscription for a user
function saveMashtagForUser(user, mashTag) {
    if(!mashTag) {
        console.log('[saveMashtagForUser] called without valid tag.');
        return;
    }

    var rKey = 'user:' + user.get('name') + '.mashtags';

    rc.sismember(rKey, mashTag.id, function(err, data) {
        if (err) console.log('SISMEMBER failed for key: ' + rKey + ' and value: ' + mashTag.id);
        else if (data == '0') {
            rc.sadd(rKey, mashTag.id, function(err, data) {
                if (err) console.log('SADD failed for key: ' + rKey + ' and value: ' + mashTag.id);
                else console.log('SADD succeeded for key: ' + rKey + ' and value: ' + mashTag.id);
            });
        }
        else if (data == '1') {
            console.log('Value: ' + mashTag.id + ' already exists for key: '+ rKey);
        }
    });
}

//Helper function to remove tag subscription for a user
function deleteMashtagForUser(user, mashTag) {
    var rKey = 'user:' + user.get('name') + '.mashtags';

    rc.srem(rKey, mashTag.id, function(err, data) {
        if (err) console.log('SREM failed for key: ' + rKey + ' and value: ' + mashTag.id);
        else if (data == '1')
            console.log('SREM succeeded for key: ' + rKey + ' and value: ' + mashTag.id);
        else 
            console.log('SREM could not find value for key: ' + rKey + ' and value: ' + mashTag.id);
    });
}

//Helper function to send tags to a user
function broadcastGlobalMashTag(mashTag) {
    socket.broadcast({
        event: 'globalmashtag',
        data: mashTag.xport({recurse: false})
    });
}

//Helper function to send tags to a user
function sendMashTagsToUser(user, mashTag) {
    _.each(user.clientList, function(client) { 
        client.send({
            event: 'mashtag',
            data: mashTag.xport({recurse: false})
        });
    });
}

//Look for unsubscription notifications
function checkForMashTagUnSub(chat, user) {
    var mashTagsToRemove = mashlib.getChunksFromString(chat.get('text'), '-');
    if(mashTagsToRemove.length > 0) {
        for (var t in mashTagsToRemove) {
            var foundTag = nodeChatModel.globalMashTags.find(function(tag){return tag.get('name') == mashTagsToRemove[t];});

            //Try and remove it from redis whether we found it or not, in case of sync issues
            deleteMashtagForUser(user, mashTagsToRemove[t]);

            if (foundTag) {
                foundTag.watchingUsers.remove(user);

                //Notify client that tag was unsub'd
                _.each(user.clientList, function(client) { 
                   console.log('notified client ' + client.sessionId); 
                    client.send({
                        event: 'mashtag:delete',
                        data: foundTag.xport({recurse: false})
                    });
                });
            }
        }
        return false;
    }

    return true;
}

//Send the chat to all currently subscribed users for a mashTag
function notifySubscribedMashTagUsers(chat, mashTag, doNotNotifyList){
    mashTag.watchingUsers.forEach(function(user){
        if (doNotNotifyList[user.get('name')]) return;

        console.log('[notifySubscribedMashTagUsers] notifying user: ' + user.get('name') + ' for chat: ' + chat.xport());
        _.each(user.clientList, function(client) { 
            console.log('[notifySubscribedMashTagUsers] client send for user: ' + user.get('name') + ' for client: ' + client.sessionId);
            client.send({
                event: 'mash',
                data: chat.xport()
            });
        });

        //Add the user to do not call list so they only get one copy
        doNotNotifyList[user.get('name')] = 1;
    });
}

//Handle client disconnect decrementing the count then running the continuation
function clientDisconnect(client, next) {
    console.log('Client disconnecting: ' + client.sessionId);

    next();
}

//Open a config file (currently empty) to see if we are on a server
path.exists(config_file, function (exists) {
    console.log('Attempting to use config at ' + config_file);
    if (!exists) {
        console.log('no config found. starting in local dev mode');
        app.listen(dev_port);
        var port = dev_port;

        //Hack, delete the old css. For some reason the middleware is not recompiling
        fs.unlink('./public/main.css', function(err) {
            if (err) console.log('Unlink failed for ./public/main.css: ' + err);
            else console.log('Unlinked ./public/main.css');
        });

        var options = {
          host: 'localhost',
          port: port,
          path: '/main.css'
        }

        http.get(options, function(res){console.log('GET main.css complete')});
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

