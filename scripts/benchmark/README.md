# Step 0 — Hindi/Hinglish Transcription Benchmark

This directory contains the benchmarking harness required before building the production transcription→scoring pipeline.

## Purpose
Code-switched Hindi-English speech typically sees a 30–50% relative Word Error Rate (WER) increase compared to monolingual speech. This benchmark evaluates:
1. **OpenAI Whisper API** (`whisper-1`)
2. **Google Cloud Speech** (`Chirp v2`)
3. **AssemblyAI** (`Conformer-2`)

## How to Run

1. Place your 2–3 audio test clips (WAV or MP3, ~1–2 minutes each) in `scripts/benchmark/samples/`.
2. Add your provider API keys to `.env`:
   ```env
   OPENAI_API_KEY=sk-...
   ASSEMBLYAI_API_KEY=...
   GOOGLE_APPLICATION_CREDENTIALS=...
   ```
3. Run the benchmark:
   ```bash
   node scripts/benchmark/benchmark-runner.mjs
   ```
4. Check the generated `BENCHMARK_REPORT.md` for WER, accuracy, latency, and recommendations.
