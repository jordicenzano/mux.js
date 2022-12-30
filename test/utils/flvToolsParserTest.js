const muxjsFlvTools = require('../../lib/tools/flv-inspector');
const fs = require('fs');

const data = fs.readFileSync('test/segments/360p-bars-1s-label-err.flv');
const options = {passDataBuffer: true, parseHeaders: true, parseNALunits: true, passNALUsDataBuffer: true, runValidations: true};

const r = muxjsFlvTools.inspect(data, options);

console.log(JSON.stringify(r));
