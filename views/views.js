//
//Views
//
var ChatView = Backbone.View.extend({
    initialize: function(options) {
        _.bindAll(this, 'render');
        this.model.bind('all', this.render);
        this.model.view = this;
    }
    , render: function() {
        $(this.el).text(this.model.get('time') + ' - ' + this.model.get('name') + ': ' + this.model.get('text'));
        return this;
    }
    , remove: function() {
        $(this.el).remove();
    }
});

var MashView = Backbone.View.extend({
    tagName: 'div',

    initialize: function(options) {
        _.bindAll(this, 'render');
        this.model.bind('all', this.render);
        this.model.view = this;
    }

    , render: function() {
        $(this.el).text(this.model.get('time') + ' - ' + this.model.get('name') + ': ' + this.model.get('text'));
        return this;
    }

    , remove: function() {
        $(this.el).remove();
    }
});

var MashTagView = Backbone.View.extend({
    initialize: function(options) {
        _.bindAll(this, 'render');
        this.model.bind('all', this.render);
        this.model.view = this;
    },
    render: function() {
        $(this.el).html(this.model.get('name'));
        $(this.el).css('float', 'left');
        $(this.el).css('margin-right', '5px');
        return this;
    }
    , remove: function() {
        $(this.el).remove();
    }
});

var UserView = Backbone.View.extend({
    initialize: function(options) {
        _.bindAll(this, 'render');
        this.model.bind('all', this.render);
        this.model.view = this;
    }
    , render: function() {
        $(this.el).html(this.model.get('name'));
        $(this.el).css('float', 'left');
        $(this.el).css('margin-right', '5px');
        return this;
    }
    , remove: function() {
        $(this.el).remove();
    }
});

var NodeChatView = Backbone.View.extend({
    newMessages: 0
    , newDirectMessages: 0

    , clearAlerts: function() {
        this.newMessages = -1;
        this.newDirectMessages = 0;

        clearInterval(this.directAlert); 
        clearInterval(this.msgAlert); 

        this.msgAlert = null;
        this.directAlert = null;
        document.title = 'nodechat';
    }
    , setDirectAlert: function() {
        console.log('trying to unset');
        if(!this.directAlert) {
            clearInterval(this.msgAlert); //@directs trump regular messages
            this.msgAlert = null;
            document.title = 'nodechat';

            this.directAlert = setInterval(function() {
                console.log('set direct alert');
                if (document.title == 'nodechat')
                    document.title = 'nodechat @';
                else
                    document.title = 'nodechat';
            }, 2000);
        }
    }
    , setMsgAlert: function() {
        if(!this.msgAlert) {
            this.msgAlert = setInterval(function() {
                console.log('set msg alert');
                if (document.title == 'nodechat')
                    document.title = 'nodechat *';
                else
                    document.title = 'nodechat';
            }, 2000);
        }
    }

    , initialize: function(options) {
        _.bindAll(this, 'addUser', 'removeUser', 'addChat', 'addDirect');
        this.model.chats.bind('add', this.addChat);
        this.model.chats.bind('remove', this.removeChat);
        this.model.mashTags.bind('add', this.addMashTag);
        this.model.mashTags.bind('remove', this.removeMashTag);
        this.model.mashes.bind('add', this.addMash);
        this.model.mashes.bind('remove', this.removeMash);
        this.model.directs.bind('add', this.addDirect);
        this.model.directs.bind('remove', this.removeDirect);
        this.model.users.bind('add', this.addUser);
        this.model.users.bind('remove', this.removeUser);
        this.socket = options.socket;
    }

    , events: {
        'submit #messageForm' : 'sendMessage'
    }

    , addChat: function(chat) {
        var view = new ChatView({model: chat});
        $('#chat_list').append(view.render().el);

        ++this.newMessages;
        if(this.newMessages > 0) 
            this.setMsgAlert();
    }
    , removeChat: function(chat) { chat.view.remove(); }

    , addMash: function(mash) {
        var view = new MashView({model: mash});
        $('#mashtag_chat_list').append(view.render().el);
    }
    , removeMash: function(mash) { mash.view.remove(); }

    , addMashTag: function(mashTag) {
        var view = new MashTagView({model: mashTag});
        $('#mashtag_list').append(view.render().el);
    }
    , removeMashTag: function(mashTag) { mashTag.view.remove(); }

    , addDirect: function(direct) {
        var view = new ChatView({model: direct});
        $('#direct_list').append(view.render().el);

        ++this.newDirectMessages;
        console.log('have directs' + this.newDirectMessages);
        if(this.newDirectMessages > 0) 
            this.setDirectAlert();
    }
    , removeDirect: function(direct) { direct.view.remove(); }

    , addUser: function(user) {
        var view = new UserView({model: user});
        $('#user_list').append(view.render().el);
        $('#user_count').html(this.model.users.length + ' ');
    }
    , removeUser: function(user) { 
        user.view.remove();
        $('#user_count').html(this.model.users.length + ' ');
    }

    , msgReceived: function(message){
        switch(message.event) {
            case 'initial':
                this.model.mport(message.data);
                break;
            case 'chat':
                console.log('chat received: ' + message.data );
                var newChatEntry = new models.ChatEntry();
                newChatEntry.mport(message.data);
                this.model.chats.add(newChatEntry);

                //remove old ones if we are getting too long
                if (this.model.chats.length > 16)
                    this.model.chats.remove(this.model.chats.first());
                break;
            case 'mash':
                console.log('mash received: ' + message.data );
                var mashEntry = new models.ChatEntry();
                mashEntry.mport(message.data);
                this.model.mashes.add(mashEntry);

                //remove old ones if we are getting too long
                if (this.model.mashes.length > 6)
                    this.model.mashes.remove(this.model.mashes.first());
                break;
            case 'user:add':
                console.log('user add received: ' + message.data );
                var user = new models.User();
                user.mport(message.data);

                //In case of refresh/socket/whatever bugs, only add a user once
                if(!this.model.users.some(function(u) { return u.get('name') == user.get('name'); }))
                    this.model.users.add(user);
                break;
            case 'user:remove':
                console.log('user delete received: ' + message.data );
                var sUser = new models.User();
                sUser.mport(message.data);

                //Because we don't have the actual model, find anything with the same name and remove it
                var users = this.model.users.filter(function(u) { return u.get('name') == sUser.get('name'); });
                this.model.users.remove(users);
                break;
            case 'mashtag':
                console.log('mash received: ' + message.data );
                var newMashTag = new models.MashTagModel();
                newMashTag.mport(message.data);
                this.model.mashTags.add(newMashTag);
                break;
            case 'mashtag:delete':
                console.log('mash:delete received for id: ' + message.data );
                var mashTagToDelete  = new models.MashTagModel();
                mashTagToDelete.mport(message.data);
                this.model.mashTags.remove(mashTagToDelete);
                break;
            case 'direct':
                console.log('direct received: ' + message.data );
                var newDirect = new models.ChatEntry();
                newDirect.mport(message.data);
                this.model.directs.add(newDirect);

                //remove old ones if we are getting too long
                if (this.model.directs.length > 6)
                    this.model.directs.remove(this.model.directs.first());
                break;
        }
    }

    , sendMessage: function(){
        var inputField = $('input[name=message]');
        var nameField = $('input[name=user_name]');
        var chatEntry = new models.ChatEntry({name: nameField.val(), text: inputField.val()});
        this.socket.send(chatEntry.xport());
        inputField.val('');

        this.clearAlerts();
    }
});
