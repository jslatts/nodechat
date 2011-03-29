// nodechat.js
// Copyright(c) 2011 Justin Slattery <justin.slattery@fzysqr.com> 
// MIT Licensed

// Global settings
var dev_port = 8000;
var server_port = 80;
var config_file = '/home/node/nodechat_config';

// Include core dependencies.  
var _ = require('underscore')._
    , Backbone = require('backbone')
    , fs = require('fs')
    , http = require('http')
    , path = require('path');

// Include and configure winston for logging.
var winston = require('winston');
winston.add(winston.transports.File, { filename: 'nodechat.log' });

// Include our own modules
var models = require('./models/models')
    , auth = require('./lib/auth')
    , mashlib = require('./lib/mashlib')
    , ncutils = require('./lib/ncutils');

// Require redis and setup the client 
var redis = require('redis')
    , rc = redis.createClient();

redis.debug_mode = false;

rc.on('error', function (err) {
    winston.warn('Error ' + err);
});

// Setup connect, express, socket, and the connect-redis session store
var express = require('express')
    , app = express.createServer()
    , connect = require('connect')
    , jade = require('jade')
    , stylus = require('stylus')
    , socket = require('socket.io').listen(app)
    , RedisStore = require('connect-redis');

app.set('view engine', 'jade');
app.set('view options', {layout: false});
app.use(express.bodyParser());
app.use(express.cookieParser());
app.use(express.session({ store: new RedisStore(), secret: 'Secretly I am an elephant' }));
app.use(express.static('./public'));
app.use(stylus.middleware({
    src: './views'
  , dest: './public'
}));

//setup stylus
function compile(str, path, fn) {
    stylus(str)
        .set('filename', path)
        .set('compress', true)
        .set('force', true);
}


//  Middleware that decides what a valid login looks like. In this case, just verify that we have a session object for the user.
//
//  This is an express [route middleware](http://expressjs.com/guide.html#route-middleware). Control is passed to the middleware function before the route function is called. We use restrictAccess() to verify that we have a valid user key in the session, implying that authentication has succeeded, before we send the client to the index.jade template. If we do not have a valid user in the session, then we redirect to the '/login' route. This effectively locks down our '/' route from unauthenticated access. You could add the restrictAccess() all to any route you want to protect.
function restrict(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        req.session.error = 'Access denied!';
        res.redirect('/login');
    }
}

// Tell connect to destory the session.
app.get('/logout', function (req, res) {
    // destroy the user's session to log them out
    // will be re-created next request
    req.session.destroy(function () {
        res.redirect('home');
    });
});


app.get('/disconnect', function (req, res) {
    res.render('disconnect');
});

// Route: GET /login
//
// Template: login.jade 
app.get('/login', function (req, res) {
    winston.info('GET /login');
    res.render('login');
});

// Route: POST /login
//
// Calls the authentication module to verify login details. Failures are redirected back to the login page.
//
// If the authentication module gives us a user object back, we ask connect to regenerate the session and send the client back to index. Note: we specify a _long_ cookie age so users won't have to log in frequently. We also set the httpOnly flag to false (I know, not so secure) to make the cookie available over [Flash Sockets](http://help.adobe.com/en_US/FlashPlatform/reference/actionscript/3/flash/net/Socket.html).
app.post('/login', function (req, res) {
    auth.authenticate(req.body.username, req.body.password, function (err, user) {
        if (user) {
            // Regenerate session when signing in
            // to prevent fixation 
            req.session.regenerate(function () {
                // Store the user's primary key 
                // in the session store to be retrieved,
                // or in this case the entire user object
                winston.info('regenerated session id ' + req.session.id);
                req.session.cookie.maxAge = 100 * 24 * 60 * 60 * 1000; //Force longer cookie age
                req.session.cookie.httpOnly = false;
                req.session.user = user;
                req.session.hash = user.hashpass || 'No Hash';

                winston.info('Storing new hash for user ' + user.name + ': ' + req.session.hash);
                res.redirect('/');
            });
        } else {
            req.session.error = 'Authentication failed, please check your username and password.';
            res.redirect('back');
        }
    });
});

