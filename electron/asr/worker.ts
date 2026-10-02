import { load, segment, transcribe, translate, isEnglish } from './engine'

type Run = { type: 'run'; samples: Float32Array; sampleRate: number }

const port = process.parentPort
const send = (message: Record<string, any>) => port.postMessage(message)

let loaded = false
let running = false
const queue: Run[] = []

async function run(job: Run) {
  const started = Date.now()
  const segments = segment(job.samples, job.sampleRate)
  let cues = 0
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]
    const slice = new Float32Array(
      job.samples.subarray(Math.floor(s.start * job.sampleRate), Math.floor(s.end * job.sampleRate))
    )
    const hyp = await transcribe(slice)
    if (!isEnglish(hyp)) {
      send({ type: 'rejected', start: s.start, end: s.end, text: hyp.text, meanProb: +hyp.meanProb.toFixed(3) })
      continue
    }
    const zh = await translate(hyp.text)
    cues++
    send({ type: 'cue', start: s.start, end: s.end, en: hyp.text, zh })
  }
  send({ type: 'done', total: segments.length, cues, ms: Date.now() - started })
}

async function drain() {
  if (running || !loaded) return
  const job = queue.shift()
  if (!job) return
  running = true
  try {
    await run(job)
  } catch (e) {
    send({ type: 'error', text: String((e as any)?.stack ?? e).slice(0, 500) })
  }
  running = false
  drain()
}

port.on('message', (event) => {
  const message = event.data as Record<string, any>
  if (message.type === 'load') {
    load(message.modelDir, message.cacheDir)
      .then(() => {
        loaded = true
        send({ type: 'ready', node: process.versions.node })
        drain()
      })
      .catch((e) => send({ type: 'error', text: 'load failed: ' + String((e as any)?.stack ?? e).slice(0, 500) }))
  } else if (message.type === 'run') {
    queue.push(message as Run)
    drain()
  } else if (message.type === 'quit') {
    process.exit(0)
  }
})
