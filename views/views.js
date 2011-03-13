//
//Views
//

var RoomView = Backbone.View.extend({
    tagName: 'div',

    initialize: function(options) {
        _.bindAll(this, 'render');
        this.model.bind('all', this.render);
    },

    render: function() {
        $(this.el).html(this.model.get('hash') + '@' + this.model.get("time") + " - " + this.model.get("name") + ": " + this.model.get("text"));
        return this;
    }
});
var ChatView = Backbone.View.extend({
    tagName: 'div',

    initialize: function(options) {
        _.bindAll(this, 'render');
        this.model.bind('all', this.render);
        this.model.view = this;
    }

    , render: function() {
        $(this.el).text(this.model.get("time") + " - " + this.model.get("name") + ": " + this.model.get("text"));
        return this;
    }

    , remove: function() {
        $(this.el).remove();
    }

});

var MashTagView = Backbone.View.extend({
    tagName: 'div',

    initialize: function(options) {
        _.bindAll(this, 'render');
        this.model.bind('all', this.render);
    },

    render: function() {
        $(this.el).html(this.model.get("name"));
        $(this.el).css('float', 'left');
        $(this.el).css('margin-right', '5px');
        return this;
    }
});

var ClientCountView = Backbone.View.extend({
    initialize: function(options) {
        _.bindAll(this, 'render');
        this.model.bind('all', this.render);
    },

    render: function() {
        this.el.html(this.model.get("clients"));
        return this;
    }
});

var NodeChatView = Backbone.View.extend({
    initialize: function(options) {
        this.model.chats.bind('add', this.addChat);
        this.model.chats.bind('remove', this.removeChat);
        this.model.mashTags.bind('add', this.addMash);
        this.model.directs.bind('add', this.addDirect);
        this.socket = options.socket;
        this.clientCountView = new ClientCountView({model: new models.ClientCountModel(), el: $('#client_count')});
    }

    , events: {
        "submit #messageForm" : "sendMessage"
    }

    , addChat: function(chat) {
        var view = new ChatView({model: chat});
        $('#chat_list').append(view.render().el);

        if (chat.mashTags.length > 0) {
            $('#mashtag_chat_list').append(view.render().el);
        }
    }

    , removeChat: function(chat) {
        //chat.view.remove();
    }

    , addMash: function(mashTag) {
        var view = new MashTagView({model: mashTag});
        $('#mashtag_list').append(view.render().el);
    }

    , addDirect: function(direct) {
        var view = new ChatView({model: direct});
        $('#direct_list').html(view.render().el);
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
                //if (this.model.chats.length > 20)
                 //   this.model.chats.remove(this.model.chats.last());
                break;
            case 'update':
                this.clientCountView.model.updateClients(message.clients);
                break;
            case 'mash':
                console.log('mash received: ' + message.data );
                var newMash  = new models.MashTagModel();
                newMash.mport(message.data);
                this.model.mashTags.add(newMash);
                break;
            case 'direct':
                console.log('direct received: ' + message.data );
                var newDirect = new models.ChatEntry();
                newDirect.mport(message.data);
                this.model.directs.add(newDirect);
                break;
        }
    }

    , sendMessage: function(){
        var inputField = $('input[name=message]');
        var nameField = $('input[name=user_name]');
        var chatEntry = new models.ChatEntry({name: nameField.val(), text: inputField.val()});
        this.socket.send(chatEntry.xport());
        inputField.val('');
    }
});
