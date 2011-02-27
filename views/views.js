//
//Views
//

var ChatView = Backbone.View.extend({
    tagName: 'li',
    template: _.template("<li><%= text%></li>"),

    initialize: function(options) {
        _.bindAll(this, 'render');
        this.model.bind('all', this.render);
    },

    render: function() {
        $(this.el).html(this.model.get("text"));
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
        _.bindAll(this, 'render');
        this.model.chats.bind('add', this.addChat);
        this.model.bind('all', this.render);
        this.socket = options.socket;
        this.clientCountView = new ClientCountView({model: new Models.ClientCountModel(), el: $('#client_count')});
        this.chatList = $('#chat_list');
    },

    events: {
        "submit #messageForm" : "sendMessage"
    },

    render: function() {
    },

    addChat: function(chat) {
        var view = new ChatView({model: chat});
        $('#chat_list').append(view.render().el);
    },

    msgReceived: function(message){
        if (message.clients) {
            this.clientCountView.model.updateClients(message.clients);
        }
        if (message.chat) {
            var newChatEntry = new Models.ChatEntry({text: message.chat});
            this.model.chats.add(newChatEntry);
        }
    },

    sendMessage: function(message){
        var inputField = $('input[name=message]');
        var nameField = $('input[name=user_name]');
        var message = new Object();
        message.name = nameField.val();
        message.text = inputField.val();
        this.socket.send(message);
        inputField.val('');
    }
});
