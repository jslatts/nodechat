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

app.get('/*.(js|css)', function(req, res){
    res.sendfile('./'+req.url);
});

app.get('/', restrict, function(req, res){
    res.render('index', {
        locals: { name: req.session.user.name }
        });
});


//create local state
var activeClients = 0;
var nodeChatModel = new models.NodeChatModel();

rc.lrange('chatentries', -10, -1, function(err, data) {
    if (err)
    {
        console.log('Error: ' + err);
    }
    else if (data) {
        _.each(data, function(jsonChat) {
            var chat = new models.ChatEntry();
            chat.mport(jsonChat);
            nodeChatModel.chats.add(chat);
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
        if (client.request == null)
            return;
        if (!client.request.headers == null)
            return;
        var cookie = client.request.headers.cookie;
        var sid = unescape(cookie.match(/connect\.sid=([^;]+)/)[1]);

        rc.get(sid, function(err, data) {
            fn(err, JSON.parse(data));
        });
    };


    activeClients += 1;
    client.on('disconnect', function(){clientDisconnect(client)});
    client.on('message', function(msg){message(client, socket, msg)});

    client.send({
        event: 'initial',
        data: nodeChatModel.xport()
    });

    socket.broadcast({
        event: 'update',
        clients: activeClients
    });
});

var topPoster = {};
topPoster.name = 'noone';
topPoster.count = 0;
topPoster.lettercount = 0;

function message(client, socket, msg){
    if(msg.rediskey) {
        console.log('received from client: ' + msg.rediskey);
    }
    else {
        var chat = new models.ChatEntry();
        chat.mport(msg);
        client.connectSession(function(err, data) {
            var cleanName = data.user.name;
            if (cleanName)
                cleanName = cleanName.replace(/</g, "&lt;").replace(/>/g, "&gt;");

            var cleanChat = chat.get('text');
            if (cleanChat)
                cleanChat = cleanChat.replace(/</g, "&lt;").replace(/>/g, "&gt;");

            chat.set({'name': cleanName, 'text': cleanChat});

            rc.get('userban:'+cleanName, function(err, udata){
                console.log('here' + cleanName);
                if (err)
                {
                    console.log('Error: ' + err);
                }
                else if (udata == 1)
                {
                    console.log('Banned: ' + udata);
                    return;
                }
                else {
                    console.log('tp is' + topPoster.name);
                    console.log('count is' + topPoster.count);
                    if (topPoster.name == cleanName && cleanName != 'jslatts') {
                        if(topPoster.count > 2 || topPoster.lettercount > 100)
                            return; 
                        else {
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
                        chat.set({id: newId, name: cleanName, time:getClockTime(), hash:'main'});

                        var hashTagIndex = cleanChat.indexOf('#');
                        console.log('index of hash is ' + hashTagIndex);
                        var room = null;

                        if (hashTagIndex != -1) {
                            console.log("hashtag found ");
                            room = cleanChat.substring(hashTagIndex, cleanChat.indexOf(' ', hashTagIndex+1));
                            console.log("hashtag found " + room);
                            chat.set({hash:room});
                        }

                        nodeChatModel.chats.add(chat);
                        
                        console.log('(' + client.sessionId + ') ' + cleanName + ' ' + cleanChat );

                        rc.rpush('chatentries', chat.xport(), redis.print);

                        socket.broadcast({
                            event: 'chat',
                            data:chat.xport()
                        }); 
                    }); 
                }
            });
        });
    }
}

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
} // function getClockTime()

function clientDisconnect(client) {
    activeClients -= 1;
    client.broadcast({clients:activeClients})
}

app.listen(8000)
