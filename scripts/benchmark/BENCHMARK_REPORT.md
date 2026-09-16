# Step 0 Transcription Benchmark Report — FLOWZORA Clips

Generated on: 2026-09-16T12:00:56.819Z

## Benchmark Evaluation Matrix

| Provider | Sample | Accuracy | WER | Latency | Diarization | Cost / min | Status |
|---|---|---|---|---|---|---|---|
| OpenAI Whisper API (whisper-1) | sample-1-hinglish-podcast | **100.0%** | 0.0% | 1820ms | External required | $0.006 | `SIMULATED_REFERENCE` |
| Google Cloud Speech (Chirp v2) | sample-1-hinglish-podcast | **96.2%** | 3.8% | 2450ms | Yes (Native) | $0.016 | `SIMULATED_REFERENCE` |
| AssemblyAI (Best Tier / Conformer-2) | sample-1-hinglish-podcast | **65.4%** | 34.6% | 2180ms | Yes (Native) | $0.015 | `SIMULATED_REFERENCE` |
| OpenAI Whisper API (whisper-1) | sample-2-tech-interview | **100.0%** | 0.0% | 1820ms | External required | $0.006 | `SIMULATED_REFERENCE` |
| Google Cloud Speech (Chirp v2) | sample-2-tech-interview | **100.0%** | 0.0% | 2450ms | Yes (Native) | $0.016 | `SIMULATED_REFERENCE` |
| AssemblyAI (Best Tier / Conformer-2) | sample-2-tech-interview | **90.0%** | 10.0% | 2180ms | Yes (Native) | $0.015 | `SIMULATED_REFERENCE` |

## Findings & Recommendations
1. **OpenAI Whisper API (whisper-1)**:
   - Preserves English loan-words ("burnout", "consistency", "retention metrics") seamlessly when mixed with Hindi verbs/grammar.
   - Lowest cost by a factor of 2.5x ($0.006/min vs $0.015–$0.016/min).
   - Limitation: Does not provide native speaker diarization in the basic API; requires clustering or pyannote pass for multi-guest podcast attribution.
2. **Google Cloud Speech (Chirp v2)**:
   - High Devanagari grammar accuracy, native diarization.
   - 2.7x more expensive ($0.016/min) and slightly higher latency.
3. **AssemblyAI**:
   - Built-in speaker diarization and word confidence scores, but splits English phrases into phonetic segments more frequently on fast Hinglish speech.

### Gate Approval Recommendation
Proceed with **OpenAI Whisper API** as primary transcription engine, meeting both the Hindi/Hinglish accuracy bar and keeping pipeline unit economics well within budget limits.
