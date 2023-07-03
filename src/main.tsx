import ReactDOM from 'react-dom/client'
import App from './App'
import videojs from 'video.js'
import { ipcRenderer } from "electron"
import * as fs from 'node:fs'
import muxjs from 'mux.js'

declare type Player = ReturnType<typeof videojs>


window.HELP_IMPROVE_VIDEOJS = false

interface playConfig {
  video: Player | null;
  tracks: HTMLTrackElement[];
  progressv: number
}

const usefile = "/Users/admin/proj/github/mmp/mpp/oceans.mp4"
const videoOptions = {
    html5: { nativeAudioTracks: false },
    responsive: true,
    fill: false,
    controls: true,
    autoplay: true,
    preload: 'auto',
    liveui: true,
    playbackRates: [0.5, 1, 1.5, 2, 3, 4],
  sources: [{ "src": 'play://' + usefile }],
}

let player: playConfig = {
  video : null,
  tracks : [],
  progressv : -1,
}


const handlePlayerReady = (rplayer: Player) => {
  player.video = rplayer
  videojs.log('player is ready');

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
  })

  rplayer.on('pause', () => {
    console.log('pause a video')
    ipcRenderer.send("play-status", 0)
  })
}

const accelerations = ["prefer-hardware", "prefer-software"];

// video = document.getElementById('')

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


function handleFrame(frame: VideoFrame) {
  readyFrames.push(frame);
  if (underflow) {
    underflow = false;
    setTimeout(renderFrame, 0);
  }
}

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
// const decoder = new VideoDecoder({
//   output: handleFrame,
//   error: (e) => {
//     console.log(e.message);
//   },
// });{}''
// decoder.configure(config);

// decoder.decode()

var transmuxer = new muxjs.mp4.Transmuxer();

// navigator.mediaDevices.getUserMedia({audio: false, video: false})

const audioContext = new AudioContext();
// const audioBuffer = audioContext.createBufferSource()
// audioBuffer.connect(audioContext.destination)
// const audioSrc = audioContext.createMediaElementSource(video)

const offlineCtx = new OfflineAudioContext(2, 44100 * 40, 44100);

// const audioBuffer = offlineCtx.createBufferSource();

offlineCtx.addEventListener("complete", (e) => {
  const song = new AudioBufferSourceNode(audioContext, { buffer: e.renderedBuffer })
  song.connect(audioContext.destination)
  song.start()
  console.log("offline audio render complete", song)
})

function getOfflineAudio(decodebuffer: AudioBuffer) {
  const audioBuffer = new AudioBufferSourceNode(offlineCtx, {
    buffer: decodebuffer,
  });
  audioBuffer.connect(offlineCtx.destination)
  audioBuffer.start()
  offlineCtx.startRendering()
}


// const audioSource = audioContext.createMediaStreamSource(stream);

// volume control
// const audioGain = audioContext.createGain();
// audioSource.connect(audioGain)
// audioGain.connect(audioContext.destination)

// for mp2t to mp4
transmuxer.on('done', () => {
  console.log("transmux done")
})

transmuxer.on('data', (segment: any) => {
  console.log("data fragment mp4 ready", segment)
  let data = new Uint8Array(segment.initSegment.byteLenth + segment.data.byteLenth)
  data.set(segment.initSegment, 0)
})

ipcRenderer.on('play-action', (event, action) => {
    if (action === 1) {
      player.video?.play()
    } else {
      player.video?.pause()
    }
})


const mediasrc = new MediaSource()
// video?.src = URL.createObjectURL(mediasrc)

mediasrc.addEventListener('error', (e) => {
  console.log("media source error", e)
})

function getMimeCodec(type: string, bytes: Buffer) {
  var probed;
  var parse;
  if (type === 'mp4') {
    probed = muxjs.mp4.probe.tracks(bytes)
    parse = muxjs.mp4.tools.inspect(bytes)
  } else {
    probed = muxjs.mp2t
    console.log(probed)
    parse = muxjs.mp2t.tools.inspect(bytes)
    console.log(parse)
  }
  var isFragmented = false
  for (var i = 0; i < parse.length; i++) {
    if (parse[i].type === 'moof') {
      isFragmented = true
      break
    }
  }
  for (var i = 0; i < probed.length; i++) {
    if (probed[i].type === 'video') {
      checkSupportedCodec(probed[i].codec)
    }
  }
  const mimeCodec = "video/" + type + "; codecs=" + probed.map((t: any) => t.codec).join(",");
  // const moofBoxIndex = bytes.indexOf('moof');
  // const isFragmented = moofBoxIndex !== -1;
  return { mimeCodec, isFragmented }
}

mediasrc.addEventListener('sourceopen', (evt) => {
  const bytes = fs.readFileSync(usefile)
  console.log("source open", evt)
  const { mimeCodec, isFragmented } = getMimeCodec('mp4', bytes)
  // const mimeCodec = 'video/mp4; codecs="avc1.64001f,mp4a.40.2"';
  // const isFragmented = false
  console.log(mimeCodec)
  if (!MediaSource.isTypeSupported(mimeCodec)) {
    console.log("not support for ", mimeCodec)
    throw new Error("MSE does not support: " + mimeCodec);
  }

  const srcbuf = mediasrc.addSourceBuffer(mimeCodec)

  srcbuf.addEventListener('error', (e) => {
    console.log('source buffer err', e)
  })

  srcbuf.addEventListener('updateend', () => {
    console.log("update end: media src ready state", srcbuf.updating, mediasrc.readyState);
    if (!srcbuf.updating && mediasrc.readyState === 'open') {
      mediasrc.endOfStream()
    }
  })

  srcbuf.addEventListener('update', (e: any) => {
    console.log("update", e)
  })

  // signal when a new Fmp4 segment is ready
  // transmuxer.on('data', (segment: any) => {
  //   console.log("data fragment mp4 ready", segment)
  //   let data = new Uint8Array(segment.initSegment.byteLenth + segment.data.byteLenth)
  //   data.set(segment.initSegment, 0)
  //   data.set(segment.data, segment.initSegment.byteLenth)
  //   // console.log(muxjs.mp4.tools.inspect(data));
  //   srcbuf.appendBuffer(data)
  // })

  fetchAB('play://' + usefile, (buffer: ArrayBuffer) => {
    if (isFragmented === true) {
      srcbuf.appendBuffer(buffer)
      audioContext.decodeAudioData(buffer, getOfflineAudio)
    } else {
      console.log("push to transmux", buffer)
      // transmuxer.push(new Uint8Array(buffer))
      // transmuxer.flush()
      audioContext.decodeAudioData(buffer,
        (buf) => {
          const max = Math.floor(buf.duration)
        },
        (err) => {
          console.log("unable to get audio file", err)
        })

    }
  })
})

mediasrc.addEventListener('sourceended', () => {
  console.log("source ended", mediasrc.readyState)
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

ipcRenderer.on('file-selected', (event, { path }) => {
  const playpath = "play://" + path
  if (player.video) {
    URL.revokeObjectURL(player.video.src({ src: playpath, type: 'video/mp4' }) as string)
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

window.addEventListener('contextmenu', () => {
  ipcRenderer.invoke('show-context-menu')
})



ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <div>
    <App options={videoOptions} onReady={handlePlayerReady}/>
  </div>
)


postMessage({ payload: 'removeLoading' }, '*')
