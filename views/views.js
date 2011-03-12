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
    },

    render: function() {
        $(this.el).html(this.model.get("time") + " - " + this.model.get("name") + ": " + this.model.get("text"));
        return this;
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
        this.model.mashTags.bind('add', this.addMash);
        this.socket = options.socket;
        this.clientCountView = new ClientCountView({model: new models.ClientCountModel(), el: $('#client_count')});
    }

    , events: {
        "submit #messageForm" : "sendMessage"
    }

    , addChat: function(chat) {
        var view = new ChatView({model: chat});
        $('#chat_list').prepend(view.render().el);
    }

    , addMash: function(mashTag) {
        var view = new MashTagView({model: mashTag});
        $('#mashtag_list').prepend(view.render().el);
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
