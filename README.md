
# JJPlayer WIP

A video player based on Electron

According to [format and codec supported by electron](https://developer.mozilla.org/en-US/docs/Web/Media/Formats/Containers)
containers
- MP4(QuickTime/ MOV / MPEG4)
- Ogg
- WebM
- WAV
- HLS

Codecs:
Audio
- FLAC
- MP3
- Opus
- PCM8 / PCM16 / PCM32 / PCM u-law
- Vorbis
- AAC

Video
- VP8/9
- AV1
- Theora
- H264
- H265
- MPEG4

are supported by default

However, after some test
other container and codec supported:
Containers
- mkv

other format and codec will be supported with nodejs addon
FLV
3gp
rm/rmvb
ts

[subtitle and captions supported by WebVtt](https://developer.mozilla.org/en-US/docs/Web/API/WebVTT_API)

speech to text on screen support for auto subtitle
