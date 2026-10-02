import { app, utilityProcess, type UtilityProcess } from 'electron'
import { existsSync } from 'node:fs'
import { join, sep } from 'node:path'
import { win } from '../main'

let worker: UtilityProcess | null = null
let enabled = true

// Models, the ort-wasm binaries and the worker entry are asarUnpack'ed, so read them from the
// unpacked tree when running from a packaged app.
const unpack = (p: string) => {
  const q = p.replace(`app.asar${sep}`, `app.asar.unpacked${sep}`)
  return existsSync(q) ? q : p
}

const timestamp = (seconds: number) => {
  const ms = Math.max(0, Math.round(seconds * 1000))
  const pad = (n: number, width = 2) => String(n).padStart(width, '0')
  return [
    `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}`,
    pad(ms % 1000, 3),
  ].join('.')
}

function onMessage(message: any) {
  if (message.type === 'cue') {
    win?.webContents.send('subtitle-txt', {
      subtitle: `${timestamp(message.start)} --> ${timestamp(message.end)}\n- ${message.en}\n- ${message.zh}`,
    })
  } else if (message.type === 'rejected') {
    console.log(`[asr] gate dropped ${message.start}-${message.end}s (prob ${message.meanProb}): ${message.text.slice(0, 60)}`)
  } else {
    console.log('[asr]', JSON.stringify(message).slice(0, 300))
  }
}

export function asrStart() {
  if (worker) return
  worker = utilityProcess.fork(unpack(join(__dirname, 'worker.js')), [], { stdio: 'pipe' })
  worker.on('message', onMessage)
  worker.stderr?.on('data', (data) => console.log('[asr]', String(data).trim()))
  worker.on('exit', (code) => {
    console.log('[asr] worker exited with', code)
    worker = null
  })
  worker.postMessage({
    type: 'load',
    modelDir: unpack(join(process.env.PUBLIC, 'models')),
    cacheDir: join(app.getPath('userData'), 'asr'),
  })
}

export function asrStop() {
  worker?.kill()
  worker = null
}

export function asrToggle() {
  enabled = !enabled
  if (enabled) asrStart()
  else asrStop()
  return enabled
}

export function asrTranscribe(samples: Float32Array, sampleRate = 16000) {
  if (!enabled) return
  if (!worker) asrStart()
  worker?.postMessage({ type: 'run', samples, sampleRate })
}
