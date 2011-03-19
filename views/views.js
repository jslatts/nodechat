//
//Views
//
function replaceURLWithHTMLLinks(text) {
    var regex = /\b((?:[a-z][\w-]+:(?:\/{1,3}|[a-z0-9%])|www\d{0,3}[.]|[a-z0-9.\-]+[.][a-z]{2,4}\/)(?:[^\s()<>]+|\(([^\s()<>]+|(\([^\s()<>]+\)))*\))+(?:\(([^\s()<>]+|(\([^\s()<>]+\)))*\)|[^\s`!()\[\]{};:'".,<>?«»“”‘’]))/i;

    return text.replace(regex,"<a href='$1' target='_blank'>$1</a>");
}

function replaceURLWithMarkDown(text) {
    var regex_3asterisk = /\*{3}([a-z0-9% ]+)\*{3}/ig;
    var regex_3underscore = /\_{3}([a-z0-9% ]+)\_{3}/ig;
    var regex_2asterisk = /\*{2}([a-z0-9% ]+)\*{2}/ig;
    var regex_2underscore = /\_{2}([a-z0-9% ]+)\_{2}/ig;
    var regex_asterisk = /\*([a-z0-9% ]+)\*/ig;
    var regex_underscore = /\_([a-z0-9% ]+)\_/ig;

    var returntext = text.replace(regex_3asterisk,"<u>$1</u>")
    returntext = returntext.replace(regex_3underscore,"<u>$1</u>")
    returntext = returntext.replace(regex_2asterisk,"<strong>$1</strong>")
    returntext = returntext.replace(regex_2underscore,"<strong>$1</strong>")
    returntext = returntext.replace(regex_asterisk,"<em>$1</em>")
    returntext = returntext.replace(regex_underscore,"<em>$1</em>")
    return returntext;
}

var ChatView = Backbone.View.extend({
    initialize: function(options) {
        _.bindAll(this, 'render');
        this.model.bind('all', this.render);
        this.model.view = this;
    }
    , render: function() {
        var text = replaceURLWithHTMLLinks(this.model.get('text'));
        text = replaceURLWithMarkDown(text);
        $(this.el).html(this.model.get('time') + ' - ' + this.model.get('name') + ': ' + text);
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
        $(this.el).html(this.model.get('time') + ' - ' + this.model.get('name') + ': ' + this.model.get('text'));
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

    , clearAlerts: function(count) {
        document.title = 'nodechat';
        this.newMessages = count;
        this.newDirectMessages = 0;

        clearInterval(this.directAlert); 
        clearInterval(this.msgAlert); 

        this.msgAlert = null;
        this.directAlert = null;
        document.title = 'nodechat';
    }
    , setDirectAlert: function() {
        log('trying to unset');
        if(!this.directAlert) {
            clearInterval(this.msgAlert); //@directs trump regular messages
            this.msgAlert = null;
            document.title = 'nodechat';

            this.directAlert = setInterval(function() {
                log('set direct alert');
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
                log('set msg alert');
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
        that = this;
        $('#message_box').focusin(function() { that.clearAlerts(0); }); //Clear the alerts when the box gets focus
    }

    , events: {
        'submit #message_form' : 'sendMessage'
    }

    , addChat: function(chat) {
        var view = new ChatView({model: chat});
        $('#chat_list').append(view.render().el);
        $('#chat_list')[0].scrollTop = $('#chat_list')[0].scrollHeight;
        
        //remove old ones if we are getting too long
        if (this.model.chats.length > 1000)
            this.model.chats.remove(this.model.chats.first());


        ++this.newMessages;
        if(this.newMessages > 0) 
            this.setMsgAlert();
    }
    , removeChat: function(chat) { chat.view.remove(); }

    , addMash: function(mash) {
        var view = new MashView({model: mash});
        $('#mashtag_chat_list').append(view.render().el);
        $('#mashtag_chat_list')[0].scrollTop = $('#mashtag_chat_list')[0].scrollHeight;

        //remove old ones if we are getting too long
        if (this.model.mashes.length > 500)
            this.model.mashes.remove(this.model.mashes.first());
    }
    , removeMash: function(mash) { mash.view.remove(); }

    , addMashTag: function(mashTag) {
        var view = new MashTagView({model: mashTag});
        $('#mashtag_list').append(view.render().el);
    }
    , removeMashTag: function(mashTag) { mashTag.view.remove(); }

    , addDirect: function(direct) {
        var view = new ChatView({model: direct});
        $('#direct_chat_list').append(view.render().el);
        $('#direct_chat_list')[0].scrollTop = $('#direct_chat_list')[0].scrollHeight;

        ++this.newDirectMessages;
        log('have directs' + this.newDirectMessages);
        if(this.newDirectMessages > 0) 
            this.setDirectAlert();

        //remove old ones if we are getting too long
        if (this.model.directs.length > 500)
            this.model.directs.remove(this.model.directs.first());
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

    , sendMessage: function(){
        var inputField = $('input[name=message]');
        var nameField = $('input[name=user_name]');
        var chatEntry = new models.ChatEntry({name: nameField.val(), text: inputField.val()});
        this.socket.send(chatEntry.xport());
        inputField.val('');
        this.clearAlerts(-1);
    }

    , setConnected: function(connected) {
        if(connected)
            $('#disconnectMessage').hide();
        else
            $('#disconnectMessage').show();
    }
});
