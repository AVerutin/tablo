const log = require('fs');
const logfile = './debug.log';

const Log = {
    writelog: function(message) {
        message += '\n';
        let today = this.dateToString(new Date());
        log.writeFile(logfile, '[' + today +']\t' + message, { flag: 'a' }, (err) => {});
    },

    dateToString: function(date) {
        let strDate = '';
        let year = date.getFullYear();
        let month = date.getMonth() + 1;
        let day = date.getDate();
        let hour = date.getHours();
        let minutes = date.getMinutes();
        let seconds = date.getSeconds();
        let millisenonds = date.getMilliseconds();

        strDate += year;
        strDate += '-';
        if (month < 10) strDate += '0';
        strDate += month;
        strDate += '-';
        if (day < 10) strDate += '0';
        strDate += day;
        strDate += ' ';
        if (hour < 10) strDate += '0';
        strDate += hour;
        strDate += ':';
        if (minutes < 10) strDate += '0';
        strDate += minutes;
        strDate += ':';
        if (seconds < 10) strDate += '0';
        strDate += seconds;
        strDate += '.';
        if (millisenonds < 100) strDate += '0';
        if (millisenonds < 10) strDate += '0';
        strDate += millisenonds;

        return strDate;
    },
};

module.exports = Log;