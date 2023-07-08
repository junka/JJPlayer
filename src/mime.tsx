const EXTRACT_TYPE_REGEXP = /.(\w+)$/;
 
/**
 * Mimetypes
 * @enum
 */
const Mimetypes: any = {
    'ogv': 'video/ogg',
    'mp4': 'video/mp4',
    'mkv': 'video/x-matroska',
    'webm': 'video/webm',
    'm4a': 'audio/mp4',
    'mp3': 'audio/mpeg',
    'aac': 'audio/aac',
    'flac': 'audio/flac',
    'oga': 'audio/ogg',
    'wav': 'audio/wav',
    'm3u8': 'application/x-mpegURL',
    '3gp': 'video/3gpp',
    'avi': 'video/x-msvideo',
    'cda': 'application/x-cdf',
    'mid': 'audio/midi',
    'midi' : 'audio/midi',
    'mpeg' : 'video/mpeg',
    'ogx': 'application/ogg',
    'opus' : 'audio/opus',
    'weba' : 'audio/webm',
    '3g2' : 'video/3gpp2',
};
 
/**
 * Get file extension for mime-type.
 *
 * @param {string} mime - Mime-type to match against.
 * @returns {string} File extension.
 * @private
 */
export const getMimeTypes = function(mime:string) {
    const match = EXTRACT_TYPE_REGEXP.exec(mime);
    const result = match && match[1].toLowerCase();
    console.log(match)
    if (result !== null) {
        return Mimetypes[result];
    } else {
        return "unknown"
    }
};



export default getMimeTypes
