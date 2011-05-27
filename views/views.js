/*!
 * views.js
 * Copyright(c) 2011 Justin Slattery <justin.slattery@fzysqr.com> 
 * MIT Licensed
 */

/*
 * Helper function to search text for URLs and linkify them.
 *
 * @param {string} text - Text to parse for URLs
 * @return {string} - Linkified text
 */
function replaceURLWithHTMLLinks(text) {
    var regex = /\b((?:[a-z][\w-]+:(?:\/{1,3}|[a-z0-9%])|www\d{0,3}[.]|[a-z0-9.\-]+[.][a-z]{2,4}\/)(?:[^\s()<>]+|\(([^\s()<>]+|(\([^\s()<>]+\)))*\))+(?:\(([^\s()<>]+|(\([^\s()<>]+\)))*\)|[^\s`!()\[\]{};:'".,<>?«»“”‘’]))/i;

    return text.replace(regex, "<a href='$1' target='_blank'>$1</a>");
}

/*
 * Helper function to search text for markdown-esque bold/italics/underline strings and wrap them in appropriate html
 *
 * @param {string} text - Text to parse for bold/italics/underline
 * @return {string} - Text with HTML embedded
 */
function replaceURLWithMarkDown(text) {
    var regex_3asterisk
        , regex_3underscore
        , regex_2asterisk
        , regex_2underscore
        , regex_asterisk
        , regex_underscore
        , returntext;

    regex_3asterisk = /\*{3}([a-z0-9% ]+)\*{3}/ig;
    regex_3underscore = /\_{3}([a-z0-9% ]+)\_{3}/ig;
    regex_2asterisk = /\*{2}([a-z0-9% ]+)\*{2}/ig;
    regex_2underscore = /\_{2}([a-z0-9% ]+)\_{2}/ig;
    regex_asterisk = /\*([a-z0-9% ]+)\*/ig;
    regex_underscore = /\_([a-z0-9% ]+)\_/ig;

    returntext = text.replace(regex_3asterisk, "<u>$1</u>");
    returntext = returntext.replace(regex_3underscore, "<u>$1</u>");
    returntext = returntext.replace(regex_2asterisk, "<strong>$1</strong>");
    returntext = returntext.replace(regex_2underscore, "<strong>$1</strong>");
    returntext = returntext.replace(regex_asterisk, "<em>$1</em>");
    returntext = returntext.replace(regex_underscore, "<em>$1</em>");
    return returntext;
}

var ChatView = Backbone.View.extend({
    initialize: function (options) {
        _.bindAll(this, 'render');
        this.model.bind('all', this.render);
        this.model.view = this;
    }
    , render: function () {
        var text = replaceURLWithHTMLLinks(this.model.get('text'));
        text = replaceURLWithMarkDown(text);
        var fullText = this.model.get('niceTime') + ' - ' + this.model.get('user') + ': ' + text;
        fullText = fullText.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        $(this.el).html(fullText);
        return this;
    }
    , remove: function () {
        $(this.el).remove();
    }
});

var StatusView = Backbone.View.extend({
    initialize: function (options) {
        _.bindAll(this, 'render');
        this.userName = options.userName;
        this.statusMessage = options.statusMessage;
        this.niceTime = options.niceTime;
    }
    , render: function () {
        var text, message, time;

        text = this.userName;
        text = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        message = this.statusMessage;
        time = this.niceTime;
        $(this.el).html(time + ' - <em>' + text + ' ' + message + '</em>');
        return this;
    }
});

var UserView = Backbone.View.extend({
    className: 'user_model'

    , initialize: function (options) {
        _.bindAll(this, 'render');
        this.model.bind('all', this.render);
        this.model.view = this;
    }
    , render: function () {
        var uName = this.model.get('name');
        uName = uName.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        $(this.el).html(uName);
        return this;
    }
    , remove: function () {
        $(this.el).remove();
    }
});

//Helper function to pulse an element count times
var pulse = function (element, count) { 
    $(element).fadeOut(900, 'swing', function () {
        $(element).fadeIn(900, 'linear', function () {
            if (count > 0) {
                count -= 1;
                var timeout = setTimeout(function() {
                    return pulse(element, count);
                }, 3000);
            }
        });
    });
}

var NodeChatView = Backbone.View.extend({
    events: {
        'submit #message_form': 'sendMessage'
        , 'keydown #message_field': 'triggerAutoComplete'
        , 'keyup #message_field': 'suggestAutoComplete'
    }

    , initialize: function (options) {
        var main, that;

        _.bindAll(this, 'addUser', 'removeUser', 'addChat', 'removeChat', 'triggerAutoComplete', 'suggestAutoComplete', 'sendMessage', 'setMsgAlert');
        this.model.users.bind('add', this.addUser);
        this.model.users.bind('remove', this.removeUser);
        this.model.chats.bind('add', this.addChat);
        this.model.chats.bind('add', this.setMsgAlert);
        this.model.chats.bind('remove', this.removeChat);
        this.newMessages = 0;
        this.socket = options.socket;
        this.userName = options.userName;
        this.chunkSize = 0;

        that = this;
        $('input#message_field').focusin(function () { 
            that.clearAlerts(0); 
        }); //Clear the alerts when the box gets focus
    }

    , render: function() {
        log('rendered main view');
    }

    , clearAlerts: function (count) {
        this.newMessages = count;
        this.newDirectMessages = 0;

        clearInterval(this.directAlert); 
        clearInterval(this.msgAlert); 

        this.msgAlert = null;
        this.directAlert = null;
        document.title = 'nodechat';
    }
    , setDirectAlert: function () {
        log('trying to unset');
        if(!this.directAlert) {
            clearInterval(this.msgAlert); //@directs trump regular messages
            this.msgAlert = null;
            document.title = 'nodechat';

            this.directAlert = setInterval(function () {
                log('set direct alert');
                if (document.title == 'nodechat')
                    document.title = 'nodechat @';
                else
                    document.title = 'nodechat';
            }, 2000);
        }
    }
    , setMsgAlert: function () {
        this.newMessages += 1;
        if(this.newMessages > 0 && !this.msgAlert) {
            this.msgAlert = setInterval(function () {
                log('set msg alert');
                if (document.title == 'nodechat')
                    document.title = 'nodechat *';
                else
                    document.title = 'nodechat';
            }, 2000);
        }
    }

    , addUser: function (user) {
        var view = new UserView({model: user});
        $('#user_list').append(view.render().el);
        $('#user_count').html(this.model.users.length + ' ');

        if (!user.get('preExist')) {
            var view = new StatusView({userName: user.get('name'), niceTime: user.get('niceTime'), statusMessage: 'has joined nodechat'});
            $('#chat_list').append(view.render().el);
            $('#chat_list')[0].scrollTop = $('#chat_list')[0].scrollHeight;
        }
    }
    , removeUser: function (user) { 
        user.view.remove();
        $('#user_count').html(this.model.users.length + ' ');
    }

    , displayUserLeaveMessage: function (user) {
        var view = new StatusView({userName: user.get('name'), niceTime: user.get('niceTime'), statusMessage: 'has left nodechat'});
        $('#chat_list').append(view.render().el);
        $('#chat_list')[0].scrollTop = $('#chat_list')[0].scrollHeight;
    }

    //Adds a new chat view to the topic. 
    , addChat: function (chat) {
        var view = new ChatView({model: chat});
        $('#chat_list').append(view.render().el);
        $('#chat_list')[0].scrollTop = $('#chat_list')[0].scrollHeight;
        
        //remove old ones if we are getting too long
        if (this.model.chats.length > 1000)
            this.model.chats.remove(this.model.chats.first());
    }

    , removeChat: function (chat) { 
        chat.view.remove(); 
    }

    , sendMessage: function () {
        var inputField, match, delimiter;

        inputField = $('input[name=message]');

        if (inputField.val().length > 400) {
            return;
        }

        this.socket.send({
            event: 'chat'
            , data: inputField.val() 
        });


        //Check to see if we have a direct or a topic chat and retain the prefix
        delimiter = ''; //Don't specify a delimiter for @s, because we want to include them in the topic name
        match = mashlib.getChunksAtStartOfString(inputField.val(), '@', true);

        inputField.val('');
        this.chunkSize = 0;

        this.clearAlerts(-1);
    }
    , suggestAutoComplete: function(key) {
        var inputField, chunk;
        inputField = $('input[name=message]');

        if(inputField.val().length >= 1 && inputField.val()[0] === '@' ) {

            chunk = mashlib.getChunksFromString(inputField.val(), '@', true);
        }
    }
    , triggerAutoComplete: function (key) {
        var inputField, chunk, currentText, match;

        inputField = $('input[name=message]');
        //If backspace has been pressed, and we have some chunks, look into autodelete 
        if(key.keyCode === 8 && this.chunkSize > 0) {

            //Only autodelete if we are right after the chunks
            if (inputField.val().length <= (this.chunkSize + 1)) {
                inputField.val('');
                this.chunkSize = 0;
            }
        } 
        //If the tab key has been pressed, try and complete
        else if(key.keyCode == 9) {
            key.preventDefault();

            if(inputField.length > 0) {
                currentText = inputField.val();

                //If we have a @ to handle
                chunk = mashlib.getChunksAtStartOfString(currentText, '@', false);
                if (chunk) {
                    match = this.model.users.find(function (u) {
                        return (u.get('name').toLowerCase().indexOf(chunk) != -1);
                    });

                    if (match) {
                        inputField.val('@' + match.get('name').toLowerCase() + ' ');
                        this.chunkSize = match.get('name').length + 1; //Set the chunksize so we can backspace out if we want

                        topicMatch = this.model.topics.find(function (t) {
                            return t.get('name') === '@' + match.get('name');
                        });

                        if (topicMatch) {
                            this.changeDisplayMode(topicMatch.get('name'));
                        }
                    }
                }
            }
        }
    }
    , setConnected: function (connected) {
        if(connected)
            $('#disconnectMessage').hide();
        else
            $('#disconnectMessage').show();
    }
});

