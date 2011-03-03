var express = require('express')
    , app = express.createServer()
    , connect = require('connect')
    , jade = require('jade')
    , socket = require('socket.io').listen(app)
    , _ = require('underscore')._
    , Backbone = require('backbone')
    , urlparser = require('url')
    , models = require('./models/models');

var redis = require('redis')
    , rc = redis.createClient()
    , redisStore = require('connect-redis');

rc.on('error', function(err) {
    console.log('Error ' + err);
});

redis.debug_mode = true;

//configure express 
//app.use(express.logger());
app.use(express.bodyParser());
app.use(express.cookieParser());
app.use(express.session({ store: new redisStore({maxAge: 24 * 60 * 60 * 1000}), secret: 'Secretly I am an elephant' }));

app.set('view engine', 'jade');
app.set('view options', {layout: false});


function authenticate(name, pass, fn) {
    console.log('Auth for ' + name + ' with password ' + pass);
    
    rc.get('user:' + name, function(err, data){
        if (!data) return fn(new Error('cannot find user'));
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
    req.session.message = "Testing";
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

function message(client, socket, msg){
    if(msg.rediskey) {
        console.log('received from client: ' + msg.rediskey);
        //fetch session info from redis
//        rc.get(msg.rediskey, function(e, c) {
//            console.log('logged in ' + c.username);
//            client.user_logged_in = c.username;
//       });
    }
    else {

        var chat = new models.ChatEntry();
        chat.mport(msg);

        client.connectSession(function(err, data) {
            rc.incr('next.chatentry.id', function(err, newId) {
                chat.set({id: newId, name: data.user.name});
                nodeChatModel.chats.add(chat);
                
                var expandedMsg = chat.get('id') + ' ' + chat.get('name') + ': ' + chat.get('text');
                console.log('(' + client.sessionId + ') ' + expandedMsg);

                rc.rpush('chatentries', chat.xport(), redis.print);
                rc.bgsave();

                socket.broadcast({
                    event: 'chat',
                    data:chat.xport()
                }); 
            }); 
        });
    }
}

function clientDisconnect(client) {
    activeClients -= 1;
    client.broadcast({clients:activeClients})
}

app.listen(8000)
