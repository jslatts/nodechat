var express = require('express')
    , app = express.createServer()
    , connect = require('connect')
    , jade = require('jade')
    , socket = require('socket.io').listen(app)
    , _ = require('underscore')._
    , Backbone = require('backbone')
    , models = require('./models/models');

var redis = require('redis')
    , rc = redis.createClient()
    , redisStore = require('connect-redis');

rc.on('error', function(err) {
    console.log('Error ' + err);
});

redis.debug_mode = false;
var server_port = 80;
 
//configure express 
app.use(express.bodyParser());
app.use(express.cookieParser());
app.use(express.session({ store: new redisStore({maxAge: 24 * 60 * 60 * 1000}), secret: 'Secretly I am an elephant' }));

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

function accessLogger(req, res, next) {
  console.log('/restricted accessed by %s', req.session.user.name);
  next();
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
console.log('sessionid: ' + req.session.sid);
  if (req.session.user) {
    req.session.success = 'Authenticated as ' + req.session.user.name
      + ' click to <a href="/logout">logout</a>. '
      + ' You may now access <a href="/restricted">/restricted</a>.';
  }
  res.render('login');
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
        req.session.user = user;
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

app.get('/', restrict, function(req, res){
    res.render('index', {
    locals: { name: req.session.user.name, port: server_port }
        });
});


//create local state
var activeClients = 0;
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


socket.on('connection', function(client){
    // helper function that goes inside your socket connection
    client.connectSession = function(fn) {
        if (!client.request) return;
        if (!client.request.headers) return;
        if (!client.request.headers.cookie) return;

        var match = client.request.headers.cookie.match(/connect\.sid=([^;]+)/);
        if (!match || match.length < 2) return;

        var sid = unescape(match[1]);

        rc.get(sid, function(err, data) {
            fn(err, JSON.parse(data));
        });
    };

    activeClients += 1;
    client.on('message', function(msg){message(client, socket, msg)});


    sendInitialDataToClient(client);

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

    chatHistory.forEach(function(chat) {
        console.log('Revived chat datetime is ', chat.get('datetime'));
        client.send({
            event: 'chat',
            data: chat.xport()
        });
    });

    socket.broadcast({
        event: 'update',
        clients: activeClients
    });

}

function message(client, socket, msg){
    if(msg.rediskey) {
        console.log('received from client: ' + msg.rediskey);
    }
    else {
        var chat = new models.ChatEntry();
        chat.mport(msg);
        client.connectSession(function(err, data) {
            if(!data) return;
            if(!data.user) return;
            if(!data.user.name) return;

            var cleanName = data.user.name;
            if (cleanName)
                cleanName = cleanName.replace(/</g, "&lt;").replace(/>/g, "&gt;");

            var connectedUser = nodeChatModel.users.find(function(user){return user.get('name') == cleanName;});

            if(!connectedUser) {
                connectedUser = new models.User({'client': client, 'name': cleanName});
                nodeChatModel.users.add(connectedUser);
                console.log('new user: ' + connectedUser.get('name'));
            
                //Set disconnect here so we can destroy the user model
                client.on('disconnect', function(){clientDisconnect(connectedUser)});
            }

            var cleanChat = chat.get('text') + ' ';

            if (cleanChat)
                cleanChat = cleanChat.replace(/</g, "&lt;").replace(/>/g, "&gt;");

            chat.set({'name': cleanName, 'text': cleanChat});

            rc.get('userban:'+cleanName, function(err, udata){
                console.log('here' + cleanName);
                if (err) { console.log('Error: ' + err); }
                else if (udata == 1)
                {
                    console.log('Banned: ' + udata); 
                    return;
                }
                else {
                    console.log('tp is' + topPoster.name);
                    console.log('count is' + topPoster.count);
                    if (topPoster.name == cleanName && cleanName != 'jslatts') {
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
                        console.log("setting to" + cleanName);
                        topPoster.name = cleanName;
                        topPoster.count = 1;
                        topPoster.lettercount = 1;
                    }

                    console.log('length is ' + chat.get('text').length);
                    if(chat.get('text').length > 140)
                        return;

                    rc.incr('next.chatentry.id', function(err, newId) {
                        chat.set({id: newId, name: cleanName, time:getClockTime()});
                        chat.set({datetime: new Date().getTime()});
                        console.log(chat.xport());

                        //If we have hashes, deal with them
                        var shouldBroadcast = handleDirects(cleanChat, chat, connectedUser); 
                        handleMashTags(cleanChat, chat, connectedUser); 

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

    rc.rpush('chatentries', chat.xport(), redis.print);

    socket.broadcast({
        event: 'chat',
        data:chat.xport()
    }); 
}

function handleDirects(cleanChat, chat) {
    var direct = getDirectsFromString(cleanChat);

    if(direct) {
        var foundUser = nodeChatModel.users.find(function(user){return user.get('name') == direct;});
        
        if (foundUser) {
            foundUser.directs.add(chat);

            foundUser.get('client').send({
                event: 'direct',
                data: chat.xport()
            });

            rc.rpush('user:' + foundUser.get('name') + '.directs', chat.xport(), redis.print);

            return false;
        }
        else return true;
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
function handleMashTags(cleanChat, chat, user) {
    if(!user) {
        console.log('[handleMashTags] user is null');
        return;
    }

    var mashTags = getMashTagsFromString(cleanChat);
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
                        user.get('client').send({
                            event: 'mashtag',
                            data: foundTag.xport({recurse: false})
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

                    user.get('client').send({
                        event: 'mashtag',
                        data: foundTag.xport({recurse: false})
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

//Send the chat to all currently subscribed users for a mashTag
function notifySubscribedMashTagUsers(chat, mashTag, doNotNotifyList){
    mashTag.watchingUsers.forEach(function(user){
        if (doNotNotifyList[user.get('name')]) return;

        console.log('notifying ' + user.get('name') + ' for chat' + chat.xport());
        user.get('client').send({
            event: 'mash',
            data: chat.xport()
        });

        //Add the user to do not call list so they only get one copy
        doNotNotifyList[user.get('name')] = 1;
    });
}

function getMashTagsFromString(chatText) {
    var mashTagIndex = chatText.indexOf('#');
    var mashTags = new Array();
    var startPos = 0;

    while(startPos <= chatText.length && mashTagIndex > -1) {

        //Grab the tag and push it on the array
        var endPos = chatText.indexOf(' ', mashTagIndex+1);
        mashTags.push(chatText.substring(mashTagIndex, endPos));
        
        //Setup for the next one
        startPos = endPos +1;
        mashTagIndex = chatText.indexOf('#', startPos);
    }
    
    console.log('Found mashtags: ' + mashTags);

    return mashTags;
}

//Handle client disconnect by removing user model and decrementing count
function clientDisconnect(killUser) {
    activeClients -= 1;

    if(!killUser) return;

    var client = killUser.get('client');
    if(!client) {
        console.log('No client found during disconnect. Barf');
        return;
    }

    client.broadcast({clients:activeClients})
    nodeChatModel.users.remove(killUser);
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

app.listen(server_port);
console.log('listening on port ' + server_port);
