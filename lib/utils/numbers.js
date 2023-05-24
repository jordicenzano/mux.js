var MAX_UINT32 = Math.pow(2, 32);

var getUint64 = function(uint8) {
  var dv = new DataView(uint8.buffer, uint8.byteOffset, uint8.byteLength);
  var value;

  if (dv.getBigUint64) {
    value = dv.getBigUint64(0);

    if (value < Number.MAX_SAFE_INTEGER) {
      return Number(value);
    }

    return value;
  }

  return (dv.getUint32(0) * MAX_UINT32) + dv.getUint32(4);
};

var getUint64FromBufferLe = function(data) {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(0, true);
};

module.exports = {
  getUint64: getUint64,
  getUint64FromBufferLe: getUint64FromBufferLe,
  MAX_UINT32: MAX_UINT32
};
