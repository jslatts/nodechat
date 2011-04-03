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
        ncutils = require('./ncutils');
        backbone = require('./backbone');
        models = require('../models/models');
        redis = require('redis');
        rc = redis.createClient();
        winston = require('winston');
    } 
    else {
        throw new Error('auth.js must be loaded as a module.');
    }

    //Takes a chat string and a client object and generates a backbone model with unique id and persists it to the chanel
    function storeChat(message, client, cb) {
        rc.incr('chat.id', function (err, newId) {
            if (err) {
                winston.error('[storeChat] failed to get id from chat.id');
                return cb && cb(new Error('[storeChat] failed to get id from chat.id with err: ' + err));
            }

            return cb && cb (null, new models.ChatEntry({id: newId, text: message.data, user: client.user, niceTime: ncutils.getClockTime(), time: new Date().getTime()}));
        });
    }

    exports.handleMessage = function(message, client, cb) {
        if (!message.event)  {
            return cb && cb(new Error('[handleMessage] no event in message'));
        }

        switch(message.event) {
            case 'chat':
                winston.info('[handleMessage] routing message: ' + JSON.stringify(message));
                storeChat(message, client, function (err, chatModel) {
                    if (err) {
                        winston.info('[handleMessage][storeChat][cb] Error: ' + err);
                        return cb && cb('[handleMessage][storeChat][cb] Error: ' + err);
                    }

                    client.rc_pub.publish(message.topic, chatModel.xport());
                    return cb && cb(null, true);
                });
                break;
        }
    };
})()


