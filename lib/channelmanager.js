// Manages redis pubsub channels
//
// Copyright(c) 2011 Justin Slattery <justin.slattery@fzysqr.com> 
//
// MIT Licensed

// This will be a [CommonJS module](http://www.commonjs.org/) so we need to start off with some setup. 
//
// Here we are checking to see if this code is included as a module. If it is, we go ahead and include our dependencies. If we are not a module, we may as well explode because the rest of the code won't run without redis and hash.
(function () {
    if (typeof exports !== 'undefined') {
        redis = require('redis')
        , rc = redis.createClient()
        , winston = require('winston')
        , _ = require('underscore');
    } 
    else {
        throw new Error('channelmanager.js must be loaded as a module.');
    }

    //Add two redis clients for subscribing and publishing to channels
    exports.setupClientForSubscriptions = function (client, cb) {
        client.rc_pub = redis.createClient();
        client.rc_sub = redis.createClient();

        //Create a list of subscribed channel names so we can remove them on disconnect
        client.topicList = [];

        //Subscribe to the user's direct message channel
        //TODO - make this a way to grab directs that arrived while offline
        //client.rc_sub.subscribe('user:' + client.user + ':directs');
       
        //Setup handler for incoming messages on channel
        client.rc_sub.on('message', function(channel, message) {
            client.send({
                event: 'chat'
                , topic: channel
                , data: message
            });
        });

        cb && cb();
    };

    //Subscribe a user to a topic by:
    // - Subscribing using redis pubsub
    // - Pushing the the channel onto the socket client's list for desub later
    // - Persisting the topic subscription in the users profile
    //
    // May be called more than once, so we need to make sure we haven't subscribed this client before 
    exports.subscribeClientToChannel = function(client, channel, cb) {
        if (!client || !client.rc_sub ) {
            return cb && cb (new Error('[subscribeClientToChannel] has null client or rc_sub'));
        }

        //XSS protection
        channel = channel.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        if (_.indexOf(client.topicList, channel) === -1 ) {
            client.rc_sub.subscribe('topics:' + channel);

            client.topicList.push(channel);
        
            rc.sadd('users:' + client.user + '.topics', channel);

            exports.getHistoryForChannel(client, channel);
        }

        cb && cb();
    };

    //TODO: docs
    exports.getHistoryForChannel = function(client, channel, cb) {
        if (!client || !client.rc_sub ) {
            return cb && cb (new Error('[getHistoryForChannel] has null client or rc_sub'));
        }

        rc.lrange('topics:' + channel, -1000, -1, function (err, chats) {
            if (err) {
                winston.error('[getHistoryForChannel][fn] Error: ' + err);
            }

            //Send everything we found to the client 
            _.each(chats, function (c) {
                c = c.replace(/</g, "&lt;").replace(/>/g, "&gt;");
                client.send({
                    event: 'chat'
                    , topic: channel
                    , data: c
                    , reload: true //Let the client know these arent fresh
                });
            });
        });

        return cb && cb();
    };

    //Unsubscribe a user to a topic by:
    // - Unsubscribing using redis pubsub
    // - Removing the the channel from the socket client's list 
    // - Deleting the topic subscription in the users profile
    // - Sending the event back to the client
    exports.unsubscribeClientFromChannel = function(client, channel, cb) {
        client.rc_sub.unsubscribe('topics:' + channel);

        client.topicList = _.without(client.topicList, channel);
        
        rc.srem('users:' + client.user + '.topics', channel);

        client.send({
            event: 'topic:unsubscribe'
            , topic: channel
        });

        cb && cb(null, '[unsubscribeClientToChannel] ' + client.user + ' unsubscribed from ' + channel);
    };

    //Unsubscribe a user from all topics
    //This is meant for disconnection and will not remove their subscription preferences
    exports.unsubscribeClientFromAllChannels = function (client, cb) {
        for (var i = 0; i < client.topicList.length; i = i+1) {

            client.rc_sub.unsubscribe('topics:' + client.topicList[i]);
        }

        //Unsub from direct message channel
        //client.rc_sub.unsubscribe('user:' + client.user + '.directs');

        cb && cb();
    }
})()


