(function () {
    if (typeof exports !== 'undefined') {
        _ = require('underscore')._;
        mashlib = exports;
    } 
    else {
        mashlib = this.mashlib = {};
    }

    mashlib.getChunksFromString = function(chatText, delimiter, startPos, includeDelimiter) {
        if (typeof startPos === 'boolean') {
            includeDelimiter = startPos;
            startPos = 0;
        }
        var chunkIndex = chatText.indexOf(delimiter, startPos);
        var chunks = new Array();
        if(typeof startPos === 'undefined')
            startPos = 0;
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
            console.log('Found chunks: ' + chunks + ' for delimiter: ' + delimiter, ' starting at position ' + startPos);

        return chunks;
    };

})()
