
(function () {
  var server = false,
    Models;
  if (typeof exports !== 'undefined') {
    _ = require('underscore')._;
    Backbone = require('backbone');

    Models = exports;
    server = true;
  } else {
    Models = this.Models = {};
  }

//
//Models
//

Models.ChatEntry = Backbone.Model.extend({});

Models.ClientCountModel = Backbone.Model.extend({
    defaults: {
        "clients": 0
    },

    updateClients: function(clients){
        this.set({clients: clients});
    }
});

Models.NodeChatModel = Backbone.Model.extend({
    defaults: {
        "clientId": 0,
        "name": "Anonymous User"
    },

    initialize: function() {
        this.chats = new Models.ChatCollection(); 
    }
});

//
//Collections
//

Models.ChatCollection = Backbone.Collection.extend({
    model: Models.ChatEntry
});

})()
