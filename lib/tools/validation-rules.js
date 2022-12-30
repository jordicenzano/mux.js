function runValidationRules(parsedResults, options) {
    ruleCheckIDRIntegrity(parsedResults);
    ruleCheckAudioDurationIntegrity(parsedResults);
    ruleCheckVideoDurationIntegrity(parsedResults);
}

// Check if IDR flag aligns from packager to essence
function ruleCheckIDRIntegrity(parsedResults, options) {
    const ruleName = 'CheckIDRIntegrity';
    parsedResults.forEach((flvTag) => {
        if (flvTag.tagType === 'video' && flvTag.nalUnits !== undefined && flvTag.nalUnits.length > 0) {
            const isPackagerIdr = (flvTag.frameType === 'Keyframe (for AVC, a seekable frame)');
            let isEssenceIdr = false;
            flvTag.nalUnits.every(nalu => {
                if (nalu.nalType === 'Coded slice of an IDR picture') {
                    isEssenceIdr = true;
                    return false;
                }
                return true;
            });
            if (isPackagerIdr !== isEssenceIdr) {
                addRule(flvTag, "warning", ruleName, `IDR flag inconsistency. Packager IDR: ${isPackagerIdr}, essence IDR: ${isEssenceIdr}`);
            }
        }
    });
}

function addRule(tag, level, ruleName, messsage) {
    if (tag.validations === undefined) {
        tag.validations = [];
    }
    tag.validations.push({level: level, rulename: ruleName, message: messsage})
}

// If audio frame duration differs from timestamps (so audio timestamp gap / overlap)
function ruleCheckAudioDurationIntegrity(parsedResults, options) {
    const ruleName = 'CheckAudioPacketDurationIntegrity';
    let lastAudioFlvTag = undefined;
    let estimatedPacketDurationMs = undefined;
    parsedResults.forEach((flvTag) => {
        if (flvTag.tagType === 'audio') {
            // Find audio settings from latest ASC
            if (flvTag.ASCHeader !== undefined && flvTag.ASCHeader.samplingFrequency !== undefined) {
                // TODO: JOC Check num samples audio in aac raw, it is possible to use 960 samples/packet
                // Here oncly considered 1024 case
                const samplesPerPacket = 1024;
                estimatedPacketDurationMs = (samplesPerPacket * 1000) / parseInt(flvTag.ASCHeader.samplingFrequency);
            } 
            if (flvTag.aacPacketType === 'AAC Raw' && lastAudioFlvTag !== undefined && estimatedPacketDurationMs !== undefined) {
                const packetDurationMs = flvTag.timestamp - lastAudioFlvTag.timestamp;
                // Trigger alert if difference > 5%
                if (Math.abs(estimatedPacketDurationMs - packetDurationMs) > estimatedPacketDurationMs * 0.05) {
                    addRule(lastAudioFlvTag, "warning", ruleName, `Duration of the audio packet by timestamps is 5%+ different than the one it should be based on essence data. Timestamp dur: ${packetDurationMs}ms, essence dur: ${estimatedPacketDurationMs}ms`);
                }
            }
            if (flvTag.aacPacketType === 'AAC Raw') {
                lastAudioFlvTag = flvTag;
            }
        }
    });
}

// If video frame duration is too diferent from avg
function ruleCheckVideoDurationIntegrity(parsedResults, options) {
    const ruleName = 'CheckVideoPacketDurationIntegrity';
    let lastVideoFlvTag = undefined;

    // Calculate avg (and adds duration to frame)
    // TODO: JOC calculate a rolling avg (more efficient)
    const durationsMs = [];
    parsedResults.forEach((flvTag) => {
        if (flvTag.tagType === 'video' && flvTag.avcPacketType === 'AVC NALU') {
            if (lastVideoFlvTag !== undefined) {
                lastVideoFlvTag.estimatedDurationMs = flvTag.timestamp - lastVideoFlvTag.timestamp;
                durationsMs.push(lastVideoFlvTag.estimatedDurationMs);
            }
            lastVideoFlvTag = flvTag;
        }
    });

    // Calculate median
    const mid = Math.floor(durationsMs.length / 2),
    orderedDurationsMs = [...durationsMs].sort((a, b) => a - b);
    const frameMedianDurMs = orderedDurationsMs.length % 2 !== 0 ? orderedDurationsMs[mid] : (orderedDurationsMs[mid - 1] + orderedDurationsMs[mid]) / 2;

    parsedResults.forEach((flvTag) => {
        if (flvTag.tagType === 'video' && flvTag.avcPacketType === 'AVC NALU' && flvTag.estimatedDurationMs !== undefined) {
            // Check if > 5% of median
            if (Math.abs(frameMedianDurMs - flvTag.estimatedDurationMs) > frameMedianDurMs * 0.05) {
                addRule(flvTag, "warning", ruleName, `Duration of the video frame by timestamps is 5%+ different than the median. Timestamp dur: ${flvTag.estimatedDurationMs}ms, median dur: ${frameMedianDurMs}ms`);
            }
        }
    });
}

module.exports = { runValidationRules };