// Manages user connections/disconnections
//
// Copyright(c) 2011 Justin Slattery <justin.slattery@fzysqr.com> 
//
// MIT Licensed

// This will be a [CommonJS module](http://www.commonjs.org/) so we need to start off with some setup. 
//
// Here we are checking to see if this code is included as a module. If it is, we go ahead and include our dependencies. 
// If we are not a module, we may as well explode because the rest of the code won't run.
(function () {
    if (typeof exports !== 'undefined') {
        redis = require('redis')
        , rc = redis.createClient()
        , socket = require('socket.io')
        , winston = require('winston')
        , _ = require('underscore');

        ncutils = require('./ncutils')
        , models = require('../models/models');
    } 
    else {
        throw new Error('usermanager.js must be loaded as a module.');
    }

    var currentUsers = {};

    //When clients connect, track their session -> user mapping in memory so we can avoid sending duplicate connection notices to the channel
    //There is probably a smarter way to deal with this, maybe using redis, but I haven't quite sorted a way to prevent disconnection leakage
    //without doing something insanely complicated
    //
    //If it is the first time a client has connected, broadcast the connection
    exports.newUserConnection = function (client, cb) {
        if (!currentUsers[client.user]) {
            currentUsers[client.user] = [];

            var userModel = new models.UserModel({name: client.user, niceTime: ncutils.getClockTime(), time: new Date().getTime()});
            client.socket.broadcast({
                event: 'user:join'
                , data: userModel.xport()
            });
        }


        //Get the current list of connected users from redis
        rc.smembers('connectedusers', function(err, users) {
            if (err) {
                winston.error('[newUserConnection][cb] Error: ' + err);
                return cb && cb('[newUserConnection][cb] Error: ' + err);
            }

            //and fire them off to the new client with an alreadythere event
            users.forEach(function (u) {
                winston.info('[connectedusers]' + u);
                var userModel = new models.UserModel({name: u, preExist: true});
                client.send({
                    event: 'user:join'
                    , data: userModel.xport()
                });
            });

            //Then add the new client, fire and forget style
            rc.sadd('connectedusers', client.user, function(err) {
                if (err) {
                    winston.error('[newUserConnection][cb] Error: ' + err);
                }
            });

            //Store the socket client in case we have multiple sessions going
            currentUsers[client.user].push(client.sessionId);

            //then ET phone home
            cb && cb();
        });
    };

    //Remove the client from our in memory session. If it is the last instance of the user, broadcast the leave event
    exports.userDisconnection = function (client, cb) {
        if (currentUsers[client.user]) {
            currentUsers[client.user] =  _.without(currentUsers[client.user], client.sessionId); //I _love_ _.without()

            if (currentUsers[client.user].length <= 0) {
                var userModel = new models.UserModel({name: client.user, preExist: true, niceTime: ncutils.getClockTime(), time: new Date().getTime()});

                client.socket.broadcast({
                    event: 'user:leave'
                    , data: userModel.xport() 
                });

                //Remove the key so we know to broadcast if the user rejoins later 
                delete currentUsers[client.user];

                //and then remove it from redis as well so we don't load it to new clients
                rc.srem('connectedusers', client.user);
            }
        }

        cb && cb();
    };
})()


