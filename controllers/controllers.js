/*!
 * controllers.js
 * Copyright(c) 2011 Justin Slattery <justin.slattery@fzysqr.com> 
 * MIT Licensed
 */

/*
 * Sets up master view for '/' page.
 *
 *  - Store passed hash value
 *  - Create app level model and view
 *  - Initialize socket.io connection back to server
 *  - Define socket.io message routing
 */
NodeChatController = {
    init: function (options) {
        var mySocket, hashpassword, user, view, trying, connected;

        this.socket = new io.Socket(null, {port: options.port
        //    , transports: ['websocket', 'flashsocket', 'xhr-multipart', 'htmlfile']
            , rememberTransport: false
            , tryTransportsOnConnectTimeout: false 
        });

        mySocket = this.socket;

        hashpassword = this.hashpassword = options.hashpassword
        user = this.user = options.userName
        log('hash is ' + options.hashpassword);
        log('user is ' + options.userName);

        //Records the client version to support auto-updates
        versio = this.version = options.version;


        this.model = new models.NodeChatModel();
        this.view = new NodeChatView({model: this.model, socket: this.socket, el: $('#content'), userName: options.userName});
        view = this.view;
        connected = false;


        this.socket.on('connect', function () { 
            mySocket.send({
                event: 'clientauthrequest'
                , user: user
                , hashpassword: hashpassword
            });

            log('Connected! Oh hai!');
            connected = true;
            view.setConnected(true);
        }); 

        nodeChatController = this;
        this.socket.on('message', function (msg) { 
            nodeChatController.msgReceived(msg); 
        });

        function tryconnect() {
            if (!connected) {
                log('Trying to reconnect...');
                mySocket.connect();
                clearTimeout(trying);
                trying = setTimeout(tryconnect, 30000);
            }
        }

        //Try and reconnect if we get disconnected
        this.socket.on('disconnect', function () {
            log('Disconnected from nodechat. Oh noes!');
            connected = false;
            view.setConnected(false);
            trying = setTimeout(tryconnect, 500);
        });
        
        this.socket.connect();

        this.view.render();

        return this;
    }

    , msgReceived: function (message) {
        switch (message.event) {
            case 'chat':
                log('message received: ' + message.data );
                var newChatEntry = new models.ChatEntry();
                newChatEntry.mport(message.data);

                //Check if we are reloading/connecting and flag the chat accordingly
                if (message.reload) {
                    newChatEntry.set({'reload': true});
                }

                //Find the correct topic
                var topic = this.model.topics.find(function(t) {
                    return t.get('name') == newChatEntry.get('topic');
                });

                //If it doesn't exist, create it and add it to the current list
                if (!topic) {
                    topic = new models.TopicModel({name: newChatEntry.get('topic')});
                    this.model.topics.add(topic);
                }

                topic.chats.add(newChatEntry);
                break;

            case 'topic:unsubscribe':
                log('here' + message.data);
                //Find the correct topic
                var topic = this.model.topics.find(function(t) {
                    return t.get('name') == message.topic;
                });

                //If it doesn't exist, create it and add it to the current list
                if (topic) {
                    this.model.topics.remove(topic);
                }

                break;

            case 'globaltopic':
                //Find the correct topic
                var topic = this.model.globaltopics.find(function(t) {
                    return t.get('name') == message.data;
                });

                //If it doesn't exist, create it and add it to the global list
                if (!topic) {
                    topic = new models.TopicModel({'name': message.data});

                    if (message.reload) {
                        topic.set({'reload': true});
                    }

                    this.model.globaltopics.add(topic);
                }

                break;

            case 'globaltopic:message':
                //Check if we are reloading/connecting and flag accodingly
                break;

            case 'user:join':
                var user = new models.UserModel();
                user.mport(message.data);


                //In case of refresh/socket/whatever bugs, only add a user once
                if(!this.model.users.some(function (u) { 
                    return u.get('name').toLowerCase() == user.get('name').toLowerCase(); 
                })) {
                    this.model.users.add(user);
                }
                break;

            case 'user:leave':
                var sUser = new models.UserModel();
                sUser.mport(message.data);

                //Because we don't have the actual model, find anything with the same name and remove it
                var user = this.model.users.find(function (u) { 
                    return u.get('name').toLowerCase() == sUser.get('name').toLowerCase(); 
                });

                this.model.users.remove(user);
                this.view.displayUserLeaveMessage(sUser);
                break;

            case 'disconnect':
                window.location = '/disconnect';
                break;

            //If we get a new version message, wait a few seconds for the server to finish loading, then reload the client
            case 'version':
                if (this.version && this.version !== message.data) {
                    setTimeout(function() {
                            window.location.reload();
                    }, 5000);
                }
                break;
        }
    }
};
