(function () {
    if (typeof exports !== 'undefined') {
        _ = require('underscore')._;
        mashlib = exports;
    } 
    else {
        mashlib = this.mashlib = {};
    }

    mashlib.getChunksFromString = function(chatText, delimiter, includeDelimiter) {
        var chunkIndex = chatText.indexOf(delimiter);
        var chunks = new Array();
        var startPos = 0;
        var offSet = 1;

        if(includeDelimiter)
            offSet = 0;

        while(startPos <= chatText.length && chunkIndex > -1) {
            //Grab the tag and push it on the array
            var endPos = chatText.indexOf(' ', chunkIndex+1);
            if (endPos < 0) endPos = chatText.length; //handle sentence ending in a tag

            chunks.push(chatText.substring(chunkIndex+offSet, endPos).toLowerCase());
            
            //Setup for the next one
            startPos = endPos +1;
            chunkIndex = chatText.indexOf(delimiter, startPos);
        }
        
        if(chunks.length > 0)
            console.log('Found chunks: ' + chunks + ' for delimiter: ' + delimiter);

        return chunks;
    };

})()
