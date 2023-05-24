/**
 * mux.js
 *
 * Copyright (c) Brightcove
 * Licensed Apache-2.0 https://github.com/videojs/mux.js/blob/master/LICENSE
 */
'use strict'

const codecs = require('../codecs');
const {runValidationRules} = require('./validation-rules')
const {hexStringList} = require('../utils/hex')

var
  tagTypes = {
    0x08: 'audio',
    0x09: 'video',
    0x12: 'metadata'
  },
  parseAVCDecoderConfigurationRecord = function(tag, obj, options) {
    obj.AVCDecoderConfigurationRecord = {};
    let nPos = 0;

    obj.AVCDecoderConfigurationRecord.configurationVersion = tag[nPos++];
    obj.AVCDecoderConfigurationRecord.AVCProfileIndication = tag[nPos++];
    obj.AVCDecoderConfigurationRecord.profile_compatibility = tag[nPos++];
    obj.AVCDecoderConfigurationRecord.AVCLevelIndication = tag[nPos++];
    obj.AVCDecoderConfigurationRecord.lengthSizeMinusOne = tag[nPos++] &  parseInt('00000011', 2);

    // Set AVC header length
    options.AVCHeaderLength = obj.AVCDecoderConfigurationRecord.lengthSizeMinusOne + 1;
    
    const numOfSequenceParameterSets = tag[nPos++] &  parseInt('00011111', 2);
    obj.AVCDecoderConfigurationRecord.sequenceParameterSetNALUnits = [];
    for (let n = 0; n < numOfSequenceParameterSets; n++) {
      const sequenceParameterSetLength =  (tag[nPos] << 8) | tag[nPos + 1];
      nPos += 2;
      obj.AVCDecoderConfigurationRecord.sequenceParameterSetNALUnits.push({data: tag.subarray(nPos, nPos + sequenceParameterSetLength)});
      nPos += sequenceParameterSetLength;
    }

    const numOfPictureParameterSets = tag[nPos++];
    obj.AVCDecoderConfigurationRecord.pictureParameterSetNALUnits = [];
    for (let n = 0; n < numOfPictureParameterSets; n++) {
      const pictureParameterSetLength =  (tag[nPos] << 8) | tag[nPos + 1];
      nPos += 2;
      obj.AVCDecoderConfigurationRecord.pictureParameterSetNALUnits.push({data: tag.subarray(nPos, nPos + pictureParameterSetLength)});
      nPos += pictureParameterSetLength;
    }

    if (obj.AVCDecoderConfigurationRecord.AVCProfileIndication != 66 && obj.AVCDecoderConfigurationRecord.AVCProfileIndication != 77 && obj.AVCDecoderConfigurationRecord.AVCProfileIndication != 88) {
      obj.AVCDecoderConfigurationRecord.chroma_format = tag[nPos++] &  parseInt('00000011', 2);
      obj.AVCDecoderConfigurationRecord.bit_depth_luma_minus8 = tag[nPos++] &  parseInt('00000111', 2);
      obj.AVCDecoderConfigurationRecord.bit_depth_chroma_minus8 = tag[nPos++] &  parseInt('00000111', 2);

      const numOfSequenceParameterSetExt = tag[nPos++];
      obj.AVCDecoderConfigurationRecord.sequenceParameterSetExtNALUnits = [];
      for (let n = 0; n < numOfSequenceParameterSetExt; n++) {
        const sequenceParameterSetExtLength =  (tag[nPos] << 8) | tag[nPos + 1];
        nPos += 2;
        obj.AVCDecoderConfigurationRecord.sequenceParameterSetExtNALUnits.push({data: tag.subarray(nPos, nPos + pictureParameterSetLength)});
        nPos += sequenceParameterSetExtLength;
      }
    }
  },
  bitReaderHelper = function (buf, bitPos, numBits) {
    let ret = 0;
    let internalBytePos =  Math.floor(bitPos/8);
    let internalBitPos =  (7 - bitPos % 8);

    for (let n = 0; n < numBits; n++) {
      const bit = (buf[internalBytePos] & parseInt(Math.pow(2,internalBitPos))) > 0 ? 1 : 0;
      ret = (ret << 1) | bit;
      
      internalBitPos--;
      if (internalBitPos < 0) {
        internalBytePos++;
        internalBitPos = 7;
      }
    }
    return ret;
  },
  parseASCHeader = function(tag, obj, options) {
    const samplingFrequencyIndexValue = [
      '96000',
      '88200',
      '64000',
      '48000',
      '44100',
      '32000',
      '24000',
      '22050',
      '16000',
      '12000',
      '11025',
      '8000',
      '7350',
      'reserved',
      'reserved',
      'escape value'
    ];

    const audioObjectTypeValue = [
      'NULL',
      'AAC',
      'AAC LC',
      'AAC SSR',
      'AAC LTP',
      'SBR',
      'AAC scalable',
      'TwinVQ',
      'HVXC',
      '(reserved)',
      '(reserved)',
      'TTSI',
      'Main synthetic',
      'Wavetable synthesis',
      'General MIDI',
      'Algorithmic Synthesis and Audio FX',
      'ER AAC LC',
      '(reserved)',
      'ER AAC LTP',
      'ER AAC scalable',
      'ER Twin VQ',
      'ER BSAC',
      'ER AAC LD',
      'ER CELP',
      'ER HVXC',
      'ER HILN',
      'ER Parametric',
      'SSC',
      'PS',
      'MPEG Surround ISO/IEC 23003-1',
      '(escape)',
      'Layer-1',
      'Layer-2',
      'Layer-3',
      'DST',
      'ALS',
      'SLS',
      'SLS',
      'ER AAC ELD',
      'SMR Simple',
      'SMR Main',
      'USAC',
      'SAOC',
      'LD MPEG Surround',
      'SAOC-DE',
      'Audio Sync'
    ];

    obj.ASCHeader = {};
    let nBitPos = 0;

    obj.ASCHeader.audioObjectType = bitReaderHelper(tag, nBitPos, 5);
    nBitPos += 5;
    if (obj.ASCHeader.audioObjectType === 31) {
      const audioObjectTypeExt = bitReaderHelper(tag, nBitPos, 6);
      nBitPos += 6;
      obj.ASCHeader.audioObjectType = 32 + audioObjectTypeExt;
    }
    obj.ASCHeader.audioObjectTypeStr = audioObjectTypeValue[obj.ASCHeader.audioObjectType];

    obj.ASCHeader.samplingFrequencyIndex = bitReaderHelper(tag, nBitPos, 4);
    nBitPos += 4;
    if (obj.ASCHeader.samplingFrequencyIndex === 0x0f) {
      obj.ASCHeader.samplingFrequency = bitReaderHelper(tag, nBitPos, 24);
      nBitPos += 24;
    } else {
      obj.ASCHeader.samplingFrequency = samplingFrequencyIndexValue[obj.ASCHeader.samplingFrequencyIndex];
    }

    obj.ASCHeader.channelConfiguration = bitReaderHelper(tag, nBitPos, 4);
    nBitPos += 4;

    // TODO: There is more to parse if interested
  },
  parseAVCTag = function(tag, obj, options) {
    var
      avcPacketTypes = [
        'AVC Sequence Header',
        'AVC NALU',
        'AVC End-of-Sequence'
      ],
      compositionTime = (tag[1] & parseInt('01111111', 2) << 16) | (tag[2] << 8) | tag[3];

    obj = obj || {};

    obj.avcPacketType = avcPacketTypes[tag[0]];
    obj.CompositionTime = (tag[1] & parseInt('10000000', 2)) ? -compositionTime : compositionTime;

    if (tag[0] === 1) {
      if (options.parseNALunits === true) {
        codecs.h264.parseH264NALs(tag.subarray(4), obj, options)
      }
      if (options.passDataBuffer === true) {
        obj.data = tag.subarray(4);
      } else {
        obj.nalUnitTypeRaw = hexStringList(tag.subarray(4, 100));
      }
    } else {
      if (options.passDataBuffer === true) {
        obj.data = tag.subarray(4);
      } else {
        obj.data = hexStringList(tag.subarray(4));
      }
      if (tag[0] === 0 && options.parseHeaders === true) {
        parseAVCDecoderConfigurationRecord(tag.subarray(4), obj, options);
      }
    }

    return obj;
  },
  parseDataTag = function(tag, obj, options) {
    if (options.passDataBuffer === true) {
      obj.data = tag.subarray(0);
    }
  },
  parseVideoTag = function(tag, obj, options) {
    var
      frameTypes = [
        'Unknown',
        'Keyframe (for AVC, a seekable frame)',
        'Inter frame (for AVC, a nonseekable frame)',
        'Disposable inter frame (H.263 only)',
        'Generated keyframe (reserved for server use only)',
        'Video info/command frame'
      ],
      codecID = tag[0] & parseInt('00001111', 2);

    obj = obj || {};

    obj.frameType = frameTypes[(tag[0] & parseInt('11110000', 2)) >>> 4];
    obj.codecID = codecID;

    if (codecID === 7) {
      return parseAVCTag(tag.subarray(1), obj, options);
    }
    return obj;
  },
  parseAACTag = function(tag, obj, options) {
    var packetTypes = [
      'AAC Sequence Header',
      'AAC Raw'
    ];

    obj = obj || {};

    obj.aacPacketType = packetTypes[tag[0]];
    if (tag[0] === 0 && options.parseHeaders === true) {
      // ASC header
      parseASCHeader(tag.subarray(1), obj, options);
    }
    if (options.passDataBuffer === true) {
      obj.data = tag.subarray(1)
    } else {
      obj.data = hexStringList(tag.subarray(1));
    }
    return obj;
  },
  parseAudioTag = function(tag, obj, options) {
    var
      formatTable = [
        'Linear PCM, platform endian',
        'ADPCM',
        'MP3',
        'Linear PCM, little endian',
        'Nellymoser 16-kHz mono',
        'Nellymoser 8-kHz mono',
        'Nellymoser',
        'G.711 A-law logarithmic PCM',
        'G.711 mu-law logarithmic PCM',
        'reserved',
        'AAC',
        'Speex',
        'MP3 8-Khz',
        'Device-specific sound'
      ],
      samplingRateTable = [
        '5.5-kHz',
        '11-kHz',
        '22-kHz',
        '44-kHz'
      ],
      soundFormat = (tag[0] & parseInt('11110000', 2)) >>> 4;

    obj = obj || {};

    obj.soundFormat = formatTable[soundFormat];
    obj.soundRate = samplingRateTable[(tag[0] & parseInt('00001100', 2)) >>> 2];
    obj.soundSize = ((tag[0] & parseInt('00000010', 2)) >>> 1) ? '16-bit' : '8-bit';
    obj.soundType = (tag[0] & parseInt('00000001', 2)) ? 'Stereo' : 'Mono';

    if (soundFormat === 10) {
      return parseAACTag(tag.subarray(1), obj, options);
    }
    return obj;
  },
  parseGenericTag = function(tag) {
    return {
      tagType: tagTypes[tag[0]],
      dataSize: (tag[1] << 16) | (tag[2] << 8) | tag[3],
      timestamp: (tag[7] << 24) | (tag[4] << 16) | (tag[5] << 8) | tag[6],
      streamID: (tag[8] << 16) | (tag[9] << 8) | tag[10]
    };
  },
  inspectFlvTag = function(tag, options) {
    var header = parseGenericTag(tag);
    switch (tag[0]) {
      case 0x08:
        parseAudioTag(tag.subarray(11), header, options);
        break;
      case 0x09:
        parseVideoTag(tag.subarray(11), header, options);
        break;
      case 0x12:
        parseDataTag(tag.subarray(11), header, options);
        break;
    }
    return header;
  },
  inspectFlv = function(bytes, options) {
    var i = 9, // header
        dataSize,
        parsedResults = [],
        tag;

    const internalOptions = options || {};
    // Add enought data to run rules
    if (internalOptions.runValidations === true) {
      internalOptions.parseHeaders = true;
      internalOptions.parseNALunits = true;
    }

    // traverse the tags
    i += 4; // skip previous tag size
    while (i < bytes.byteLength) {
      dataSize = bytes[i + 1] << 16;
      dataSize |= bytes[i + 2] << 8;
      dataSize |= bytes[i + 3];
      dataSize += 11;

      tag = bytes.subarray(i, i + dataSize);
      var tagParsed = inspectFlvTag(tag, internalOptions);
      tagParsed.currentTagOffset = i;
      parsedResults.push(tagParsed);
      i += dataSize + 4;
    }

    if (internalOptions.runValidations === true) {
      runValidationRules(parsedResults, internalOptions);
    }

    return parsedResults;
  },
  textifyFlv = function(flvTagArray) {
    return JSON.stringify(flvTagArray, null, 2);
  };

module.exports = {
  inspectTag: inspectFlvTag,
  inspect: inspectFlv,
  textify: textifyFlv
};
