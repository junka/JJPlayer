import ReactDOM from 'react-dom/client'
import App from './App'
import videojs from 'video.js'
import * as fs from 'node:fs'
import { ipcRenderer } from "electron"
// import {Wavesurfer} from 'videojs-wavesurfer/dist/videojs.wavesurfer'

declare type Player = ReturnType<typeof videojs>

let asrOn = true

let subtitlevtt : string = 'WEBVTT\n\n'

let autotrack: any = null
let lastplayfile: any = null
let openSeq = 0
let pendingFile: { path: string; mime: string } | null = null

declare global {
  interface Window {
    HELP_IMPROVE_VIDEOJS: boolean;
  }
}

window.HELP_IMPROVE_VIDEOJS = false

interface playConfig {
  video: Player | null;
  tracks: HTMLTrackElement[];
  progressv: number
  audioContext: AudioContext
}

const videoOptions = {
  html5: { nativeAudioTracks: false },
  responsive: true,
  fill: false,
  controls: true,
  autoplay: true,
  preload: 'auto',
  liveui: true,
  playbackRates: [0.5, 1, 1.5, 2, 3, 4],
  // sources: [{ "src": '' }],
  plugins : {
    // wavesurfer: {
    //   backend: 'MediaElement',
    //   displayMilliseconds: true,
    //   debug: true,
    //   waveColor: 'gray',
    //   progressColor: 'black',
    //   cursorColor: 'black',
    //   hideScrollbar: true
    // }
  }
}


let player: playConfig = {
  video : null,
  tracks : [],
  progressv : -1,
  audioContext : new AudioContext(),
}

const onPlayerReady = (rplayer: Player) => {
  player.video = rplayer
  console.log("player is ready")

  if (pendingFile) {
    const file = pendingFile
    pendingFile = null
    openFile(file.path, file.mime)
  }

  rplayer.on('waiting', () => {
    videojs.log('player is waiting');
  })

  rplayer.on('dispose', () => {
    videojs.log('player will dispose');
  })

  rplayer.on('end', () => {
    videojs.log('video too soon')
  })

  // add progress bar in dock for video progress
  rplayer.on("timeupdate", (event: any) => {
    const per = Math.floor(100 * (rplayer.currentTime() as number) / (rplayer.duration() as number))
    if (!isNaN((rplayer.duration() as number)) && !isNaN(per) && (per === 100 || per - player.progressv >= 1 || per < player.progressv)) {
      player.progressv = per
      ipcRenderer.send("play-progress", per / 100)
    }
  })

  // rplayer.on('canplay', ()=> {
  //   // whisperbuff.set(new TextEncoder().encode('WEBVTT\n\n00:01.000 --> 00:04.000\n- Never drink.'), buflen)
  //   // buflen += 'WEBVTT\n\n00:01.000 --> 00:04.000\n- Never drink.'.length
  //   // whisperbuff[buflen] = 0
  //   // if (whisper && whispertrack === null) {
  //   //   console.log('11 vtt track', new TextDecoder().decode(whisperbuff))
  //   //   // const blob = new Blob(['WEBVTT\n\n00:01.000 --> 00:04.000\n- Never drink.'], { type: 'text/vtt' })
  //   //   // const vttpath = URL.createObjectURL(blob)
  //   //   whispertrack = rplayer.addRemoteTextTrack({
  //   //     kind: 'captions',
  //   //     label: 'en',
  //   //     language: "English",
  //   //     mode: "showing",
  //   //     src: whispervttpath,
  //   //   })
  //   //   player.tracks.push(whispertrack as any)
  //   // }
  // })
 
  rplayer.on('play', () => {
    console.log('play a video')
    ipcRenderer.send("play-status", 1)
    player.audioContext.resume()
  })

  rplayer.on('pause', () => {
    console.log('pause a video')
    ipcRenderer.send("play-status", 0)
    player.audioContext.suspend()
  })
}

const accelerations = ["prefer-hardware", "prefer-software"];

