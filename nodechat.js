//
// Bootstrap the app
//

$(document).ready(function () {
    window.app = NodeChatController.init({port: 80});
    $('input:text:first:visible').focus();
});

