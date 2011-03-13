//
// Bootstrap the app
//

$(document).ready(function () {
    window.app = NodeChatController.init({port: 8000});
    $('input:text:first:visible').focus();
});