if ('VideoDecoder' in window) {
  console.log("WebCodec supported")
}

const readyFrames: VideoFrame[] = [];

let underflow = true;

async function renderFrame() {
  if (readyFrames.length === 0) {
    underflow = true;
    return;
  }
}


// function handleFrame(frame: VideoFrame) {
//   readyFrames.push(frame);
//   if (underflow) {
//     underflow = false;
//     setTimeout(renderFrame, 0);
//   }
// }

async function checkSupportedCodec(codec: string) {
  for (const acceleration of accelerations) {
    const config = {
      codec,
      hardwareAcceleration: acceleration as HardwarePreference,
      codedWidth: 640,
      codedHeight: 480,
      not_supported_field: 123,
    }
    const { supported } = await VideoDecoder.isConfigSupported(config)
    if (supported) {
      return true;
    }
  }
  return false
}

// var transmuxer = new muxjs.mp4.Transmuxer();


// volume control
// const audioGain = audioContext.createGain();
// audioSource.connect(audioGain)
// audioGain.connect(audioContext.destination)

// transmuxer.on('data', (segment: any) => {
//   console.log("data fragment mp4 ready", segment)
//   let data = new Uint8Array(segment.initSegment.byteLenth + segment.data.byteLenth)
//   data.set(segment.initSegment, 0)
// })

ipcRenderer.on('play-action', (event, action) => {
    if (action === 1) {
      player.video?.play()
      player.audioContext.resume()
    } else {
      player.video?.pause()
      player.audioContext.suspend()
    }
})

// XHR against the custom play:// scheme is blocked by CORS; the renderer already has node access
function readAB(path: string, callback: (ab: ArrayBuffer) => void) {
  callback(new Uint8Array(fs.readFileSync(path)).buffer)
}

ipcRenderer.on('file-selected', (event, { path, mime }) => {
  console.log('file selected', mime)
  if (!player.video) {
    // The IPC can beat the player being created (startup file passed on the CLI)
    pendingFile = { path, mime }
    return
  }
  openFile(path, mime)
})

// Whole local files go through Chromium's own demuxer: MSE appendBuffer only accepts
// fragmented MP4 (moov with mvex), so a normal mp4/mov fails with CHUNK_DEMUXER_ERROR_APPEND_FAILED.
function openFile(path: string, mime: string) {
  if (lastplayfile !== path) {
    subtitlevtt = 'WEBVTT\n\n'
    lastplayfile = path
  }
  if (!player.video) return

  if (mime.startsWith('audio')) {
    player.video.disablePictureInPicture(true)
  }

  if (mime === 'audio/pcm') {
    readAB(path, playPCMMedia)
  } else {
    const seq = ++openSeq
    // Native demuxing covers more than MSE did: wav/flac/mp3 play here but are not MSE-appendable.
    // ffmime also reports bogus codec lists (audio/x-wav; codecs=0) that video.js refuses, so only
    // the container type is handed to the element.
    player.video.one('error', () => {
      if (seq !== openSeq) return
      console.log('no native demuxer for', path)
      readAB(path, playAudioOnly)
    })
    player.video.src({ type: mime.split(';')[0], src: 'play://' + encodeURI(path) })
    readAB(path, (ab) => extractAudioForAsr(ab, sendToAsr))
  }

  player.tracks.forEach((t, i) => {
    player.video?.removeRemoteTextTrack(t)
    player.tracks.splice(i, 1)
  })
}

function sendToAsr(audio: Float32Array) {
  console.log("audio loaded, size: ", audio.length)
  if (asrOn) {
    ipcRenderer.send('audio-channel', audio)
  }
}

// Decode the file's audio track and resample it to the 16 kHz mono the ASR model expects
function extractAudioForAsr(buffer: ArrayBuffer, cb: (audio: Float32Array) => void) {
  player.audioContext.decodeAudioData(buffer, (ab) => {
    resampleTo16k(ab, cb)
  }, (err) => {
    console.log("unable to get audio file", err)
  })
}

