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
        $(this.el).html(this.model.get('niceTime') + ' - ' + this.model.get('user') + ': ' + text);
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
        $(this.el).html(this.model.get('name'));
        return this;
    }
    , remove: function () {
        $(this.el).remove();
    }
});

var TopicView = Backbone.View.extend({
    className: 'topic'
    , initialize: function (options) {
        _.bindAll(this, 'render', 'remove', 'addChat', 'removeChat', 'renderAllChats', 'hide');
        this.model.chats.bind('add', this.addChat);
        this.model.chats.bind('remove', this.removeChat);
        this.bind('topic:renderAllChats', this.render);
        this.bind('topic:hide', this.render);
        this.model.view = this;

        this.newMessages = 0;
        this.visible = options.visible; //By default, don't render a topic
    }

    , render: function () {
        log('[render] vis ' + this.visible);
        $(this.el).html(this.model.get('name'));

        if (this.visible) {
            $('.selected_topic').removeClass('selected_topic');
            $(this.el).addClass('selected_topic');
        }

        return this;
    }

    , remove: function () {
        $(this.el).remove();
    }

    //Adds a new chat view to the topic. 
    //If topic.visible is not set to true, only trim the collection and flag the newMessage event
    , addChat: function (chat) {
        log('[addChat] vis' + this.visible);
        if (this.visible) {
            var view = new ChatView({model: chat});
            $('#chat_list').append(view.render().el);
            $('#chat_list')[0].scrollTop = $('#chat_list')[0].scrollHeight;
        }
        
        //remove old ones if we are getting too long
        if (this.model.chats.length > 1000)
            this.model.chats.remove(this.model.chats.first());

        //Keep track of whether we have a new message and emit an event if we do
        this.newMessages += 1;
        if(this.newMessages > 0) {
            this.trigger('topic:message');
        }
    }

    , removeChat: function (chat) { 
        chat.view.remove(); 
    }

    , hide: function() {
        this.visible = false;
        $('#chat_list').html('');
        this.trigger('topic:hide');
    }

    , renderAllChats: function () {
        var that;

        this.visible = true;
        log('[renderAllChats] vis' + this.visible);

        that = this;
        this.model.chats.each(function (chat) {
            that.addChat(chat)
        });
        this.trigger('topic:renderAllChats');
    }
});

