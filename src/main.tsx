import ReactDOM from 'react-dom/client'
import App from './App'
import videojs from 'video.js'
import { ipcRenderer } from "electron"
import {getMimeTypes} from './mime'
import {SharedBufferWorkletNode} from './audioworker-node'

declare type Player = ReturnType<typeof videojs>

let whisper = true

const mimeCodec = 'video/mp4'
const test = MediaSource.isTypeSupported(mimeCodec)
console.log("test support for ", mimeCodec, test)


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
  mediasrc: MediaSource | null
  audioContext: AudioContext
  // sbwn : SharedBufferWorkletNode | null
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
}

let player: playConfig = {
  video : null,
  tracks : [],
  progressv : -1,
  mediasrc : null,
  audioContext : new AudioContext(),
  // sbwn: null
}

const onPlayerReady = (rplayer: Player) => {
  player.video = rplayer
  const playButton = document.querySelector('vhs-big-play-button')
  playButton?.addEventListener('click', () => {
    console.log("aaaa")
  })
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
    const per = Math.floor(100 * rplayer.currentTime() / rplayer.duration())
    if (!isNaN(rplayer.duration()) && !isNaN(per) && (per === 100 || per - player.progressv >= 1 || per < player.progressv)) {
      player.progressv = per
      ipcRenderer.send("play-progress", per / 100)
    }
  })
 
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

function initAudioWorker(initcb: (sb: SharedBufferWorkletNode)=> void) {
  player.audioContext.audioWorklet.addModule(new URL('./audioworker-processor.ts', import.meta.url)).then(() => {
    console.log('audio worker module added')
    const sb = new SharedBufferWorkletNode(player.audioContext)
    sb.onInitialized = () => {
      console.log("sb inited")
      initcb(sb)
    }

    sb.onError = () => {
      console.log("sb error")
    }

    // player.sbwn = sb
  })
}

const accelerations = ["prefer-hardware", "prefer-software"];

// if ('VideoDecoder' in window) {
//   console.log("WebCodec supported")
// }

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

// for mp2t to mp4
// transmuxer.on('done', () => {
//   console.log("transmux done")
// })

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

function fetchAB(url: string, callback: Function) {
  var xhr = new XMLHttpRequest;
  xhr.open('get', url);
  xhr.responseType = 'arraybuffer';
  xhr.onload = function () {
    callback(xhr.response)
  };
  xhr.send();
}

