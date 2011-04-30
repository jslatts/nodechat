// nodechat.js
// Copyright(c) 2011 Justin Slattery <justin.slattery@fzysqr.com> 
// MIT Licensed

// Global settings
var version = '0.3.16';
var dev_port = 8000;
var server_port = 80;
var config_file = '/home/node/nodechat_config';

// Include core dependencies.  
var _ = require('underscore')._
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
    , messagerouter = require('./lib/messagerouter')
    , channelmanager= require('./lib/channelmanager')
    , usermanager = require('./lib/usermanager');

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

function signInAccount(req, res) {
    auth.authenticateUser(req.body.username, req.body.password, function (err, user) {
        if (err) {
            winston.error('[signInAccount][authenticateUser][fn] Error: ' + err);
        }

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
                req.session.hashpassword = user.hashPass || 'No Hash';

                winston.info('Storing new hash for user ' + user.name + ': ' + req.session.hashpassword);
                res.redirect('/');
            });
        } 
        else {
            req.session.error = 'Authentication failed, please check your username and password.';
            res.redirect('back');
        }
    });
}

// Route: POST /signup
//
// Calls createNewUserAccount() in the auth module, then logins in the user without prompting again for password
app.post('/signup', function (req, res) {
    auth.createNewUserAccount(req.body.username, req.body.password, req.body.email, function (err, user) {
        if ((err) || (!user)) {
            req.session.error = 'New user failed, please check your username and password.';
            res.redirect('back');
        }
        else if (user) {
            signInAccount(req, res);
        }
    });
});

// Route: GET /login
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
app.post('/login', function(req, res) {
    signInAccount(req, res)
});

// Serve up any static file requested by the client
app.get('/*.(js|css)', function (req, res) {
    res.sendfile('./' + req.url);
});


// Event handler for client disconnects. Simply broadcasts the new active client count.
// 
// - @param {object} client
function clientDisconnect(client) {
    usermanager.userDisconnection(client, function () {
        winston.info('[clientDisconnect] disconnecting client: ' + client.sessionId);
        channelmanager.unsubscribeClientFromAllChannels(client);
    });
}

function purgatory() {
    var inPurgatory = true;
    return {
        tryToGetOut: function (message, client, cb) {
            if (!message || !message.user || !message.hashpassword) {
                winston.info('[purgatory][tryToGetOut] Client with no user/hash attempting message. Client still in purgatory');
                return;
            }
            auth.authenticateUserByHash(message.user, message.hashpassword, function(err, data) {
                if (err) {
                    winston.info('[purgatory] Bad auth. Client still in purgatory');
                    inPurgatory = true;
                }
                else {
                    winston.info('[purgatory] out of purgatory');
                    inPurgatory = false;

                    //Once we are sure the client is who s/he claims to be, attach name and hash for future use.
                    client.user = message.user;
                    client.hashpassword = message.hashpassword;

                    cb && cb();
                }
            });
        }
        , stillInPurgatory: function() {
            winston.info('[purgatory] status ' + inPurgatory);
            return inPurgatory;
        }
    }
}

// Handle the new connection event for socket by putting the client in purgatory until they auth. 
socket.on('connection', function (client) {
    var clientPurgatory = purgatory();
    client.socket = socket; //Once in awhile, we want to reference the socket for broadcasts

    //Inform the client of the current version
    client.send({
        event: 'version'
        , data: version
    });

    client.on('message', function(message) {
        if (clientPurgatory.stillInPurgatory()) {
            //Only respond to attempted auths
            if(message.event === 'clientauthrequest') {
                //If we can get out of purgatory, set up the client for pubsub
                clientPurgatory.tryToGetOut(message, client, function () {
                    channelmanager.setupClientForSubscriptions(client, function () {
                        winston.info('Client ' + client.sessionId + ' setup for pub/sub');

                        channelmanager.subscribeClientToChannel(client, 'main', function (){
                            winston.info('Client ' + client.sessionId + ' subcribed to main topic');
                        });

                        usermanager.newUserConnection(client, function() {
                            winston.info('Client ' + client.sessionId + ' connection setup.');
                        });
                    });

                    client.on('disconnect', function () {
                        clientDisconnect(client);
                    });
                });
            }
        }
        else {
            messagerouter.handleMessage(message, client, function (err, data) {});
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
        winston.info('[main] config found. starting in server mode');
        app.listen(server_port);
        port = server_port;
    }

    winston.info('[main] nodechat v' + version + ' listening on port ' + port);
    app.get('/', restrict, function (req, res) {
        res.render('index', {
            locals: { name: req.session.user.name, port: port, hashpassword: JSON.stringify(req.session.hashpassword), version: version  }
        });
    });
});

