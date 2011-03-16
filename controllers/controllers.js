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
        this.connected = false;


        this.socket.on('connect', function() { 
            log('Connected! Oh hai!');
            this.connected = true;
        }); 

        this.socket.on('message', function(msg) {view.msgReceived(msg)});

        //Try and reconnect if we get disconnected
        this.socket.on('disconnect', function(){
            log('Disconnected from nodechat. Oh noes!');
            connected = false;
            trying = setTimeout(tryconnect,500);
        });

        function tryconnect(){
            log('Trying to reconnect...');
            if(!connected) {
                mySocket.connect();
                clearTimeout(trying);
                trying = setTimeout(tryconnect,30000);
            }
        }
          
        
        this.socket.connect();

        this.view.render();

        return this;
    }
};