// Serve up any static file requested by the client
app.get('/*.(js|css)', function (req, res) {
    res.sendfile('./' + req.url);
});

//create local state
var nodeChatModel = new models.NodeChatModel();

rc.lrange('chatentries', -1000, -1, function (err, data) {
    if (err)
    {
        winston.warn('Error: ' + err);
    }
    else if (data) {
        _.each(data, function (jsonChat) {
            try {
                var chat = new models.ChatEntry();
                chat.mport(jsonChat);
                nodeChatModel.chats.add(chat);
            }
            catch (err) {
                winston.warn('Failed to revive chat ' + jsonChat + ' with err ' + err);
            }
        });

        winston.info('Revived ' + nodeChatModel.chats.length + ' chats');
    }
    else {
        winston.info('No data returned for key');
    }
});


rc.smembers('mashtags', function (err, data) {
    if (err) { 
        winston.warn('SMEMBERS for key mashtags failed with error: ' + err); 
    }
    else if (data) {
        _.each(data, function (jsonMashTag) {
            try {
                var mashTag = new models.MashTagModel();
                mashTag.mport(jsonMashTag);
                nodeChatModel.globalMashTags.add(mashTag);
            }
            catch (err) {
                winston.warn('Failed to revive mashTag ' + jsonMashTag + ' with err ' + err);
            }
        });

        winston.info('Revived ' + nodeChatModel.globalMashTags.length + ' mashtags');
    }
    else {
        winston.info('SMEMBERS for key mashtags returned no data');
    }
});

// When we have a client that shouldn't be connected, __kick 'em off!__' 
// 
// - @param {object} client
// - @param {function} fn
function disconnectAndRedirectClient(client, fn) {
    winston.info('Disconnecting unauthenticated user');
    client.send({ event: 'disconnect' });
    client.connection.end();
    fn();
    return;
}

// Helper function to send tags to a user
function sendMashTagsToUser(user, mashTag) {
    _.each(user.clientList, function (client) { 
        client.send({
            event: 'mashtag',
            data: mashTag.xport({recurse: false})
        });
    });
}

// Event handler for client disconnects. Simply broadcasts the new active client count.
// 
// - @param {object} client
function clientDisconnect(client, next) {
    winston.info('Client disconnecting: ' + client.sessionId);

    next();
}

