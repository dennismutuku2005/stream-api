/// <reference types="node" />
import { Socket } from "net";
export interface ISentence {
    sentence: string;
    hadMore: boolean;
}
export interface IReadCallback {
    name: string;
    callback: (data: string[]) => void;
}
/**
 * Handles RouterOS socket data and dispatches to tag callbacks.
 */
export declare class Receiver {
    private socket;
    private tags;
    private dataLength;
    private sentencePipe;
    private processingSentencePipe;
    private currentLine;
    private currentReply;
    private currentTag;
    private currentPacket;
    private lengthDescriptorSegment;
    constructor(socket: Socket);
    read(tag: string, callback: (packet: string[]) => void): void;
    stop(tag: string): void;
    processRawData(data: Buffer): void;
    /**
     * Process a sentence received from the socket.
     * Handles normal replies, errors, and `!empty` responses safely.
     */
    private processSentence;
    /**
     * Safely send packet data to the registered tag.
     */
    private sendTagData;
    /**
     * Reset the current packet/session state.
     */
    private cleanUp;
    /**
     * Decode MikroTik packet length prefix.
     */
    private decodeLength;
}
