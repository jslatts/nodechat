//
//Controllers
//
NodeChatController = {
    init: function(options) {
        this.socket = new io.Socket(null, {port: options.port});
        var mySocket = this.socket;

        this.hash = options.hash;
        var hash = this.hash;
        log('hash is ' + options.hash);


        this.model = new models.NodeChatModel();
        this.view = new NodeChatView({model: this.model, socket: this.socket, el: $('#content')});
        var view = this.view;
        this.connected = false;


        this.socket.on('connect', function() { 
            mySocket.send({
                event: 'clientauthrequest',
                data: hash
            });
            log('hash is ' + hash);

            log('Connected! Oh hai!');
            this.connected = true;
            view.setConnected(true);
        }); 

        nodeChatController = this;
        this.socket.on('message', function(msg) {nodeChatController.msgReceived(msg)});

        //Try and reconnect if we get disconnected
        this.socket.on('disconnect', function(){
            log('Disconnected from nodechat. Oh noes!');
            connected = false;
            view.setConnected(false);
            trying = setTimeout(tryconnect,500);
        });

        function tryconnect(){
            if(!connected) {
                log('Trying to reconnect...');
                mySocket.connect();
                clearTimeout(trying);
                trying = setTimeout(tryconnect,30000);
            }
        }
          
        
        this.socket.connect();

        this.view.render();

        return this;
    }

    , msgReceived: function(message){
        switch(message.event) {
            case 'initial':
                this.model.mport(message.data);
                break;
            case 'chat':
//                log('chat received: ' + message.data );
                var newChatEntry = new models.ChatEntry();
                newChatEntry.mport(message.data);
                this.model.chats.add(newChatEntry);

                //remove old ones if we are getting too long
                if (this.model.chats.length > 16)
                    this.model.chats.remove(this.model.chats.first());
                break;
            case 'mash':
                log('mash received: ' + message.data );
                var mashEntry = new models.ChatEntry();
                mashEntry.mport(message.data);
                this.model.mashes.add(mashEntry);

                //remove old ones if we are getting too long
                if (this.model.mashes.length > 6)
                    this.model.mashes.remove(this.model.mashes.first());
                break;
            case 'user:add':
                log('user add received: ' + message.data );
                var user = new models.User();
                user.mport(message.data);

                //In case of refresh/socket/whatever bugs, only add a user once
                if(!this.model.users.some(function(u) { return u.get('name') == user.get('name'); }))
                    this.model.users.add(user);
                break;
            case 'user:remove':
                log('user delete received: ' + message.data );
                var sUser = new models.User();
                sUser.mport(message.data);

                //Because we don't have the actual model, find anything with the same name and remove it
                var users = this.model.users.filter(function(u) { return u.get('name') == sUser.get('name'); });
                this.model.users.remove(users);
                break;
            case 'mashtag':
                log('mash received: ' + message.data );
                var newMashTag = new models.MashTagModel();
                newMashTag.mport(message.data);
                this.model.mashTags.add(newMashTag);
                break;
            case 'mashtag:delete':
                log('mash:delete received for id: ' + message.data );
                var mashTagToDelete  = new models.MashTagModel();
                mashTagToDelete.mport(message.data);
                this.model.mashTags.remove(mashTagToDelete);
                break;
            case 'direct':
                log('direct received: ' + message.data );
                var newDirect = new models.ChatEntry();
                newDirect.mport(message.data);
                this.model.directs.add(newDirect);

                //remove old ones if we are getting too long
                if (this.model.directs.length > 6)
                    this.model.directs.remove(this.model.directs.first());
                break;
            case 'disconnect':
                log('Received disconnect from server');
                window.location = '/disconnect';
                break;
        }
    }
};
