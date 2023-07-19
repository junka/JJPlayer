import type { Chapter, Disposition, FileInfo, Format, Frame, FramesInfo, Rational, Stream } from "./types.d.ts";
export declare class FFprobeWorker {
    /**
     * This function tries to be equivalent to
     * ```
     * ffprobe -hide_banner -loglevel fatal -show_format -show_streams -show_chapters -show_private_data -print_format json
     * ```
     */
    constructor();

    async getFileInfo(file: File | string): Promise<FileInfo>;

    async getFrames(file: File | string, offset: number): Promise<FramesInfo>;

    terminate(): void;
}
export type { Chapter, Disposition, FileInfo, Format, Frame, FramesInfo, Rational, Stream, };