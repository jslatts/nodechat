//
//Controllers
//
NodeChatController = {
    init: function(options) {
        this.socket = new io.Socket(null, {port: options.port});

        var mySocket = this.socket;

        this.model = new models.NodeChatModel();
        this.view = new NodeChatView({model: this.model, socket: this.socket, el: $('#content')});
        var view = this.view;


        this.socket.on('connect', function() {
            var rediskey = 'hewo';
            mySocket.send({rediskey: rediskey});
        });

        this.socket.on('message', function(msg) {view.msgReceived(msg)});
        this.socket.connect();

        this.view.render();

        return this;
    }
};