function getConnectedUser(data, client) {
    var cleanName, connectedUser, rKey, sUser, mashTag;

    if (!data || !data.user || !data.user.name) {
        winston.warn('[getConnectedUser] called with null data, data.user or data.user.name');
        return;
    }

    cleanName = data.user.name.replace(/</g, "&lt;").replace(/>/g, "&gt;");

    connectedUser = nodeChatModel.users.find(function (user) {
        return user.get('name') === cleanName;
    });

    if (!connectedUser) {
        connectedUser = new models.User({'client': client, 'name': cleanName});
        connectedUser.clientList = [];
        connectedUser.clientList.push(client);

        nodeChatModel.users.add(connectedUser);
        winston.info('[getConnectedUser] new user: ' + connectedUser.get('name') + ' on client: ' + client.sessionId);
    
        sUser = new models.User({name: connectedUser.get('name')});
        client.broadcast({
            event: 'user:add',
            data: sUser.xport({recurse: false})
        });


        //Grab mashtag subscriptions for user
        rKey = 'user:' + connectedUser.get('name') + '.mashtags';
        rc.smembers(rKey, function (err, data) {
            if (err) {
                winston.warn('Error retrieving ' + rKey + ': ' + err); 
            }
            else if (data) {
                _.each(data, function (tagId) {
                    try {
                        //Try and find the tag in the current active list
                        mashTag = nodeChatModel.globalMashTags.get(tagId);

                        //If not found, create it and add it to the global list
                        if (!mashTag) {
                            winston.warn('[getConnectedUser] tried to add invalid tag to user subscription');
                            return;
                        }

                        mashTag.watchingUsers.add(connectedUser);
                        sendMashTagsToUser(connectedUser, mashTag);
                        connectedUser.followedMashTags.add(mashTag);

                        winston.info('[getConnectedUser] mashtag with id: ' + tagId + ' revived for user: ' + connectedUser.get('name'));
                    }
                    catch (err) {
                        winston.warn('[getConnectedUser] Failed to revive mashtag with key ' + rKey + ' with id ' + tagId + ' with err ' + err);
                    }
                });

                winston.info('[getConnectedUser] Revived ' + nodeChatModel.chats.length + ' chats');
            }
            else {
                winston.info('[getConnectedUser] No data returned for key: ' + rKey);
            }
        });

        //Count multiple connections in case someone has a window open
        connectedUser.currentConnections = 1;

        //Set disconnect here so we can destroy the user model
        client.on('disconnect', function () { 
            clientDisconnect(client, function () {
                if (connectedUser.currentConnections > 1) {
                    connectedUser.currentConnections--;
                }
                else {
                    winston.info('Removing user from active pool: ' + connectedUser.get('name'));
                    connectedUser.currentConnections = 0;

                    connectedUser.followedMashTags.forEach(function (t) {
                        winston.info('Unsubscribping user: ' + connectedUser.get('name') + ' from mashtag: ' + t.get('name'));
                        t.watchingUsers.remove(connectedUser);
                    });

                    sUser = new models.User({name: connectedUser.get('name')});
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
    else if (!_.any(connectedUser.clientList, function (c) { 
        return c === client; 
    })) {
        winston.info('[getConnectedUser] existing user: ' + connectedUser.get('name') + ' on new client: ' + client.sessionId);
        connectedUser.currentConnections++;
        connectedUser.clientList.push(client);

        //Set disconnect here so we can destroy the user model
        client.on('disconnect', function () { 
            clientDisconnect(client, function () {
                if (connectedUser.currentConnections > 1) {
                    connectedUser.currentConnections--;
                }
                else {
                    winston.info('Removing user from active pool: ' + connectedUser.get('name'));
                    connectedUser.currentConnections = 0;
                    sUser = new models.User({name: connectedUser.get('name')});
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

function getDirectsFromString(chatText) {
    var directIndex, direct, endPos;
    if (chatText[0] === '@') {
        directIndex = 0;
    }
    else {
        directIndex = chatText.indexOf(' @');
    }

    if ((directIndex > -1) && (chatText[directIndex + 2] !== ' ')) {
        endPos = chatText.indexOf(' ', directIndex + 1);
        direct = chatText.substring(directIndex + 1, endPos).toLowerCase();
        winston.info('Found direct: ' + direct);
    }

    return direct;
}

function handleDirects(chat, originalUser) {
    var direct, foundUser;
    direct = getDirectsFromString(chat.get('text'));

    if (direct) {
        winston.info('looking for direct targer user ' + direct);
        foundUser = nodeChatModel.users.find(function (user) {
            return user.get('name').toLowerCase() === direct;
        });
        
        winston.info('found user is ' + foundUser);
        if (foundUser) {
            winston.info('Located direct targer user' + foundUser.get('name'));
            foundUser.directs.add(chat);

            _.each(foundUser.clientList, function (client) { 
                client.send({
                    event: 'direct',
                    data: chat.xport()
                });
            });

            rc.rpush('user:' + foundUser.get('name') + '.directs', chat.xport({recurse: false}), redis.print);

            //Send back to the original user
            _.each(originalUser.clientList, function (client) { 
                client.send({
                    event: 'direct',
                    data: chat.xport()
                });
            });
        }
    }
    else {
        return true;
    }
}

//Add a new mashtag to redis
function addMashTagToStore(mashTag) {
    if (!mashTag) {
        winston.warn('[addMashTagToStore] called without valid tag.');
        return;
    }

    var rKey = 'mashtags';

    rc.sadd(rKey, mashTag.xport({recurse: false}), function (err, data) {
        if (err) {
            winston.warn('[addMashTagToStore] SADD failed for key: ' + rKey + ' and value: ');
        }
        else {
            winston.info('[addMashTagToStore] SADD succeeded for key: ' + rKey + ' and value: '); 
        }
    });
}

//Helper function to persist a tag subscription for a user
function saveMashtagForUser(user, mashTag) {
    if (!mashTag) {
        winston.warn('[saveMashtagForUser] called without valid tag.');
        return;
    }

    var rKey = 'user:' + user.get('name') + '.mashtags';

    rc.sismember(rKey, mashTag.id, function (err, data) {
        if (err) {
            winston.warn('SISMEMBER failed for key: ' + rKey + ' and value: ' + mashTag.id);
        }
        else if (data === '0') {
            rc.sadd(rKey, mashTag.id, function (err, data) {
                if (err) {
                    winston.warn('SADD failed for key: ' + rKey + ' and value: ' + mashTag.id);
                }
                else {
                    winston.info('SADD succeeded for key: ' + rKey + ' and value: ' + mashTag.id);
                }
            });
        }
        else if (data === '1') {
            winston.warn('Value: ' + mashTag.id + ' already exists for key: ' + rKey);
        }
    });
}


//Helper function to send tags to a user
function broadcastGlobalMashTag(mashTag) {
    socket.broadcast({
        event: 'globalmashtag',
        data: mashTag.xport({recurse: false})
    });
}

//Send the chat to all currently subscribed users for a mashTag
function notifySubscribedMashTagUsers(chat, mashTag, doNotNotifyList) {
    mashTag.watchingUsers.forEach(function (user) {
        if (doNotNotifyList[user.get('name')]) {
            return;
        }

        winston.info('[notifySubscribedMashTagUsers] notifying user: ' + user.get('name') + ' for chat: ' + chat.xport());
        _.each(user.clientList, function (client) { 
            winston.info('[notifySubscribedMashTagUsers] client send for user: ' + user.get('name') + ' for client: ' + client.sessionId);
            client.send({
                event: 'mash',
                data: chat.xport()
            });
        });

        //Add the user to do not call list so they only get one copy
        doNotNotifyList[user.get('name')] = 1;
    });
}

//Generate a function to use for backbone tag searching.
var makeTagFindHandler = function (tagName) {
    return function (tag) {
        return tag.get('name') === tagName;
    };
};

//Generate a function to use for backbone user searching.
var makeUserFindHandler = function (user) {
    return function (u) {
        return u === user;
    };
};


var createTag = function (user, chat, alreadyNotifiedUsers) {
    return function(tagName) {
        rc.incr('next.mashtag.id', function (err, newMashId) {
            var foundTag = new models.MashTagModel({'id': newMashId, 'name': tagName});

            //Add the tag to the global list, the users list (since they submitted it), and the chat message. Then add subcribe the user
            //to the mash tag.
            nodeChatModel.globalMashTags.add(foundTag);
            foundTag.watchingUsers.add(user);

            addMashTagToStore(foundTag);
            sendMashTagsToUser(user, foundTag);
            broadcastGlobalMashTag(foundTag);
            saveMashtagForUser(user, foundTag);

            notifySubscribedMashTagUsers(chat, foundTag, alreadyNotifiedUsers);
        });
    };
};

//Handles MashTag creation and notification
//TODO - refactor to use CPS
function handleMashTags(chat, user) {
    var mashTags, alreadyNotifiedUsers, foundTag, t;
    if (!user) {
        winston.warn('[handleMashTags] user is null');
        return;
    }

    mashTags = mashlib.getChunksFromString(chat.get('text'), '#');
    if (mashTags.length > 0) {
        alreadyNotifiedUsers = []; //Make sure we only send a multi-tagged chat once

        for (t = 0; t < mashTags.length; t++) {
            foundTag = nodeChatModel.globalMashTags.find(makeTagFindHandler(mashTags[t]));

            //Create a new mashTag if we need to
            if (!foundTag) {
                createTag(user, chat, alreadyNotifiedUsers)(mashTags[t]);
            } 
            else {
                //In the case the tag exists, check to see if the submitting user is watching it
                if (!foundTag.watchingUsers.some(makeUserFindHandler(user))) { 
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

//Helper function to remove tag subscription for a user
function deleteMashtagForUser(user, mashTag) {
    var rKey = 'user:' + user.get('name') + '.mashtags';

    rc.srem(rKey, mashTag.id, function (err, data) {
        if (err) {
            winston.warn('SREM failed for key: ' + rKey + ' and value: ' + mashTag.id);
        }
        else if (data === '1') {
            winston.info('SREM succeeded for key: ' + rKey + ' and value: ' + mashTag.id);
        }
        else { 
            winston.info('SREM could not find value for key: ' + rKey + ' and value: ' + mashTag.id);
        }
    });
}

//Look for unsubscription notifications
function checkForMashTagUnSub(chat, user) {
    var mashTagsToRemove, foundTag, t;


    makeClientUnSubNotifyHandler = function (tag) {
        return function (client) { 
            winston.info('notified client ' + client.sessionId); 
            client.send({
                event: 'mashtag:delete',
                data: tag.xport({recurse: false})
            });
        }; 
    };

    mashTagsToRemove = mashlib.getChunksFromString(chat.get('text'), '-');
    if (mashTagsToRemove.length > 0) {
        for (t = 0; t < mashTagsToRemove.length; t++) {
            foundTag = nodeChatModel.globalMashTags.find(makeTagFindHandler(mashTagsToRemove[t]));

            //Try and remove it from redis whether we found it or not, in case of sync issues
            deleteMashtagForUser(user, mashTagsToRemove[t]);

            if (foundTag) {
                foundTag.watchingUsers.remove(user);

                //Notify client that tag was unsub'd
                _.each(user.clientList, makeClientUnSubNotifyHandler(foundTag)); 
            }
        }
        return false;
    }

    return true;
}

//Broadcast a chat to all connected clients
var broadcastChat = function (chat, client) {
    nodeChatModel.chats.add(chat);

    winston.info('[' + client.sessionId + '] ' + chat.xport());

    rc.rpush('chatentries', chat.xport({recurse: false}), redis.print);

    socket.broadcast({
        event: 'chat',
        data: chat.xport()
    }); 
};

var topPoster = {};
topPoster.name = 'noone';
topPoster.count = 0;
topPoster.lettercount = 0;

// Event handler for new chat messages. Stores the chat in redis and broadcasts it to all connected clients.
// 
// - @param {object} client
// - @param {object} socket
// - @param {json string} msg
function message(client, socket, msg) {
    if (msg.rediskey) {
        winston.info('received from client: ' + msg.rediskey);
    }
    if (msg.event === 'clientauthrequest') {
        winston.info('clientauthrequest received with hash ' + msg.data);
    }
    else {
        var chat = new models.ChatEntry();
        chat.mport(msg);
        client.connectSession(function (err, data) {
            var cleanChat, connectedUser, userName;

            if (err) {
                disconnectAndRedirectClient(client, function () {
                    winston.warn('[message] Error on connectSession: ' + err);
                });
                return;
            }

            connectedUser = getConnectedUser(data, client);
            if (!connectedUser) {
                disconnectAndRedirectClient(client, function () {
                    winston.warn('[message] connectedUser is null or empty');
                });
                return;
            }

            cleanChat = chat.get('text') + ' ';
            if (cleanChat) {
                cleanChat = cleanChat.replace(/</g, "&lt;").replace(/>/g, "&gt;");
            }

            userName = connectedUser.get('name');
            chat.set({'name': userName, 'text': cleanChat});

            rc.get('userban:' + userName, function (err, udata) {
                if (err) { 
                    winston.warn('Error: ' + err); 
                }
                else if (udata === 1)
                {
                    winston.warn('Banned: ' + udata); 
                    return;
                }
                else {
                    if (topPoster.name === userName && userName !== 'jslatts') {
                        if (topPoster.count > 5 || topPoster.lettercount > 700) {
                            return; 
                        }
                        else {
                            //set a timer to reset this
                            clearTimeout(topPoster.timeOut);
                            topPoster.timeOut = setTimeout(function () {
                                topPoster.count = 0;
                            }, 5000);

                            topPoster.count++;
                            topPoster.lettercount += cleanChat.length;
                        }
                    }
                    else {
                        topPoster.name = userName;
                        topPoster.count = 1;
                        topPoster.lettercount = 1;
                    }

                    if (chat.get('text').length > 400) {
                        return;
                    }

                    rc.incr('next.chatentry.id', function (err, newId) {
                        chat.set({id: newId, time: ncutils.getClockTime(), datetime: new Date().getTime()});
                        winston.info(chat.xport());

                        //If we have hashes, deal with them
                        var shouldBroadcast = handleDirects(chat, connectedUser); 
                        shouldBroadcast = shouldBroadcast && checkForMashTagUnSub(chat, connectedUser); 

                        if (shouldBroadcast) {
                            shouldBroadcast = shouldBroadcast && handleMashTags(chat, connectedUser); 
                        }

                        if (shouldBroadcast) {
                            broadcastChat(chat, client);
                        }
                    }); 
                }
            });
        });
    }
}

//Send the data in memory to the client
function sendInitialDataToClient(client) {
    var chatHistory;
    if (nodeChatModel.chats.length > 100) {
        chatHistory = nodeChatModel.chats.rest(nodeChatModel.chats.length - 100);
    }
    else  {
        chatHistory = nodeChatModel.chats;
    }

    winston.info('sending ' + chatHistory.length);

    nodeChatModel.users.forEach(function (user) {
        var sUser = new models.User({name: user.get('name')});
        client.send({
            event: 'user:add',
            data: sUser.xport()
        });
    });

    chatHistory.forEach(function (chat) {
        client.send({
            event: 'chat',
            data: chat.xport()
        });
    });

    nodeChatModel.globalMashTags.forEach(function (mashTag) {
        client.send({
            event: 'globalmashtag',
            data: mashTag.xport({recurse: false})
        });
    });
}

// Handle the new connection event for socket. 
// 
// connectSession() is a helper method that will verify a client's validity by checking for a cookie in the request header, then, if we find it,  _pulling their session out of redis_. 
//
// We then use the helper method in the 'connection' handler for our socket listener. Instead accepting any user connection, we are going to check that the client has a valid session (meaning they logged in). If they don't, give them the boot! If they do, then we store a copy of the session data (yay we have access!) in the client object and then setup the rest of the socket events. Finally, send them a welcome message just to prove that we remembered their profile. 
socket.on('connection', function (client) {
    // helper function that goes inside your socket connection
    client.connectSession = function (fn) {
        if (!client.request || !client.request.headers || !client.request.headers.cookie) {
            disconnectAndRedirectClient(client, function () {
                winston.warn('Null request/header/cookie!');
            });
            return;
        }

        winston.info('Cookie is' + client.request.headers.cookie);

        var match, sid;

        match = client.request.headers.cookie.match(/connect\.sid=([^;]+)/);
        if (!match || match.length < 2) {
            disconnectAndRedirectClient(client, function () {
                winston.warn('Failed to find connect.sid in cookie');
            });
            return;
        }

        sid = unescape(match[1]);

        rc.get(sid, function (err, data) {
            fn(err, JSON.parse(data));
        });
    };

    client.connectSession(function (err, data) {
        if (err) {
            winston.warn('Error on connectionSession: ' + err);
            return;
        }

        var connectedUser = getConnectedUser(data, client);
        if (connectedUser) {
            client.on('message', function (msg) {
                message(client, socket, msg);
            });

            sendInitialDataToClient(client);
        }
        else {
            winston.warn("Failed to connect user");
        }
    });
});







// Open a config file (currently empty) to see if we are on a server
path.exists(config_file, function (exists) {
    var port, options;

    winston.info('Attempting to use config at ' + config_file);
    if (!exists) {
        winston.info('no config found. starting in local dev mode');
        app.listen(dev_port);
        port = dev_port;

        //Hack, delete the old css. For some reason the middleware is not recompiling
        fs.unlink('./public/main.css', function (err) {
            if (err) {
                winston.warn('Unlink failed for ./public/main.css: ' + err);
            }
            else {
                winston.info('Unlinked ./public/main.css');
            }
        });

        options = {
            host: 'localhost',
            port: port,
            path: '/main.css'
        };

        http.get(options, function (res) {
            winston.info('GET main.css complete');
        });
    }
    else {
        winston.info('config found. starting in server mode');
        app.listen(server_port);
        port = server_port;
    }

    winston.info('listening on port ' + port);

    app.get('/', restrict, function (req, res) {
        res.render('index', {
            locals: { name: req.session.user.name, port: port, hash: JSON.stringify(req.session.hash) }
        });
    });
});

