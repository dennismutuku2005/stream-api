"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Receiver = void 0;
const iconv = require("iconv-lite");
const debug = require("debug");
const info = debug("routeros-api:connector:receiver:info");
const error = debug("routeros-api:connector:receiver:error");
const nullBuffer = Buffer.from([0x00]);
/**
 * Handles RouterOS socket data and dispatches to tag callbacks.
 */
class Receiver {
    constructor(socket) {
        this.tags = new Map();
        this.dataLength = 0;
        this.sentencePipe = [];
        this.processingSentencePipe = false;
        this.currentLine = "";
        this.currentReply = "";
        this.currentTag = null;
        this.currentPacket = [];
        this.lengthDescriptorSegment = null;
        this.socket = socket;
    }
    read(tag, callback) {
        info("Reader of %s tag is being set", tag);
        this.tags.set(tag, { name: tag, callback });
    }
    stop(tag) {
        info("Not reading from %s tag anymore", tag);
        this.tags.delete(tag);
    }
    processRawData(data) {
        if (this.lengthDescriptorSegment) {
            data = Buffer.concat([this.lengthDescriptorSegment, data]);
            this.lengthDescriptorSegment = null;
        }
        while (data.length > 0) {
            if (this.dataLength > 0) {
                if (data.length <= this.dataLength) {
                    this.dataLength -= data.length;
                    this.currentLine += iconv.decode(data, "win1252");
                    if (this.dataLength === 0) {
                        this.sentencePipe.push({
                            sentence: this.currentLine,
                            hadMore: data.length !== this.dataLength,
                        });
                        this.processSentence();
                        this.currentLine = "";
                    }
                    break;
                }
                else {
                    const tmpBuffer = data.slice(0, this.dataLength);
                    const tmpStr = iconv.decode(tmpBuffer, "win1252");
                    this.currentLine += tmpStr;
                    const line = this.currentLine;
                    this.currentLine = "";
                    data = data.slice(this.dataLength);
                    const [descriptor_length, length] = this.decodeLength(data);
                    if (descriptor_length > data.length) {
                        this.lengthDescriptorSegment = data;
                    }
                    this.dataLength = length;
                    data = data.slice(descriptor_length);
                    if (this.dataLength === 1 && data.equals(nullBuffer)) {
                        this.dataLength = 0;
                        data = data.slice(1);
                    }
                    this.sentencePipe.push({
                        sentence: line,
                        hadMore: data.length > 0,
                    });
                    this.processSentence();
                }
            }
            else {
                const [descriptor_length, length] = this.decodeLength(data);
                this.dataLength = length;
                data = data.slice(descriptor_length);
                if (this.dataLength === 1 && data.equals(nullBuffer)) {
                    this.dataLength = 0;
                    data = data.slice(1);
                }
            }
        }
    }
    /**
     * Process a sentence received from the socket.
     * Handles normal replies, errors, and `!empty` responses safely.
     */
    processSentence() {
        if (this.processingSentencePipe)
            return;
        this.processingSentencePipe = true;
        info("Processing sentence pipe");
        const process = () => {
            if (this.sentencePipe.length === 0) {
                this.processingSentencePipe = false;
                return;
            }
            const line = this.sentencePipe.shift();
            if (!line) {
                this.processingSentencePipe = false;
                return;
            }
            // ✅ RouterOS v7 fix: handle !empty replies gracefully
            if (line.sentence === "!empty") {
                info("Received !empty reply — treating as done");
                if (this.currentTag) {
                    this.currentPacket.push("!done");
                    this.sendTagData(this.currentTag);
                }
                else {
                    info("No current tag for !empty — safely ignored");
                }
                this.processingSentencePipe = false;
                return;
            }
            // Handle fatal responses
            if (!line.hadMore && this.currentReply === "!fatal") {
                this.socket.emit("fatal");
                this.processingSentencePipe = false;
                return;
            }
            info("Processing line %s", line.sentence);
            if (/^\.tag=/.test(line.sentence)) {
                this.currentTag = line.sentence.substring(5);
            }
            else if (/^!/.test(line.sentence)) {
                // If new reply type (!re, !done, !trap)
                if (this.currentTag) {
                    info("Received new response, sending current data to tag %s", this.currentTag);
                    this.sendTagData(this.currentTag);
                }
                this.currentPacket.push(line.sentence);
                this.currentReply = line.sentence;
            }
            else {
                this.currentPacket.push(line.sentence);
            }
            if (this.sentencePipe.length === 0 && this.dataLength === 0) {
                if (!line.hadMore && this.currentTag) {
                    info("No more sentences, sending data to tag %s", this.currentTag);
                    this.sendTagData(this.currentTag);
                }
                else {
                    info("No more sentences and no data to send");
                }
                this.processingSentencePipe = false;
            }
            else {
                process();
            }
        };
        process();
    }
    /**
     * Safely send packet data to the registered tag.
     */
    sendTagData(currentTag) {
        const tag = this.tags.get(currentTag);
        if (tag) {
            info("Sending to tag %s the packet %O", tag.name, this.currentPacket);
            try {
                tag.callback(this.currentPacket);
            }
            catch (err) {
                error(`Callback error for tag ${currentTag}:`, err);
            }
        }
        else {
            // ✅ Avoid crash on unregistered tag during !empty handling
            error(`⚠️ Tried to send to unregistered tag: ${currentTag}`);
        }
        this.cleanUp();
    }
    /**
     * Reset the current packet/session state.
     */
    cleanUp() {
        this.currentPacket = [];
        this.currentTag = null;
        this.currentReply = "";
    }
    /**
     * Decode MikroTik packet length prefix.
     */
    decodeLength(data) {
        let len = 0;
        let idx = 0;
        const b = data[idx++];
        if (b & 128) {
            if ((b & 192) === 128) {
                len = ((b & 63) << 8) + data[idx++];
            }
            else if ((b & 224) === 192) {
                len = ((b & 31) << 8) + data[idx++];
                len = (len << 8) + data[idx++];
            }
            else if ((b & 240) === 224) {
                len = ((b & 15) << 8) + data[idx++];
                len = (len << 8) + data[idx++];
                len = (len << 8) + data[idx++];
            }
            else {
                len = data[idx++];
                len = (len << 8) + data[idx++];
                len = (len << 8) + data[idx++];
                len = (len << 8) + data[idx++];
            }
        }
        else {
            len = b;
        }
        return [idx, len];
    }
}
exports.Receiver = Receiver;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUmVjZWl2ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvY29ubmVjdG9yL1JlY2VpdmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUNBLG9DQUFvQztBQUNwQywrQkFBK0I7QUFHL0IsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLHNDQUFzQyxDQUFDLENBQUM7QUFDM0QsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLHVDQUF1QyxDQUFDLENBQUM7QUFDN0QsTUFBTSxVQUFVLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7QUFZdkM7O0dBRUc7QUFDSCxNQUFhLFFBQVE7SUFZbkIsWUFBWSxNQUFjO1FBVmxCLFNBQUksR0FBK0IsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUM3QyxlQUFVLEdBQUcsQ0FBQyxDQUFDO1FBQ2YsaUJBQVksR0FBZ0IsRUFBRSxDQUFDO1FBQy9CLDJCQUFzQixHQUFHLEtBQUssQ0FBQztRQUMvQixnQkFBVyxHQUFHLEVBQUUsQ0FBQztRQUNqQixpQkFBWSxHQUFHLEVBQUUsQ0FBQztRQUNsQixlQUFVLEdBQWtCLElBQUksQ0FBQztRQUNqQyxrQkFBYSxHQUFhLEVBQUUsQ0FBQztRQUM3Qiw0QkFBdUIsR0FBa0IsSUFBSSxDQUFDO1FBR3BELElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO0lBQ3ZCLENBQUM7SUFFTSxJQUFJLENBQUMsR0FBVyxFQUFFLFFBQW9DO1FBQzNELElBQUksQ0FBQywrQkFBK0IsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUMzQyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUM7SUFDOUMsQ0FBQztJQUVNLElBQUksQ0FBQyxHQUFXO1FBQ3JCLElBQUksQ0FBQyxpQ0FBaUMsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUM3QyxJ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