ipcRenderer.on('file-selected', (event, { path, mime }) => {
  console.log('file selected')
  if (player.video) {
    const mediasrc = new MediaSource()
    player.mediasrc = mediasrc

    mediasrc.addEventListener('sourceopen', (evt) => {
      console.log("source open", evt)
      // const mimeCodec = 'video/mp4; codecs="avc1.4d4016,mp4a.40.2"'
      if (mime.startsWith('audio')) {
        player.video?.disablePictureInPicture(true)
        // player.video?.audioOnlyMode(true)
      }

      if (!MediaSource.isTypeSupported(mime)) {
        console.log("not support for ", mime)

        function playPCMMedia(ab: ArrayBuffer) {
          initAudioWorker((sb) => {
            const pcm = new Float32Array(ab)
            const audioSrc = player.audioContext.createBufferSource();
            const chanBuf = audioSrc.buffer?.getChannelData(0)
            chanBuf?.set(pcm)
            sb.connect(player.audioContext.destination)
            audioSrc.connect(sb)

            audioSrc.start(0)
            player.video?.play()
            // player.video?.duration(ab.duration)
            console.log("ab ", ab)
            player.audioContext.resume()

            const offlineCtx = new OfflineAudioContext({
              numberOfChannels: 1,
              length: ab.byteLength,
              sampleRate: 16000,
            })

            offlineCtx.oncomplete = (e) => {
              console.log("offline audio render complete", e)
            }

            offlineCtx.startRendering().then((rbuf:AudioBuffer) => {
              console.log("start222 rendering", rbuf)
              var audio = rbuf.getChannelData(0)
              console.log("rbuf size", rbuf.length)
              console.log("audio loaded, size: ", audio.length)
              if (whisper) {
                ipcRenderer.send('audio-channel', audio)
              }
            })
          })
        }
        function decodeCustomMedia(buffer: ArrayBuffer) {
          // const gain = player.audioContext.createGain()
          player.audioContext.decodeAudioData(buffer, (ab) => {
            initAudioWorker((sb) => {
              // console.log("ab ", ab)
              //do reasmple to 16000
              const offlineCtx = new OfflineAudioContext({
                numberOfChannels: 1,
                length: ab.duration * 16000,
                sampleRate: 16000,
              })

              offlineCtx.oncomplete = (e) => {
                console.log("offline audio render complete", e)
              }

              offlineCtx.startRendering().then((rbuf:AudioBuffer) => {
                console.log("start11 rendering", rbuf)
                var audio = rbuf.getChannelData(0)
                console.log("rbuf size", rbuf.length)
                console.log("audio loaded, size: ", audio.length)
                ipcRenderer.send('audio-channel', audio)
              })
              const audioSrc = offlineCtx.createBufferSource();
              audioSrc.buffer = ab
              audioSrc.connect(offlineCtx.destination)
              audioSrc.start()

              player.video?.duration(ab.duration)
              player.video?.play()
              player.audioContext.resume()

              const audioSrcP = player.audioContext.createBufferSource();
              audioSrcP.buffer = ab
              sb.connect(player.audioContext.destination)
              audioSrcP.connect(sb)
              audioSrcP.start()
            })
          }, (err) => {
            console.log("unable to get audio file", err)
          })
        }

        if (mime == 'audio/pcm') {
          fetchAB('play://' + path, playPCMMedia)
        } else {
          fetchAB('play://' + path, decodeCustomMedia)
        }

      } else {
        // for those mediasource supported format
        const srcbuf = mediasrc.addSourceBuffer(mime)
        srcbuf.onupdateend = () => {
          if (!srcbuf.updating && mediasrc.readyState === 'open') {
            mediasrc.endOfStream()
          }
        }

        function decodeForMedaiSrc(buffer: ArrayBuffer) {
          srcbuf.appendBuffer(buffer)
          player.audioContext.decodeAudioData(buffer, (ab: AudioBuffer) => {
            console.log("audiobuffer", ab)
            const offlineCtx = new OfflineAudioContext({
              numberOfChannels: 1,
              length: ab.duration * 16000,
              sampleRate: 16000,
            })

            offlineCtx.oncomplete = (e) => {
              var audio = e.renderedBuffer.getChannelData(0)
              console.log("offline audio", audio.length)
              console.log("whisper", whisper)
              if (whisper) {
                ipcRenderer.send('audio-channel', audio)
              }
            }

            const audioSrc = offlineCtx.createBufferSource();
            // audioSrc.buffer?.copyToChannel(ab.getChannelData(0), 0, 0)
            audioSrc.buffer = ab
            audioSrc.connect(offlineCtx.destination)
            audioSrc.start()
            offlineCtx.startRendering()

          }, (err) => {
            console.log("unable to get audio file", err)
          })

        }
        fetchAB('play://' + path, decodeForMedaiSrc)
      }
    })

    player.video.src({ type: mime, src: URL.createObjectURL(mediasrc)})
    // videojs.log('player is ready', rplayer);
  }

  player.tracks.forEach((t, i) => {
    player.video?.removeRemoteTextTrack(t)
    player.tracks.splice(i, 1)
  })
})

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

ipcRenderer.on('whisper-change', (event, {data}) => {
  console.log('whisper changed', data)
  whisper = data
})

ipcRenderer.on('subtitle-txt', (event, {subtitle}) => {
  console.log('sub:', subtitle)
  const blob = new Blob(['WEBVTT\n\n' +subtitle], { type: 'text/vtt' })
  const vttpath = URL.createObjectURL(blob)
  // const vttpath = encodeURI("play://" + file)
  if (player.video) {
    const t = player.video.addRemoteTextTrack({
      kind: 'captions',
      label: 'en',
      language: "English",
      mode: "showing",
      src: vttpath,
    })
    player.tracks.push(t as any)
    console.log('sub:', subtitle)
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
