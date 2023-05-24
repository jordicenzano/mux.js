
var hex = function (val) {
    return '0x' + ('00' + val.toString(16)).slice(-2).toUpperCase();
};

var hexStringList = function (data) {
    var arr = [], i;

    while (data.byteLength > 0) {
        i = 0;
        arr.push(hex(data[i++]));
        data = data.subarray(i);
    }
    return arr.join(' ');
};

module.exports = {
    hexStringList: hexStringList
};