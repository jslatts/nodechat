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

    //Send over the list of existing connected users
    function sendConnectedUsersToNewConnection(currentUsers, client, fn) {
        //Get the current list of connected users from redis
        rc.smembers('connectedusers', function(err, users) {
            if (err) {
                winston.error('[newUserConnection][fn] Error: ' + err);
                return fn && fn('[newUserConnection][fn] Error: ' + err);
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
                    winston.error('[newUserConnection][fn] Error: ' + err);
                }
            });

            //Store the socket client in case we have multiple sessions going
            currentUsers[client.user].push(client.sessionId);

            //then ET phone home
            fn && fn();
        });
    };
   
    //Pull any previously saved subscriptions and re-subscribe the client
    //Then send over the last 100 chats in the channel
    function sendSavedSubscriptionsToNewConnection(client, fn) {
        rc.smembers('users:' + client.user + '.topics', function (err, topics) {
            _.each(topics, function (t) {
                channelmanager.subscribeClientToChannel(client, t, function() {
                    winston.info('[sendSavedSubscriptionsToNewConnection] client: ' + client.sessionId + ' subscribed to stored topic: ' + t);
                });

                winston.info('[sendSavedSubscriptionsToNewConnection] retreiving chats from ' + t + ' for client: ' + client.sessionId);
                rc.lrange('topics:' + t, -100, -1, function (err, chats) {
                    if (err) {
                        winston.error('[sendConnectedUsersToNewConnection][fn] Error: ' + err);
                        return fn && fn('[sendConnectedUsersToNewConnection][fn] Error: ' + err);
                    }

                    //Send everything we found to the client 
                    _.each(chats, function (c) {
                        client.send({
                            event: 'chat'
                            , topic: t
                            , data: c
                            , reload: true //Let the client these arent fresh
                        });
                    });
                });
            });
        });
    }

    //Get the list of global topics and send it out to the client
    function sendGlobalTopicListToNewConnection(client, fn) {
        rc.smembers('topics.globallist', function (err, topics) {

            winston.info('[sendGlobalTopicListToNewConnection] sending global topic list to client: ' + client.sessionId);
            _.each(topics, function (t) {
                client.socket.broadcast({
                    event: 'globaltopic'
                    , data: t
                    , reload: true //let the client know this topic isn't freshie fresh
                });
            });
        });
    }

    //When clients connect, track their session -> user mapping in memory so we can avoid sending duplicate connection notices to the channel
    //There is probably a smarter way to deal with this, maybe using redis, but I haven't quite sorted a way to prevent disconnection leakage
    //without doing something insanely complicated
    //
    //If it is the first time a client has connected, broadcast the connection
    exports.newUserConnection = function (client, fn) {
        if (!currentUsers[client.user]) {
            currentUsers[client.user] = [];

            var userModel = new models.UserModel({name: client.user, niceTime: ncutils.getClockTime(), time: new Date().getTime()});
            client.socket.broadcast({
                event: 'user:join'
                , data: userModel.xport()
            });
        }

        //Keep track of the calls backs so we can make sure they both return before calling fn
        var fnSync = 0;

        fnSync += 1;
        sendConnectedUsersToNewConnection(currentUsers, client, function() {
            fnSync -=1;
            if (fnSync <= 0) {
                fn && fn();
            }
        });

        fnSync += 1;
        sendSavedSubscriptionsToNewConnection(client, function() {
            fnSync -=1;
            if (fnSync <= 0) {
                fn && fn();
            }
        });

        fnSync += 1;
        sendGlobalTopicListToNewConnection(client, function() {
            fnSync -=1;
            if (fnSync <= 0) {
                fn && fn();
            }
        });
    };


    //Remove the client from our in memory session. If it is the last instance of the user, broadcast the leave event
    exports.userDisconnection = function (client, fn) {
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

        fn && fn();
    };
})()


