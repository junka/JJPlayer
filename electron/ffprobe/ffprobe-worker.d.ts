/// <reference types="node" />
import type { MessagePort as NodeMessagePort } from "worker_threads";
import type { FFprobe, FSFilesystems, FSMountOptions } from "./ffprobe-wasm-shared.d.ts";
import { FileInfo, FramesInfo } from "./types.d.ts";
export declare type IncomingMessage = {
    port: MessagePort | NodeMessagePort;
} & IncomingData;
export declare type IncomingData = {
    type: "getFileInfo";
    payload: [fileName: string, mountOptions: FSMountOptions];
} | {
    type: "getFrames";
    payload: [fileName: string, mountOptions: FSMountOptions, offset: number];
};
export declare type OutgoingMessage = ({
    status: "success";
} & OutgoingData) | {
    status: "error";
    message: string;
};
export declare type OutgoingData = {
    type: "getFileInfo";
    payload: FileInfo;
} | {
    type: "getFrames";
    payload: FramesInfo;
};
export declare function createListener(ffprobePromise: Promise<FFprobe>, fsType: keyof FSFilesystems): (data: IncomingMessage) => Promise<void>;