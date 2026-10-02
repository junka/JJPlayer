import ReactDOM from 'react-dom/client'
import App from './App'
import videojs from 'video.js'
import * as fs from 'node:fs'
import { ipcRenderer } from "electron"
import {SharedBufferWorkletNode} from './audioworker-node'
// import {Wavesurfer} from 'videojs-wavesurfer/dist/videojs.wavesurfer'

declare type Player = ReturnType<typeof videojs>

let asrOn = true

let subtitlevtt : string = 'WEBVTT\n\n'

let autotrack: any = null
let lastplayfile: any = null

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
  mediasrc : null,
  audioContext : new AudioContext(),
  // sbwn: null
}

const onPlayerReady = (rplayer: Player) => {
  player.video = rplayer
  console.log("player is ready")

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
  if (lastplayfile !== path) {
    subtitlevtt = 'WEBVTT\n\n'
    lastplayfile = path
  }
  console.log('file selected', mime, MediaSource.isTypeSupported(mime))
  if (player.video) {
    const mediasrc = new MediaSource()
    player.mediasrc = mediasrc

    mediasrc.addEventListener('sourceopen', (evt) => {
      console.log("source open", evt)
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
              if (asrOn) {
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

        if (mime === 'audio/pcm') {
          fetchAB('play://' + path, playPCMMedia)
        } else {
          fetchAB('play://' + path, decodeCustomMedia)
        }

      } else {
        console.log("supported for ", mime)
        // for those mediasource supported format
        const srcbuf = mediasrc.addSourceBuffer(mime)
        srcbuf.onupdateend = () => {
          console.log("update end")
          if (!srcbuf.updating && mediasrc.readyState === 'open') {
            mediasrc.endOfStream()
          }
        }

        function decodeForMediaSrc(buffer: ArrayBuffer) {
          console.log("decode for media source")

          

          srcbuf.appendBuffer(buffer)
          console.log("after append")

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
              console.log("asrOn", asrOn)
              if (asrOn) {
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
        fetchAB('play://' + path, decodeForMediaSrc)
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
