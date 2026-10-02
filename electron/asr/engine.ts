import { join } from 'node:path'
import * as ort from 'onnxruntime-node'
import llama from 'llama-tokenizer-js'
import { env, pipeline } from '@huggingface/transformers'

const SAMPLE_RATE = 16000
// Moonshine tiny decoder geometry: 6 layers, 8 KV heads, head dim 36
const LAYERS = 6
const KV_HEADS = 8
const HEAD_DIM = 36
const BOS = 1
const EOS = 2

export type Segment = { start: number; end: number }
export type Hypothesis = {
  text: string
  meanProb: number
  repeatRatio: number
  wordsPerSec: number
  latinRatio: number
}

let encoder: any = null
let decoder: any = null
let translator: any = null

export async function load(modelDir: string, cacheDir: string) {
  const options = { executionProviders: ['cpu'] }
  const moonshine = join(modelDir, 'moonshine-tiny')
  encoder = await ort.InferenceSession.create(join(moonshine, 'encoder_model_quantized.onnx'), options)
  decoder = await ort.InferenceSession.create(join(moonshine, 'decoder_model_merged_quantized.onnx'), options)

  env.allowRemoteModels = false
  env.allowLocalModels = true
  env.localModelPath = join(modelDir, 'mt')
  env.cacheDir = cacheDir
  translator = await pipeline('translation', 'onnx-community/opus-mt-en-zh', { dtype: 'q8' })
}

// Energy VAD: silence runs close a segment, short segments merge into the next one instead of
// being dropped, and anything past maxSec is cut at its lowest-energy window.
export function segment(samples: Float32Array, sampleRate: number, opt: {
  winMs?: number; silMs?: number; maxSec?: number; pad?: number; minSec?: number; mergeGapMs?: number
} = {}): Segment[] {
  const winMs = opt.winMs ?? 60
  const silMs = opt.silMs ?? 350
  const maxSec = opt.maxSec ?? 10
  const pad = opt.pad ?? 0.12
  const W = Math.floor((sampleRate * winMs) / 1000)
  const SW = Math.round(silMs / winMs)

  const rms: number[] = []
  for (let i = 0; i + W <= samples.length; i += W) {
    let s = 0
    for (let j = 0; j < W; j++) s += samples[i + j] * samples[i + j]
    rms.push(Math.sqrt(s / W))
  }
  const sorted = [...rms].sort((a, b) => a - b)
  const floor = sorted[Math.floor(sorted.length * 0.2)] || 1e-6
  const threshold = Math.max(floor * 3, 0.004)
  const voiced = rms.map((v) => v > threshold)

  const raw: number[][] = []
  let start = -1
  let silent = 0
  for (let i = 0; i < voiced.length; i++) {
    if (voiced[i]) {
      if (start < 0) start = i
      silent = 0
    } else if (start >= 0) {
      silent++
      if (silent >= SW) {
        raw.push([start, i - silent + 1])
        start = -1
        silent = 0
      }
    }
  }
  if (start >= 0) raw.push([start, voiced.length])

  const minW = Math.round(((opt.minSec ?? 1.2) * 1000) / winMs)
  const gapW = Math.round((opt.mergeGapMs ?? 900) / winMs)
  const merged: number[][] = []
  for (const [s, e] of raw) {
    const prev = merged[merged.length - 1]
    if (prev && (e - s < minW || s - prev[1] <= gapW)) prev[1] = e
    else merged.push([s, e])
  }

  const maxW = Math.round((maxSec * 1000) / winMs)
  const out: number[][] = []
  const cut = (s: number, e: number) => {
    if (e - s <= maxW) {
      out.push([s, e])
      return
    }
    const limit = s + maxW
    let best = limit
    let lowest = Infinity
    for (let i = limit - Math.round(maxW / 2); i <= limit; i++) {
      if (rms[i] < lowest) {
        lowest = rms[i]
        best = i
      }
    }
    cut(s, best)
    cut(best, e)
  }
  merged.forEach(([s, e]) => cut(s, e))

  const duration = samples.length / sampleRate
  return out.map(([s, e]) => ({
    start: Math.max(0, +(s * (winMs / 1000) - pad).toFixed(2)),
    end: +Math.min(e * (winMs / 1000) + pad, duration).toFixed(2),
  }))
}