var NodeChatView = Backbone.View.extend({
    initialize: function (options) {
        var main, that;

        _.bindAll(this, 'addUser', 'removeUser', 'addTopic', 'removeTopic', 'triggerAutoComplete', 'suggestAutoComplete', 'sendMessages', 'changeDisplayMode');
        this.model.topics.bind('add', this.addTopic);
        this.model.topics.bind('remove', this.removeTopic);
        this.model.globaltopics.bind('add', this.addGlobalTopic);
        this.model.globaltopics.bind('remove', this.removeGlobalTopic);
        this.model.users.bind('add', this.addUser);
        this.model.users.bind('remove', this.removeUser);
        this.socket = options.socket;
        this.userName = options.userName;
        this.chunkSize = 0;
        this.currentDisplayTopic = null;

        //Always start with 'main' by default so we have something to display
        main = new models.TopicModel({name: 'main'});
        this.model.topics.add(main);
        this.changeDisplayMode(main);

        that = this;
        $('#message_box').focusin(function () { 
            that.clearAlerts(0); 
        }); //Clear the alerts when the box gets focus
    }

    , events: {
        'submit #message_form' : 'sendMessage'
        , 'keydown #message_form' : 'triggerAutoComplete'
        , 'keyup #message_form' : 'suggestAutoComplete'
    }
    , changeDisplayMode: function (topic) {
        if (this.currentDisplayTopic === topic && topic.view.visible) {
            return;
        }

        //If already in progress, try again in a second
        if( $('#chat_box').is(":animated") ) {
            setTimeout(this.changeDisplayMode(topic), 100);
            return;
        }

        if (topic) {
            boxTitle = topic.get('name') || 'undefined';
        }

        var that = this;
        //Fade out, load the chats, then fade in
        $('#chat_box').fadeOut(100, function () {

            if (that.currentDisplayTopic) {
                that.currentDisplayTopic.view.hide();
            }

            that.currentDisplayTopic = topic ;

            topic.view.renderAllChats(); //then render the new one. This will automatically set visible = true

            $('#chat_box').fadeIn(100);
            $('#chat_list')[0].scrollTop = $('#chat_list')[0].scrollHeight;
        });
    }
    , clearAlerts: function (count) {
        document.title = 'nodechat';
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
        if(!this.msgAlert) {
            this.msgAlert = setInterval(function () {
                log('set msg alert');
                if (document.title == 'nodechat')
                    document.title = 'nodechat *';
                else
                    document.title = 'nodechat';
            }, 2000);
        }
    }

    , addTopic: function (topic) {
        var view, that;

        var view = new TopicView({model: topic, visible: false});
        $('#topic_list').append(view.render().el);

        that = this;
        view.bind('topic:message', function(event) {
            that.setMsgAlert();
        });

        if (this.currentDisplayTopic === topic) {
            this.changeDisplayMode(topic);
        }
    }

    , removeTopic: function (topic) {
        topic.view.remove();
    }

    , addGlobalTopic: function (topic) {
        var view = new TopicView({model: topic});
        $('#global_topic_list').append(view.render().el);
    }

    , removeGlobalTopic: function (topic) {
        topic.view.remove();
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

    , sendMessage: function () {
        var inputField, match, delimiter, newTopic;

        inputField = $('input[name=message]');

        if (inputField.val().length > 400)
            return;

        this.socket.send({
            event: 'chat'
            , data: inputField.val() 
        });


        //Check to see if we have a direct or a topic chat and retain the prefix
        delimiter = ''; //Don't specify a delimiter for @s, because we want to include them in the topic name
        match = mashlib.getChunksAtStartOfString(inputField.val(), '@', true);

        if (!match) {
            delimiter = '#';
            match = mashlib.getChunksAtStartOfString(inputField.val(), delimiter, false); 
        }

        inputField.val('');
        this.chunkSize = 0;

        if (match)
        {
            inputField.val(delimiter + match + ' ');
            this.chunkSize = match.length + 1;

            var topic = this.model.topics.find(function(t) {
                return t.get('name') === match;
            });

            if (!topic) {
                topic = new models.TopicModel({name: match});
                this.currentDisplayTopic = topic;
                this.model.topics.add(topic);
            }
            else {
                this.changeDisplayMode(topic);
            }

        }

        this.clearAlerts(-1);
    }
    , suggestAutoComplete: function(key) {
        var inputField, chunk;
        inputField = $('input[name=message]');

        if(inputField.val().length >= 1 && ( inputField.val()[0] == '#' || inputField.val()[0] == '@' )) {

            //First try for a topic
            chunk = mashlib.getChunksAtStartOfString(inputField.val(), '#', false);

            //Then try for a direct
            if(!chunk) {
                chunk = mashlib.getChunksFromString(inputField.val(), '@', true);
            }

            var topic = this.model.topics.find(function(t) {
                return t.get('name') === chunk;
            });

            if (topic) {
                this.changeDisplayMode(topic);
            }
        }
    }
    , triggerAutoComplete: function (key) {
        //If backspace has been pressed, and we have some chunks, look into autodelete 
        if(key.keyCode == 8 && this.chunkSize > 0) {
            var inputField = $('input[name=message]');

            //Only autodelete if we are right after the chunks
            if (inputField.val().length == this.chunkSize + 1); 
            {
                inputField.val('');
                this.chunkSize = 0;

                //If we are at zero when this is done, switch to main window
                var topic = this.model.topics.find(function(t) {
                    return t.get('name') === 'main';
                });

                if (topic) {
                    this.changeDisplayMode(topic);
                }
            }
        } 
        else if(key.keyCode == 9) {
            key.preventDefault();

            var inputField = $('input[name=message]');
            if(inputField.length > 0) {
                var currentText = inputField.val();

                //If we have a @ to handle
                var chunk = mashlib.getChunksAtStartOfString(currentText, '@', true);
                if (chunk) {
                    var match = this.model.users.find(function (u) {
                        return (u.get('name').toLowerCase().indexOf(chunk) != -1);
                    });

                    if(match) {
                        inputField.val('@' + match.get('name').toLowerCase() + ' ');
                        this.changeDisplayMode(match);
                    }
                }
                else
                {
                    var chunk = mashlib.getChunksFromString(currentText, '#', false);
                    if (chunk) {
                        var match = this.model.topics.find(function(t) {
                            return (t.get('name').toLowerCase().indexOf(chunk) != -1);
                        });

                        if(match) {
                            inputField.val('#' + match.get('name') + ' ');
                            this.changeDisplayMode(match);
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

