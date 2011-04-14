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

    //Helper method to look for each possible control message, parse it out and send it to the call back
    function parseControlWordsFromChat(message, fn) {
        var topic, payload;

        //Check for @ to determine if its a direct message
        topic = mashlib.getChunksAtStartOfString(message.data, '@', false);
        if (topic) {
            payload = message.data.substring(message.data.indexOf(topic) + topic.length + 1); //+1 to remove the space after the topic name
            return fn('direct', topic, payload);
        }

        //Check for - to determine if its a unsub message
        topic = mashlib.getChunksAtStartOfString(message.data, '-', false);
        if (topic) {
            return fn('topic:unsubscribe', topic, payload);
        }


        //Check for # to determine if its a topic
        topic = mashlib.getChunksAtStartOfString(message.data, '#', false);
        if (topic) {
            winston.info('[parseControlWordsFromChat] found topic: ' + topic);
            payload = message.data.substring(message.data.indexOf(topic) + topic.length + 1); //+1 to remove the space after the topic name
            return fn('topic:subscribe', topic, payload);
        }
        else {
            winston.info('[parseControlWordsFromChat] main topic');
            topic = 'main';
            message.data = message.data;
            return fn('topic:main', topic, message.data);
        }

    }

    //Handle chat events
    function handleChat(message, client, fn) {
        var type, topic;

        //Clean up the data, evil hax0rs
        message.data = message.data.replace(/</g, "&lt;").replace(/>/g, "&gt;");

        parseControlWordsFromChat(message, function(type, topic, payload){

        //If it is a DM, we need to create two versions of the message to be published:
        // 1. Once for the sending user, who should see @target as the topic
        // 1. Once for the receiving user who should see @sender as the topic
        switch(type){
            case 'direct':
                message.data = payload; //Modify the message data to just be the stripped payload
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
                break;

            case 'topic:unsubscribe':
                channelmanager.unsubscribeClientFromChannel(client, topic, function() {
                    winston.info('[handleChat] unsubscribed client ' + client.sessionId + ' from channel ' + topic);
                });
                break;

            case 'topic:subscribe':
            case 'topic:default':
                message.data = payload; //Modify the message data to just be the stripped payload
                message.topic = topic;

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
                break;
            }
        });
    }


    //Get all old messages from redis and send them back to the client
    function topicGetAllMessages(message, client, fn) {
        return fn && fn(null, true);
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
            case 'topic:get':
                topicGetAllMessages(message, client, fn);
                break;
        }
    };
})()


