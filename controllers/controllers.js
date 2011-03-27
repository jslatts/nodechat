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
        var mySocket, hash, view, trying, connected;

        this.socket = new io.Socket(null, {port: options.port
            , transports: ['websocket', 'flashsocket', 'xhr-multipart', 'htmlfile']
            , rememberTransport: false
            , tryTransportsOnConnectTimeout: false 
        });

        mySocket = this.socket;

        this.hash = options.hash;
        hash = this.hash;
        log('hash is ' + options.hash);


        this.model = new models.NodeChatModel();
        this.view = new NodeChatView({model: this.model, socket: this.socket, el: $('#content'), userName: options.userName});
        view = this.view;
        connected = false;


        this.socket.on('connect', function () { 
            mySocket.send({
                event: 'clientauthrequest',
                data: hash
            });
            log('hash is ' + hash);

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
            case 'initial':
                this.model.mport(message.data);
                break;
            case 'chat':
//                log('chat received: ' + message.data );
                var newChatEntry = new models.ChatEntry();
                newChatEntry.mport(message.data);
                this.model.chats.add(newChatEntry);
                break;

            case 'mash':
                log('mash received: ' + message.data );
                var mashEntry = new models.ChatEntry();
                mashEntry.mport(message.data);
                this.model.mashes.add(mashEntry);
                break;

            case 'user:add':
                log('user add received: ' + message.data );
                var user = new models.User();
                user.mport(message.data);

                //In case of refresh/socket/whatever bugs, only add a user once
                if(!this.model.users.some(function (u) { return u.get('name').toLowerCase() == user.get('name').toLowerCase(); }))
                    this.model.users.add(user);
                break;

            case 'user:remove':
                log('user:remove received: ' + message.data );
                var sUser = new models.User();
                sUser.mport(message.data);

                //Because we don't have the actual model, find anything with the same name and remove it
                var users = this.model.users.filter(function (u) { return u.get('name').toLowerCase() == sUser.get('name').toLowerCase(); });
                this.model.users.remove(users);
                break;

            case 'mashtag':
                log('mashtag received: ' + message.data );
                var newMashTag = new models.MashTagModel();
                newMashTag.mport(message.data);
                this.model.mashTags.add(newMashTag);
                break;

            case 'mashtag:delete':
                log('mashtag:delete received for id: ' + message.data );
                var mashTagToDelete  = new models.MashTagModel();
                mashTagToDelete.mport(message.data);
                this.model.mashTags.remove(mashTagToDelete);
                break;

            case 'globalmashtag':
                log('globalmashtag received: ' + message.data );
                var newMashTag = new models.MashTagModel();
                newMashTag.mport(message.data);
                this.model.globalMashTags.add(newMashTag);
                break;

            case 'globalmashtag:delete':
                log('globalmashtag:delete received for id: ' + message.data );
                var mashTagToDelete  = new models.MashTagModel();
                mashTagToDelete.mport(message.data);
                this.model.globalMashTags.remove(mashTagToDelete);
                break;

            case 'direct':
                log('direct received: ' + message.data );
                var newDirect = new models.ChatEntry();
                newDirect.mport(message.data);
                this.model.directs.add(newDirect);

                break;

            case 'disconnect':
                log('Received disconnect from server');
                window.location = '/disconnect';
                break;
        }
    }
};