const argMax = (values: Float32Array) => {
  let best = 0
  for (let i = 1; i < values.length; i++) if (values[i] > values[best]) best = i
  return best
}

// Probability of the argmax token: 1 / sum(exp(logit - max)); exp(max) itself overflows.
const topProb = (values: Float32Array) => {
  let max = -Infinity
  for (const v of values) if (v > max) max = v
  let sum = 0
  for (const v of values) sum += Math.exp(v - max)
  return 1 / sum
}

const repeatRatio = (tokens: number[]) => {
  const seen = new Set<string>()
  let dup = 0
  let total = 0
  for (let i = 0; i + 3 <= tokens.length; i++) {
    const gram = tokens.slice(i, i + 3).join(',')
    total++
    if (seen.has(gram)) dup++
    else seen.add(gram)
  }
  return total > 0 ? dup / total : 0
}

const latinRatio = (text: string) => {
  const chars = text.replace(/\s/g, '').length
  return chars > 0 ? text.replace(/[^A-Za-z]/g, '').length / chars : 0
}

export async function transcribe(samples: Float32Array): Promise<Hypothesis> {
  const features = await encoder.run({
    input_values: new ort.Tensor('float32', samples, [1, samples.length]),
  })

  let past: Record<string, any> = {}
  for (let l = 0; l < LAYERS; l++) {
    for (const branch of ['decoder', 'encoder']) {
      for (const kv of ['key', 'value']) {
        past[`past_key_values.${l}.${branch}.${kv}`] = new ort.Tensor(
          'float32',
          new Float32Array([]),
          [0, KV_HEADS, 1, HEAD_DIM]
        )
      }
    }
  }

  const tokens: number[] = [BOS]
  let current = BOS
  let probSum = 0
  let ended = false
  // Moonshine generates at most ~6 tokens per second of audio
  for (let step = 0; step < Math.trunc((samples.length / SAMPLE_RATE) * 6); step++) {
    const out = await decoder.run({
      input_ids: new ort.Tensor('int64', BigInt64Array.from([BigInt(current)]), [1, 1]),
      encoder_hidden_states: features.last_hidden_state,
      use_cache_branch: new ort.Tensor('bool', [step > 0]),
      ...past,
    })
    if (step > 0) probSum += topProb(out.logits.data)
    const present = Object.entries(out)
      .filter(([k]) => k.includes('present'))
      .map(([, v]) => v)
    Object.keys(past).forEach((k, i) => {
      if (step === 0 || k.includes('decoder')) past[k] = present[i]
    })
    current = argMax(out.logits.data)
    tokens.push(current)
    if (current === EOS) {
      ended = true
      break
    }
  }

  const text = String(llama.decode(ended ? tokens.slice(0, -1) : tokens)).trim()
  const steps = tokens.length - 1
  return {
    text,
    meanProb: probSum / Math.max(1, steps - 1),
    repeatRatio: repeatRatio(tokens),
    wordsPerSec: ((text.match(/[A-Za-z]+/g) || []).length * SAMPLE_RATE) / samples.length,
    latinRatio: latinRatio(text),
  }
}

// Moonshine is English-only and hallucinates on other languages, so a cue only becomes a
// subtitle when the hypothesis looks like real English speech. Thresholds come from running
// this engine over English and Chinese samples: genuine cues kept meanProb >= 0.67 with no
// repetition, while hallucinations either lost confidence, looped a phrase, or ran past 4 words/s.
export function isEnglish(h: Hypothesis) {
  if (h.text === '' || h.latinRatio < 0.6) return false
  if (h.meanProb >= 0.72) return true
  return h.meanProb >= 0.65 && h.repeatRatio <= 0.15 && h.wordsPerSec <= 3.6
}

export async function translate(en: string): Promise<string> {
  const out = await translator(en, { src_lang: 'en', tgt_lang: 'zh' })
  return out[0].translation_text
}
