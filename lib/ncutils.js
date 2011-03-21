(function () {
    if (typeof exports !== 'undefined') {
        _ = require('underscore')._;
        ncutils = exports;
    } 
    else {
        ncutils = this.ncutils = {};
    }

    //Helpers
    ncutils.getClockTime = function()
    {
       var now    = new Date();
       var hour   = now.getHours();
       var minute = now.getMinutes();
       var second = now.getSeconds();
       var ap = "AM";
       if (hour   > 11) { ap = "PM";             }
       if (hour   > 12) { hour = hour - 12;      }
       if (hour   == 0) { hour = 12;             }
       if (hour   < 10) { hour   = "0" + hour;   }
       if (minute < 10) { minute = "0" + minute; }
       if (second < 10) { second = "0" + second; }
       var timeString = hour +
                        ':' +
                        minute +
                        ':' +
                        second +
                        " " +
                        ap;
       return timeString;
    };

})()
