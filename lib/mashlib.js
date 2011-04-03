//mashlib.js 
//Parses strings for delimiters and returns chunks.
//
//Copyright(c) 2011 Justin Slattery <justin.slattery@fzysqr.com> 
//MIT Licensed

//This is a [CommonJS module](http://www.commonjs.org/) so we need to start off with some setup. 
//
//Here we are checking to see if this code is included as a module. If it is, we go ahead and include our one dependency, underscore
(function () {
    if (typeof exports !== 'undefined') {
        _ = require('underscore')._;
        mashlib = exports;
    } 
    else {
        mashlib = this.mashlib = {};
    }

    //Take a string and look for sections separated by a given delimiter.
    //
    // - @param {string} chatText
    // - @param {string} delimiter
    // - @param {int} startPos - defaults to 0
    // - @param {boolean} includeDelimiter - defaults to false
    // - @param {boolean} requireLeadingSpace - defaults to true
    //@return {array}
    mashlib.getChunksFromString = function(chatText, delimiter, startPos, includeDelimiter, requireLeadingSpace) {
        if (typeof startPos === 'boolean') {
            includeDelimiter = startPos;
            startPos = 0;
        }

        //Force chunks to be preceded by a space
        var requireLeadingSpace = requireLeadingSpace || true;
        
        var chunkIndex = chatText.indexOf(delimiter, startPos);
        var chunks = [];
        if(typeof startPos === 'undefined') {
            startPos = 0;
        }

        var offSet = 1;

        if(includeDelimiter) {
            offSet = 0;
        }

        while(startPos <= chatText.length && chunkIndex > -1) {
            //Grab the tag and push it on the array
            var endPos = chatText.indexOf(' ', chunkIndex+1);
            if (endPos < 0) {
                endPos = chatText.length; //handle sentence ending in a tag
            }

            //Add the chunk if the delimiter:
            //
            // - is not standalone:  'blah @ blah'
            //
            // AND:
            //
            // - is the first thing in the chat
            // - if we don't care about leading spaces
            // - or if there is a leading space
            if((chunkIndex+1 < endPos) 
                    && ((chunkIndex === 0) 
                        || (!requireLeadingSpace) 
                        || (chatText[chunkIndex-1] === ' '))) {
                chunks.push(chatText.substring(chunkIndex+offSet, endPos).toLowerCase());
            }
            
            //Setup for the next one
            startPos = endPos +1;
            chunkIndex = chatText.indexOf(delimiter, startPos);
        }
        
        if(chunks.length > 0) {
            //console.log('Found chunks: ' + chunks + ' for delimiter: ' + delimiter, ' starting at position ' + startPos);
        }

        return chunks;
    };

    //Return the chunk at the beginning of the string if it matches the delimiter
    mashlib.getChunksAtStartOfString = function (chatText, delimiter, includeDelimiter) {
        includeDelimiter = includeDelimiter || false;

        //If the delimiter does not start the string, give up
        if(chatText[0] !== delimiter) {
            return null;
        }

        //Decide whether we want the delimiter returned as part of the chunk, default is no
        var offSet = 1;
        if (includeDelimiter) {
            offSet = 0;
        }

        //Look for the first space in the string
        var endPos = chatText.indexOf(' ');
        //If it is not found, or we ONLY have a delimiter, give up
        if(endPos === -1 || endPos === 1) {
            return null;
        }

        //Otherwise return the found chunk
        return chatText.substring(offSet, endPos).toLowerCase();
    }

})()
