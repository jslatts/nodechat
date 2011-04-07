// Routes socket messages
//
// Copyright(c) 2011 Justin Slattery <justin.slattery@fzysqr.com> 
//
// MIT Licensed

// This will be a [CommonJS module](http://www.commonjs.org/) so we need to start off with some setup. 
//
// Here we are checking to see if this code is included as a module. If it is, we go ahead and include our dependencies. If we are not a module, we may as well explode because the rest of the code won't run without redis and hash.
(function () {
    if (typeof exports !== 'undefined') {
        //Nodechat libs
        ncutils = require('./ncutils');
        mashlib = require('./mashlib');
        models = require('../models/models');
        channelmanager = require('./channelmanager');

        //Supporting libs
        backbone = require('./backbone');
        winston = require('winston');
        redis = require('redis');
        rc = redis.createClient();
    } 
    else {
        throw new Error('auth.js must be loaded as a module.');
    }

    //Takes a chat string and a client object and generates a backbone model with unique id
    function createChat(message, client, fn) {
        rc.incr('chat.id', function (err, newId) {
            if (err) {
                winston.error('[createChat] failed to get id from chat.id');
                return fn && fn(new Error('[createChat] failed to get id from chat.id with err: ' + err));
            }


            //CLean the chate messages
            message.data = message.data.replace(/</g, "&lt;").replace(/>/g, "&gt;");

            return fn && fn (null, new models.ChatEntry({
                id: newId
                , topic: message.topic
                , text: message.data
                , user: client.user
                , niceTime: ncutils.getClockTime()
                , time: new Date().getTime()
            }));
        });
    }

    //Handle chat events
    function handleChat(message, client, fn) {
        //Check for @ to determine if its a direct message
        var topic = mashlib.getChunksAtStartOfString(message.data, '@', false);

        //If it is a DM, we need to create two versions of the message to be published:
        // 1. Once for the sending user, who should see @target as the topic
        // 1. Once for the receiving user who should see @sender as the topic
        if (topic) {
            message.data = message.data.substring(message.data.indexOf(topic) + topic.length + 1); //+1 to remove the space after the topic name
            message.topic = '@' + topic;

            createChat(message, client, function (err, chatModelSender) {
                if (err) {
                    winston.error('[handleChat][createChat][fn] Error: ' + err);
                    return fn && fn('[handleChat][createChat][fn] Error: ' + err);
                }

                winston.info('[handleChat][createChat][fn] publishing chat to user:' + client.user + ':directs - ' + chatModelSender.xport());
                client.rc_pub.publish('user:' + client.user + ':directs', chatModelSender.xport());

                winston.info('[handleChat][createChat][fn] saving chat to user:' + client.user + ':directs - ' + chatModelSender.xport());
                rc.rpush('user:' + client.user + ':directs', chatModelSender.xport());

                message.topic = '@' + client.user;
                createChat(message, client, function (err, chatModelReceiver) {
                    if (err) {
                        winston.error('[handleChat][createChat][fn] Error: ' + err);
                        return fn && fn('[handleChat][createChat][fn] Error: ' + err);
                    }

                    winston.info('[handleChat][createChat][fn] publishing chat to user:' + topic + ':directs - ' + chatModelReceiver.xport());
                    client.rc_pub.publish('user:' + topic + ':directs', chatModelReceiver.xport());

                    winston.info('[handleChat][createChat][fn] saving chat to user:' + topic + ':directs - ' + chatModelReceiver.xport());
                    rc.rpush('user:' + topic + ':directs', chatModelReceiver.xport());
                    return fn && fn(null, true);
                });
            });
        }
        //Otherwise, route it to a channel
        else {
            topic = mashlib.getChunksAtStartOfString(message.data, '#', false);

            //If we found a topic, extract it from the string and assign it separately
            if(topic) {
                winston.info('[handleChat] found topic: ' + topic);
                message.data = message.data.substring(message.data.indexOf(topic) + topic.length + 1); //+1 to remove the space after the topic name
                message.topic = topic;
            }
            else { //Else assume we are routing to main
                winston.info('[handleChat] main topic');
                message.topic = 'main'; 
            }

            //Go ahead and call subscribeClientToChannel(). It will ignore the request if the client is already subscribed and simply fire the callback
            channelmanager.subscribeClientToChannel(client, message.topic, function () {
                createChat(message, client, function (err, chatModel) {
                    if (err) {
                        winston.error('[handleChat][createChat][fn] Error: ' + err);
                        return fn && fn('[handleChat][createChat][fn] Error: ' + err);
                    }

                    winston.info('[handleChat][createChat][fn] publishing to chat to topic ' + message.topic + ', ' + chatModel.xport());
                    client.rc_pub.publish('topics:' + message.topic, chatModel.xport());

                    winston.info('[handleChat][createChat][fn] saving to chat to topic ' + message.topic + ', ' + chatModel.xport());
                    rc.rpush('topics:' + message.topic, chatModel.xport());

                    //Persist to global topic list 
                    rc.sadd('topics.globallist', message.topic);

                    //and broadcast it out
                    client.socket.broadcast({
                        event: 'globaltopic'
                        , data: message.topic
                    });

                    return fn && fn(null, true);
                });
            });
        }
    }

    exports.handleMessage = function(message, client, fn) {
        if (!message.event)  {
            return fn && fn(new Error('[handleMessage] no event in message'));
        }

        winston.info('[handleMessage] routing message: ' + JSON.stringify(message));
        switch(message.event) {
            case 'chat':
                handleChat(message, client, fn);
                break;
        }
    };
})()


