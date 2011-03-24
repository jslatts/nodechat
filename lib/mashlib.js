(function () {
    if (typeof exports !== 'undefined') {
        _ = require('underscore')._;
        mashlib = exports;
    } 
    else {
        mashlib = this.mashlib = {};
    }

    mashlib.getChunksFromString = function(chatText, delimiter, startPos, includeDelimiter, requireLeadingSpace) {
        if (typeof startPos === 'boolean') {
            includeDelimiter = startPos;
            startPos = 0;
        }

        //Force chunks to be preceded by a space
        var requireLeadingSpace = requireLeadingSpace || true;
        
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

            //Add the chunk If the delimiter is the first thing in the chat, if we don't care about leading spaces, or if there is a leading space
            if((chunkIndex === 0) || (!requireLeadingSpace) || (chatText[chunkIndex-1] === ' '))
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