function resampleTo16k(ab: AudioBuffer, cb: (audio: Float32Array) => void) {
  const offlineCtx = new OfflineAudioContext({
    numberOfChannels: 1,
    length: Math.ceil(ab.duration * 16000),
    sampleRate: 16000,
  })
  const audioSrc = offlineCtx.createBufferSource()
  audioSrc.buffer = ab
  audioSrc.connect(offlineCtx.destination)
  audioSrc.start()
  offlineCtx.startRendering().then((rbuf: AudioBuffer) => {
    cb(rbuf.getChannelData(0))
  })
}

function playPCMMedia(ab: ArrayBuffer) {
  // Raw 16 kHz mono float32 dump: no container to demux, so it is played straight from samples
  const pcm = new Float32Array(ab)
  const buffer = player.audioContext.createBuffer(1, pcm.length, 16000)
  buffer.getChannelData(0).set(pcm)

  const audioSrc = player.audioContext.createBufferSource()
  audioSrc.buffer = buffer
  audioSrc.connect(player.audioContext.destination)
  audioSrc.start(0)
  player.audioContext.resume()
  player.video?.duration(buffer.duration)
  player.video?.play()
}

// Audio-only playback through WebAudio, for containers Chromium cannot demux
function playAudioOnly(buffer: ArrayBuffer) {
  player.audioContext.decodeAudioData(buffer, (ab) => {
    const audioSrc = player.audioContext.createBufferSource()
    audioSrc.buffer = ab
    audioSrc.connect(player.audioContext.destination)
    audioSrc.start()
    player.audioContext.resume()
    player.video?.duration(ab.duration)
    player.video?.play()

    resampleTo16k(ab, sendToAsr)
  }, (err) => {
    console.log("unable to get audio file", err)
  })
}

ipcRenderer.on('subtitle-open', (event, { path }) => {
  const vttpath = encodeURI("play://" + path)
  if (player.video) {
    const t = player.video.addRemoteTextTrack({
      kind: 'captions',
      label: 'en',
      language: "English",
      mode: "showing",
      src: vttpath,
    })
    player.tracks.push(t as any)
  }
})

ipcRenderer.on('subtitle-save', (e, {path}) => {
  console.log('write file to ', path)
  if (asrOn && autotrack !== null) {
    fs.writeFile(path, subtitlevtt, 'utf-8', (err)=>{})
  }
})

ipcRenderer.on('asr-change', (event, {data}) => {
  console.log('auto subtitle changed', data)
  asrOn = data
  if (asrOn == false && autotrack !== null) {
    player.tracks.forEach((t, i) => {
      if (t == autotrack) {
        player.video?.removeRemoteTextTrack(t)
        player.tracks.splice(i, 1)
        autotrack = null
      }
    })
  }
})

ipcRenderer.on('subtitle-txt', (event, {subtitle}) => {
  console.log('sub:', subtitle)
  if (asrOn) {
    subtitlevtt += subtitle+'\n\n'
    const blob = new Blob([subtitlevtt], { type: 'text/vtt' })
    const vttpath = URL.createObjectURL(blob)
    if (autotrack !== null) {
      player.tracks.forEach((t, i) => {
        if (t == autotrack) {
          player.video?.removeRemoteTextTrack(t)
          player.tracks.splice(i, 1)
          autotrack = null
        }
      })
    }
    if (autotrack === null) {
        autotrack = player.video?.addRemoteTextTrack({
          kind: 'captions',
          label: 'en',
          language: "English",
          mode: "showing",
          src: vttpath,
        })
        player.tracks.push(autotrack as any)
    }
  }
})

window.addEventListener('contextmenu', () => {
  ipcRenderer.invoke('show-context-menu')
})

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <div>
    <App options={videoOptions} onReady={onPlayerReady}/>
  </div>
)


postMessage({ payload: 'removeLoading' }, '*')
