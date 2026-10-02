#!/usr/bin/env bash

# Auto-subtitle models, fetched into public/models/ (gitignored).
# Paths must match what electron/asr/engine.ts loads.
set -euo pipefail

HF=${HF_ENDPOINT:-https://huggingface.co}
OUT=public/models

get() { # get <repo> <file> <dest>
  local repo=$1 file=$2 dest=$3
  if [ ! -s "$dest" ]; then
    mkdir -p "$(dirname "$dest")"
    echo "fetch $repo/$file"
    curl -fL --retry 3 -o "$dest" "$HF/$repo/resolve/main/$file"
  fi
}

get onnx-community/moonshine-tiny-ONNX onnx/encoder_model_quantized.onnx \
  "$OUT/moonshine-tiny/encoder_model_quantized.onnx"
get onnx-community/moonshine-tiny-ONNX onnx/decoder_model_merged_quantized.onnx \
  "$OUT/moonshine-tiny/decoder_model_merged_quantized.onnx"

MT=$OUT/mt/onnx-community/opus-mt-en-zh
get onnx-community/opus-mt-en-zh config.json "$MT/config.json"
get onnx-community/opus-mt-en-zh generation_config.json "$MT/generation_config.json"
get onnx-community/opus-mt-en-zh tokenizer.json "$MT/tokenizer.json"
get onnx-community/opus-mt-en-zh tokenizer_config.json "$MT/tokenizer_config.json"
get onnx-community/opus-mt-en-zh onnx/encoder_model_quantized.onnx "$MT/onnx/encoder_model_quantized.onnx"
get onnx-community/opus-mt-en-zh onnx/decoder_model_merged_quantized.onnx "$MT/onnx/decoder_model_merged_quantized.onnx"

du -sh "$OUT"
