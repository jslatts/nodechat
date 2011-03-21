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

    , initialize: function(options) {
        _.bindAll(this, 'addUser', 'removeUser', 'addChat', 'addDirect', 'addMash', 'triggerAutoComplete', 'suggestAutoComplete', 'sendMessages', 'changeDisplayMode');
        this.model.chats.bind('add', this.addChat);
        this.model.chats.bind('remove', this.removeChat);
        this.model.mashTags.bind('add', this.addMashTag);
        this.model.mashTags.bind('remove', this.removeMashTag);
        this.model.globalMashTags.bind('add', this.addGlobalMashTag);
        this.model.globalMashTags.bind('remove', this.removeGlobalMashTag);
        this.model.mashes.bind('add', this.addMash);
        this.model.mashes.bind('remove', this.removeMash);
        this.model.directs.bind('add', this.addDirect);
        this.model.directs.bind('remove', this.removeDirect);
        this.model.users.bind('add', this.addUser);
        this.model.users.bind('remove', this.removeUser);
        this.socket = options.socket;
        this.userName = options.userName;
        this.chunkSizes = new Array();
        this.changeDisplayMode('main', '#main');
        that = this;
        $('#message_box').focusin(function() { that.clearAlerts(0); }); //Clear the alerts when the box gets focus
    }

    , events: {
        'submit #message_form' : 'sendMessage'
        , 'keydown #message_form' : 'triggerAutoComplete'
        , 'keyup #message_form' : 'suggestAutoComplete'
    }
    , changeDisplayMode: function(mode, boxTitle) {
        boxTitle = boxTitle || 'undefined';
        if(boxTitle !== '@' + this.userName)
            $('#box_title').text(boxTitle);

        if (mode === this.currentDisplayMode) return;


        switch(mode) {
            case 'main':
                $('#direct_box').fadeOut( function() {
                    $('#mashtag_box').fadeOut( function() {
                        $('#chat_box').fadeIn();
                        $('#chat_list')[0].scrollTop = $('#chat_list')[0].scrollHeight;
                        this.currentDisplayMode = 'main';
                    });
                });
                break;
            case 'mash':
                $('#chat_box').fadeOut( function() {
                    $('#direct_box').fadeOut( function() {
                        $('#mashtag_box').fadeIn();
                        $('#mashtag_list')[0].scrollTop = $('#mashtag_list')[0].scrollHeight;
                        this.currentDisplayMode = 'mash';
                    });
                });
                break;
            case 'direct':
                $('#chat_box').fadeOut( function() {
                    $('#mashtag_box').fadeOut( function() {
                        $('#direct_box').fadeIn();
                        $('#direct_chat_list')[0].scrollTop = $('#direct_chat_list')[0].scrollHeight;
                        this.currentDisplayMode = 'direct';
                    });
                });
                break;
        }
    }
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
    , removeMashTag: function(mashTag) { 
        mashTag.view.remove();
    }

    , addGlobalMashTag: function(mashTag) {
        var view = new MashTagView({model: mashTag});
        $('#global_mashtag_list').append(view.render().el);
    }
    , removeGlobalMashTag: function(mashTag) { 
        mashTag.view.remove();
    }

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

        this.changeDisplayMode('direct', '@' + direct.get('name'));

        var inputField = $('#message_field');
        if(inputField.val().length === 0)
            inputField.val('@' + direct.get('name') + ' '); 
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

        if (inputField.val().length > 400)
            return;

        var nameField = $('input[name=user_name]');
        var chatEntry = new models.ChatEntry({name: nameField.val(), text: inputField.val()});
        this.socket.send(chatEntry.xport());

        var mashTags = mashlib.getChunksFromString(inputField.val(), '#', true);
        var directs = mashlib.getChunksFromString(inputField.val(), '@', true);

        inputField.val('');
        this.chunkSizes = new Array();

        if (directs.length > 0)
        {
            inputField.val(directs.join(' ') + ' ');

            this.chunkSizes = _.map(directs, function(d) {
                return d.length;
            });
        
        }
        if (mashTags.length > 0)
        {
            inputField.val(inputField.val() + mashTags.join(' ') + ' ');

            this.chunkSizes = this.chunkSizes.concat(_.map(mashTags, function(m) {
                return m.length;
            }));
        }

        this.clearAlerts(-1);
    }
    , suggestAutoComplete: function(key) {
        var inputField = $('input[name=message]');

        if(inputField.val().length >= 1 && inputField.val()[0] == '#' ) {
            var chunk = mashlib.getChunksFromString(inputField.val(), '#', 0, true)[0];
            this.changeDisplayMode('mash', chunk);
        }
        else if(inputField.val().length >= 1 && inputField.val()[0] == '@' ) {
            var chunk = mashlib.getChunksFromString(inputField.val(), '@', 0, true)[0];
            this.changeDisplayMode('direct', chunk);
        } 
        else {
            this.changeDisplayMode('main', '#main');
        }
    }
    , triggerAutoComplete: function(key) {
        //If backspace has been pressed, and we have some chunks, look into autodelete 
        if(key.keyCode == 8 && this.chunkSizes.length > 0) {
            var inputField = $('input[name=message]');
            log(_.reduce(this.chunkSizes, function(memo, num){ return memo + num; }, 0));
            //Only autodelete if we are right after the chunks
            if (inputField.val().length == _.reduce(this.chunkSizes, function(memo, num){ return memo + num + 1; }, 0))
            {
                var chunk = this.chunkSizes.pop();
                var current = inputField.val();
                current = current.substring(0, current.length - chunk);
                inputField.val(current);

                log('delete length is ' + current.length);
                //If we are at zero when this is done, switch to main window
                if(current.length <= 1)  {
                    log('made it in');
                    this.changeDisplayMode('main', '#main');
                }
            }

        } 
        else if(key.keyCode == 9) {
            key.preventDefault();

            var inputField = $('input[name=message]');
            if(inputField.length > 0) {
                var currentText = inputField.val();

                var lastAT = currentText.lastIndexOf('@');
                var lastMT = currentText.lastIndexOf('#');
                var lastSpace = currentText.lastIndexOf(' ');

                //If we have a @ to handle
                if (lastAT > -1 && lastAT > lastMT && lastAT > lastSpace) {
                    var chunk = mashlib.getChunksFromString(currentText, '@', lastAT);

                    var match = this.model.users.find(function(u) {
                        return (u.get('name').toLowerCase().indexOf(chunk) != -1);
                    });

                    if(match) {
                        inputField.val(currentText.substring(0, lastAT+1) + match.get('name').toLowerCase() + ' ');
                        this.changeDisplayMode('direct', '@' + match.get('name'));
                    }
                }
                //Of if we have a # to handle
                else if(lastMT > -1 && lastMT > lastSpace)
                {
                    var chunk = mashlib.getChunksFromString(currentText, '#', lastMT);

                    var match = this.model.globalMashTags.find(function(t) {
                        return (t.get('name').toLowerCase().indexOf(chunk) != -1);
                    });

                    if(match) {
                        inputField.val(currentText.substring(0, lastMT+1) + match.get('name') + ' ');
                        this.changeDisplayMode('mash', '#' + match.get('name'));
                    }
                }
            }
        }
    }
    , setConnected: function(connected) {
        if(connected)
            $('#disconnectMessage').hide();
        else
            $('#disconnectMessage').show();
    }
});

