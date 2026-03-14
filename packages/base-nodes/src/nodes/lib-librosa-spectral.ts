import { BaseNode, prop } from "@nodetool/node-sdk";
import FFT from "fft.js";

// ── WAV helpers ───────────────────────────────────────────────────

interface WavData {
  samples: Float32Array;
  sampleRate: number;
  numChannels: number;
}

function decodeWav(audio: Record<string, unknown>): WavData {
  let rawData: Uint8Array;
  if (typeof audio.data === "string") {
    rawData = Uint8Array.from(Buffer.from(audio.data, "base64"));
  } else if (audio.data instanceof Uint8Array) {
    rawData = audio.data;
  } else {
    throw new Error("Invalid audio data");
  }

  const buf = Buffer.from(rawData);
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.length < 44) {
    throw new Error("Invalid WAV file");
  }

  const sampleRate = buf.readUInt32LE(24);
  const bitsPerSample = buf.readUInt16LE(34);
  const numChannels = buf.readUInt16LE(22);

  let dataOffset = 36;
  while (dataOffset < buf.length - 8) {
    const chunkId = buf.toString("ascii", dataOffset, dataOffset + 4);
    const chunkSize = buf.readUInt32LE(dataOffset + 4);
    if (chunkId === "data") {
      dataOffset += 8;
      break;
    }
    dataOffset += 8 + chunkSize;
  }

  const bytesPerSample = bitsPerSample / 8;
  const totalSamples = Math.floor((buf.length - dataOffset) / bytesPerSample);
  const samples = new Float32Array(totalSamples);

  for (let i = 0; i < totalSamples; i++) {
    const pos = dataOffset + i * bytesPerSample;
    if (bitsPerSample === 16) {
      samples[i] = buf.readInt16LE(pos) / 0x7fff;
    } else if (bitsPerSample === 8) {
      samples[i] = (buf.readUInt8(pos) - 128) / 128;
    }
  }

  return { samples, sampleRate, numChannels };
}

function getMonoSamples(wav: WavData): Float32Array {
  if (wav.numChannels === 1) return wav.samples;
  const frames = Math.floor(wav.samples.length / wav.numChannels);
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let ch = 0; ch < wav.numChannels; ch++) {
      sum += wav.samples[i * wav.numChannels + ch];
    }
    mono[i] = sum / wav.numChannels;
  }
  return mono;
}

function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(s * 0x7fff), 44 + i * 2);
  }
  return new Uint8Array(buffer);
}

function audioRefFromWav(wav: Uint8Array): Record<string, unknown> {
  return { uri: "", data: Buffer.from(wav).toString("base64") };
}

// ── DSP helpers ───────────────────────────────────────────────────

function hanningWindow(n: number, N: number): number {
  return 0.5 * (1 - Math.cos((2 * Math.PI * n) / (N - 1)));
}

function computeSTFT(
  signal: Float32Array,
  nFft: number,
  hopLength: number
): number[][] {
  const fft = new FFT(nFft);
  const numBins = nFft / 2 + 1;
  const frames: number[][] = [];

  for (let i = 0; i + nFft <= signal.length; i += hopLength) {
    const input = fft.createComplexArray();
    for (let j = 0; j < nFft; j++) {
      input[j * 2] = signal[i + j] * hanningWindow(j, nFft);
      input[j * 2 + 1] = 0;
    }
    const output = fft.createComplexArray();
    fft.transform(output, input);

    // Compute magnitude for each frequency bin
    const magnitudes = new Array(numBins);
    for (let k = 0; k < numBins; k++) {
      const re = output[k * 2];
      const im = output[k * 2 + 1];
      magnitudes[k] = Math.sqrt(re * re + im * im);
    }
    frames.push(magnitudes);
  }

  return frames;
}

function computePowerSpectrogram(stftFrames: number[][]): number[][] {
  return stftFrames.map((frame) => frame.map((x) => x * x));
}

function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}

function melToHz(mel: number): number {
  return 700 * (Math.pow(10, mel / 2595) - 1);
}

function melFilterbank(
  nMels: number,
  nFft: number,
  sampleRate: number,
  fmin: number,
  fmax: number
): number[][] {
  const numBins = nFft / 2 + 1;
  const melMin = hzToMel(fmin);
  const melMax = hzToMel(fmax);
  const melPoints = new Array(nMels + 2);
  for (let i = 0; i < nMels + 2; i++) {
    melPoints[i] = melToHz(melMin + ((melMax - melMin) * i) / (nMels + 1));
  }

  const binFreqs = melPoints.map(
    (hz) => Math.floor(((nFft + 1) * hz) / sampleRate)
  );

  const filterbank: number[][] = [];
  for (let m = 0; m < nMels; m++) {
    const row = new Array(numBins).fill(0);
    const fStart = binFreqs[m];
    const fCenter = binFreqs[m + 1];
    const fEnd = binFreqs[m + 2];

    for (let k = fStart; k < fCenter && k < numBins; k++) {
      row[k] = (k - fStart) / (fCenter - fStart || 1);
    }
    for (let k = fCenter; k <= fEnd && k < numBins; k++) {
      row[k] = (fEnd - k) / (fEnd - fCenter || 1);
    }
    filterbank.push(row);
  }

  return filterbank;
}

function applyMelFilterbank(
  powerSpec: number[][],
  filterbank: number[][]
): number[][] {
  const nMels = filterbank.length;
  return powerSpec.map((frame) => {
    const melFrame = new Array(nMels);
    for (let m = 0; m < nMels; m++) {
      let sum = 0;
      for (let k = 0; k < frame.length; k++) {
        sum += frame[k] * filterbank[m][k];
      }
      melFrame[m] = sum;
    }
    return melFrame;
  });
}

function dct2(input: number[], nOut: number): number[] {
  const N = input.length;
  const result = new Array(nOut);
  for (let k = 0; k < nOut; k++) {
    let sum = 0;
    for (let n = 0; n < N; n++) {
      sum += input[n] * Math.cos((Math.PI * k * (2 * n + 1)) / (2 * N));
    }
    result[k] = sum;
  }
  return result;
}

// ── STFT Node ─────────────────────────────────────────────────────

export class STFTNode extends BaseNode {
  static readonly nodeType = "lib.librosa.analysis.STFT";
            static readonly title = "STFT";
            static readonly description = "This node computes the Short-Time Fourier Transform (STFT) matrix for an audio signal. The STFT matrix represents the signal in both time and frequency domains, forming the foundation for many audio processing tasks.\n    audio, analysis, fourier, frequency, time\n    #### Applications\n    - Audio Analysis: By transforming the audio signal into a visualizable format, it helps in understanding and analyzing the audio signal.\n    - Sound Processing: It plays a key foundational role in sound effects, tuning, compression, and more.\n    - Audio Feature Extraction: It can be used to analyze frequency-based features for sound classification.\n    - Music Information Retrieval: It helps in music transcription, rhythm and tempo analysis.";
        static readonly metadataOutputTypes = {
    output: "np_array"
  };
          static readonly basicFields = [
  "audio",
  "n_fft",
  "hop_length"
];
  
  @prop({ type: "audio", default: {
  "type": "audio",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Audio", description: "The audio file to compute the STFT matrix from." })
  declare audio: any;

  @prop({ type: "int", default: 2048, title: "N Fft", description: "The number of samples per frame.", min: 0 })
  declare n_fft: any;

  @prop({ type: "int", default: 512, title: "Hop Length", description: "The number of samples between frames.", min: 0 })
  declare hop_length: any;

  @prop({ type: "int", default: null, title: "Win Length", description: "The window length. If None, it defaults to n_fft." })
  declare win_length: any;

  @prop({ type: "str", default: "hann", title: "Window", description: "The type of window to use." })
  declare window: any;

  @prop({ type: "bool", default: true, title: "Center", description: "If True, input signal is padded so that frame D[:, t] is centered at y[t * hop_length]." })
  declare center: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const audio = (inputs.audio ?? this.audio ?? {}) as Record<
      string,
      unknown
    >;
    const nFft = Number(inputs.n_fft ?? this.n_fft ?? 2048);
    const hopLength = Number(inputs.hop_length ?? this.hop_length ?? 512);

    if (!audio.data) return { output: { data: [] } };

    const wav = decodeWav(audio);
    const mono = getMonoSamples(wav);
    const stft = computeSTFT(mono, nFft, hopLength);

    // Transpose: stft is [frames][bins] -> output as [bins][frames] like librosa
    const numBins = stft[0]?.length ?? 0;
    const numFrames = stft.length;
    const transposed: number[][] = [];
    for (let b = 0; b < numBins; b++) {
      const row = new Array(numFrames);
      for (let f = 0; f < numFrames; f++) {
        row[f] = stft[f][b];
      }
      transposed.push(row);
    }

    return { output: { data: transposed } };
  }
}

// ── Mel Spectrogram Node ──────────────────────────────────────────

export class MelSpectrogramNode extends BaseNode {
  static readonly nodeType = "lib.librosa.analysis.MelSpectrogram";
            static readonly title = "Mel Spectrogram";
            static readonly description = "MelSpecNode computes the Mel-frequency spectrogram for an audio signal.\n    audio, analysis, spectrogram\n\n    Useful for:\n    - Audio feature extraction for machine learning\n    - Speech and music analysis tasks";
        static readonly metadataOutputTypes = {
    output: "np_array"
  };
          static readonly basicFields = [
  "audio",
  "n_mels",
  "fmax"
];
  
  @prop({ type: "audio", default: {
  "type": "audio",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Audio", description: "The audio file to convert to a tensor." })
  declare audio: any;

  @prop({ type: "int", default: 2048, title: "N Fft", description: "The number of samples per frame.", min: 0 })
  declare n_fft: any;

  @prop({ type: "int", default: 512, title: "Hop Length", description: "The number of samples between frames.", min: 0 })
  declare hop_length: any;

  @prop({ type: "int", default: 128, title: "N Mels", description: "The number of Mel bands to generate.", min: 0 })
  declare n_mels: any;

  @prop({ type: "int", default: 0, title: "Fmin", description: "The lowest frequency (in Hz).", min: 0 })
  declare fmin: any;

  @prop({ type: "int", default: 8000, title: "Fmax", description: "The highest frequency (in Hz).", min: 0 })
  declare fmax: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const audio = (inputs.audio ?? this.audio ?? {}) as Record<
      string,
      unknown
    >;
    const nFft = Number(inputs.n_fft ?? this.n_fft ?? 2048);
    const hopLength = Number(inputs.hop_length ?? this.hop_length ?? 512);
    const nMels = Number(inputs.n_mels ?? this.n_mels ?? 128);
    const fmin = Number(inputs.fmin ?? this.fmin ?? 0);
    const fmax = Number(inputs.fmax ?? this.fmax ?? 8000);

    if (!audio.data) return { output: { data: [] } };

    const wav = decodeWav(audio);
    const mono = getMonoSamples(wav);
    const stft = computeSTFT(mono, nFft, hopLength);
    const powerSpec = computePowerSpectrogram(stft);
    const fb = melFilterbank(nMels, nFft, wav.sampleRate, fmin, fmax);
    const melSpec = applyMelFilterbank(powerSpec, fb);

    // Transpose: [frames][mels] -> [mels][frames]
    const numFrames = melSpec.length;
    const transposed: number[][] = [];
    for (let m = 0; m < nMels; m++) {
      const row = new Array(numFrames);
      for (let f = 0; f < numFrames; f++) {
        row[f] = melSpec[f][m];
      }
      transposed.push(row);
    }

    return { output: { data: transposed } };
  }
}

// ── MFCC Node ─────────────────────────────────────────────────────

export class MFCCNode extends BaseNode {
  static readonly nodeType = "lib.librosa.analysis.MFCC";
            static readonly title = "MFCC";
            static readonly description = "MFCC Node computes the Mel-frequency cepstral coefficients (MFCCs) from an audio signal.\n    audio, analysis, frequency, MFCC, MEL";
        static readonly metadataOutputTypes = {
    output: "np_array"
  };
          static readonly basicFields = [
  "audio",
  "n_mfcc",
  "n_fft"
];
  
  @prop({ type: "audio", default: {
  "type": "audio",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Audio", description: "The audio file to extract MFCCs from." })
  declare audio: any;

  @prop({ type: "int", default: 13, title: "N Mfcc", description: "The number of MFCCs to extract.", min: 0 })
  declare n_mfcc: any;

  @prop({ type: "int", default: 2048, title: "N Fft", description: "The number of samples per frame.", min: 0 })
  declare n_fft: any;

  @prop({ type: "int", default: 512, title: "Hop Length", description: "The number of samples between frames.", min: 0 })
  declare hop_length: any;

  @prop({ type: "int", default: 0, title: "Fmin", description: "The lowest frequency (in Hz).", min: 0 })
  declare fmin: any;

  @prop({ type: "int", default: 8000, title: "Fmax", description: "The highest frequency (in Hz).", min: 0 })
  declare fmax: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const audio = (inputs.audio ?? this.audio ?? {}) as Record<
      string,
      unknown
    >;
    const nMfcc = Number(inputs.n_mfcc ?? this.n_mfcc ?? 13);
    const nFft = Number(inputs.n_fft ?? this.n_fft ?? 2048);
    const hopLength = Number(inputs.hop_length ?? this.hop_length ?? 512);
    const fmin = Number(inputs.fmin ?? this.fmin ?? 0);
    const fmax = Number(inputs.fmax ?? this.fmax ?? 8000);
    const nMels = 128;

    if (!audio.data) return { output: { data: [] } };

    const wav = decodeWav(audio);
    const mono = getMonoSamples(wav);
    const stft = computeSTFT(mono, nFft, hopLength);
    const powerSpec = computePowerSpectrogram(stft);
    const fb = melFilterbank(nMels, nFft, wav.sampleRate, fmin, fmax);
    const melSpec = applyMelFilterbank(powerSpec, fb);

    // Log mel spectrogram and DCT
    const mfccFrames = melSpec.map((frame) => {
      const logFrame = frame.map((x) => Math.log(Math.max(x, 1e-10)));
      return dct2(logFrame, nMfcc);
    });

    // Transpose: [frames][coeffs] -> [coeffs][frames]
    const numFrames = mfccFrames.length;
    const transposed: number[][] = [];
    for (let c = 0; c < nMfcc; c++) {
      const row = new Array(numFrames);
      for (let f = 0; f < numFrames; f++) {
        row[f] = mfccFrames[f][c];
      }
      transposed.push(row);
    }

    return { output: { data: transposed } };
  }
}

// ── ChromaSTFT Node ───────────────────────────────────────────────

export class ChromaSTFTNode extends BaseNode {
  static readonly nodeType = "lib.librosa.analysis.ChromaSTFT";
            static readonly title = "Chroma STFT";
            static readonly description = "This node creates a chromagram from a waveform or power spectrogram to identify different pitch classes in an audio signal.\n    audio, analysis, chromagram, pitch\n\n    Applications:\n    - Chord recognition in music\n    - Music genre classification based on pitch content";
        static readonly metadataOutputTypes = {
    output: "np_array"
  };
  
  @prop({ type: "audio", default: {
  "type": "audio",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Audio", description: "The audio file to extract chromagram from." })
  declare audio: any;

  @prop({ type: "int", default: 2048, title: "N Fft", description: "The number of samples per frame.", min: 0 })
  declare n_fft: any;

  @prop({ type: "int", default: 512, title: "Hop Length", description: "The number of samples between frames.", min: 0 })
  declare hop_length: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const audio = (inputs.audio ?? this.audio ?? {}) as Record<
      string,
      unknown
    >;
    const nFft = Number(inputs.n_fft ?? this.n_fft ?? 2048);
    const hopLength = Number(inputs.hop_length ?? this.hop_length ?? 512);

    if (!audio.data) return { output: { data: [] } };

    const wav = decodeWav(audio);
    const mono = getMonoSamples(wav);
    const stft = computeSTFT(mono, nFft, hopLength);
    const powerSpec = computePowerSpectrogram(stft);

    const nChroma = 12;
    const numBins = nFft / 2 + 1;

    // Map each FFT bin to a chroma bin
    const chromaFrames = powerSpec.map((frame) => {
      const chroma = new Array(nChroma).fill(0);
      for (let k = 1; k < numBins; k++) {
        const freq = (k * wav.sampleRate) / nFft;
        if (freq <= 0) continue;
        // MIDI note number
        const midi = 12 * Math.log2(freq / 440) + 69;
        const chromaBin = Math.round(midi) % 12;
        const bin = ((chromaBin % 12) + 12) % 12;
        chroma[bin] += frame[k];
      }
      // Normalize
      const maxVal = Math.max(...chroma, 1e-10);
      return chroma.map((x) => x / maxVal);
    });

    // Transpose: [frames][12] -> [12][frames]
    const numFrames = chromaFrames.length;
    const transposed: number[][] = [];
    for (let c = 0; c < nChroma; c++) {
      const row = new Array(numFrames);
      for (let f = 0; f < numFrames; f++) {
        row[f] = chromaFrames[f][c];
      }
      transposed.push(row);
    }

    return { output: { data: transposed } };
  }
}

// ── Spectral Centroid Node ────────────────────────────────────────

export class SpectralCentroidNode extends BaseNode {
  static readonly nodeType = "lib.librosa.analysis.SpectralCentroid";
            static readonly title = "Spectral Centroid";
            static readonly description = "Computes the spectral centroid of an audio file.\n    audio, analysis, spectral\n\n    The spectral centroid indicates where the \"center of mass\" of the spectrum is located.\n    Perceptually, it has a connection with the impression of \"brightness\" of a sound.\n\n    Use cases:\n    - Analyze the timbral characteristics of audio\n    - Track changes in sound brightness over time\n    - Feature extraction for music genre classification\n    - Audio effect design and sound manipulation";
        static readonly metadataOutputTypes = {
    output: "np_array"
  };
  
  @prop({ type: "audio", default: {
  "type": "audio",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Audio", description: "The audio file to analyze." })
  declare audio: any;

  @prop({ type: "int", default: 2048, title: "N Fft", description: "The length of the FFT window.", min: 128, max: 8192 })
  declare n_fft: any;

  @prop({ type: "int", default: 512, title: "Hop Length", description: "Number of samples between successive frames.", min: 64, max: 2048 })
  declare hop_length: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const audio = (inputs.audio ?? this.audio ?? {}) as Record<
      string,
      unknown
    >;
    const nFft = Number(inputs.n_fft ?? this.n_fft ?? 2048);
    const hopLength = Number(inputs.hop_length ?? this.hop_length ?? 512);

    if (!audio.data) return { output: { data: [] } };

    const wav = decodeWav(audio);
    const mono = getMonoSamples(wav);
    const stft = computeSTFT(mono, nFft, hopLength);

    const numBins = nFft / 2 + 1;
    const freqs = new Array(numBins);
    for (let k = 0; k < numBins; k++) {
      freqs[k] = (k * wav.sampleRate) / nFft;
    }

    const centroids = stft.map((frame) => {
      let weightedSum = 0;
      let totalMag = 0;
      for (let k = 0; k < numBins; k++) {
        weightedSum += freqs[k] * frame[k];
        totalMag += frame[k];
      }
      return totalMag > 0 ? weightedSum / totalMag : 0;
    });

    return { output: { data: centroids } };
  }
}

// ── Spectral Contrast Node ───────────────────────────────────────

export class SpectralContrastNode extends BaseNode {
  static readonly nodeType = "lib.librosa.analysis.SpectralContrast";
            static readonly title = "Spectral Contrast";
            static readonly description = "The spectral contrast measures the difference in amplitude between the most noticeable parts (peaks) and the less noticeable parts (valleys) in a sound spectrum.\n    audio, analysis, decibel, amplitude\n\n    #### Applications\n    - Music genre classification: distinguishing between different types of music based on the color of sound.\n    - Instrument recognition: recognizing different musical instruments by the difference in their spectral contrast.\n    - Audio analysis: determining various characteristics of audio files.\n\n    Useful note: The `n_fft` and `hop_length` parameters affect the resolution of the analysis. A higher `n_fft` provides better frequency resolution but worse time resolution, and vice versa for a lower `hop_length`.";
        static readonly metadataOutputTypes = {
    output: "np_array"
  };
  
  @prop({ type: "audio", default: {
  "type": "audio",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Audio", description: "The audio file to extract spectral contrast from." })
  declare audio: any;

  @prop({ type: "int", default: 2048, title: "N Fft", description: "The number of samples per frame.", min: 0 })
  declare n_fft: any;

  @prop({ type: "int", default: 512, title: "Hop Length", description: "The number of samples between frames.", min: 0 })
  declare hop_length: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const audio = (inputs.audio ?? this.audio ?? {}) as Record<
      string,
      unknown
    >;
    const nFft = Number(inputs.n_fft ?? this.n_fft ?? 2048);
    const hopLength = Number(inputs.hop_length ?? this.hop_length ?? 512);

    if (!audio.data) return { output: { data: [] } };

    const wav = decodeWav(audio);
    const mono = getMonoSamples(wav);
    const stft = computeSTFT(mono, nFft, hopLength);

    // 7 sub-bands (6 octave bands + 1)
    const nBands = 7;
    const numBins = nFft / 2 + 1;

    // Compute band edges in Hz using octave spacing
    const fmin = 200;
    const bandEdges: number[] = [fmin];
    for (let i = 1; i <= nBands; i++) {
      bandEdges.push(Math.min(fmin * Math.pow(2, i), wav.sampleRate / 2));
    }

    const contrastFrames = stft.map((frame) => {
      const contrast = new Array(nBands);
      for (let b = 0; b < nBands; b++) {
        const lo = Math.floor((bandEdges[b] * nFft) / wav.sampleRate);
        const hi = Math.min(
          Math.floor((bandEdges[b + 1] * nFft) / wav.sampleRate),
          numBins - 1
        );
        if (hi <= lo) {
          contrast[b] = 0;
          continue;
        }
        const bandValues = frame.slice(lo, hi + 1).sort((a, b) => a - b);
        const n = bandValues.length;
        const alpha = Math.max(1, Math.floor(n * 0.2));
        const valley =
          bandValues.slice(0, alpha).reduce((a, b) => a + b, 0) / alpha;
        const peak =
          bandValues.slice(n - alpha).reduce((a, b) => a + b, 0) / alpha;
        contrast[b] =
          20 * Math.log10(Math.max(peak, 1e-10)) -
          20 * Math.log10(Math.max(valley, 1e-10));
      }
      return contrast;
    });

    // Transpose: [frames][bands] -> [bands][frames]
    const numFrames = contrastFrames.length;
    const transposed: number[][] = [];
    for (let b = 0; b < nBands; b++) {
      const row = new Array(numFrames);
      for (let f = 0; f < numFrames; f++) {
        row[f] = contrastFrames[f][b];
      }
      transposed.push(row);
    }

    return { output: { data: transposed } };
  }
}

// ── GriffinLim Node (placeholder) ─────────────────────────────────

export class GriffinLimNode extends BaseNode {
  static readonly nodeType = "lib.librosa.analysis.GriffinLim";
            static readonly title = "Griffin Lim";
            static readonly description = "GriffinLim Node performs phase reconstruction on a magnitude spectrogram utilizing the Griffin-Lim algorithm.\n    audio, synthesis, phase reconstruction\n\n    Applications:\n    - Audio synthesis from spectrograms\n    - Phase reconstruction in audio processing pipelines";
        static readonly metadataOutputTypes = {
    output: "np_array"
  };
  
  @prop({ type: "np_array", default: {
  "type": "np_array",
  "value": null,
  "dtype": "<i8",
  "shape": [
    1
  ]
}, title: "Magnitude Spectrogram", description: "Magnitude spectrogram input for phase reconstruction." })
  declare magnitude_spectrogram: any;

  @prop({ type: "int", default: 32, title: "N Iter", description: "Number of iterations for the Griffin-Lim algorithm." })
  declare n_iter: any;

  @prop({ type: "int", default: 512, title: "Hop Length", description: "Number of samples between successive frames." })
  declare hop_length: any;

  @prop({ type: "int", default: null, title: "Win Length", description: "Each frame of audio is windowed by `window()`. The window will be of length `win_length` and then padded with zeros to match `n_fft`." })
  declare win_length: any;

  @prop({ type: "str", default: "hann", title: "Window", description: "Type of window to use for Griffin-Lim transformation." })
  declare window: any;

  @prop({ type: "bool", default: true, title: "Center", description: "If True, the signal `y` is padded so that frame `D[:, t]` is centered at `y[t * hop_length]`." })
  declare center: any;

  @prop({ type: "int", default: null, title: "Length", description: "If given, the resulting signal will be zero-padded or clipped to this length." })
  declare length: any;




  async process(
    _inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    throw new Error(
      "GriffinLim is not implemented in the TypeScript runtime. Use the Python runtime for this node."
    );
  }
}

// ── Segmentation Nodes ────────────────────────────────────────────

export class DetectOnsetsNode extends BaseNode {
  static readonly nodeType = "lib.librosa.segmentation.DetectOnsets";
            static readonly title = "Detect Onsets";
            static readonly description = "Detect onsets in an audio file.\n    audio, analysis, segmentation\n\n    Use cases:\n    - Identify beat locations in music\n    - Segment audio based on changes in energy or spectral content\n    - Prepare audio for further processing or analysis";
        static readonly metadataOutputTypes = {
    output: "np_array"
  };
  
  @prop({ type: "audio", default: {
  "type": "audio",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Audio", description: "The input audio file to analyze." })
  declare audio: any;

  @prop({ type: "int", default: 512, title: "Hop Length", description: "Number of samples between successive frames." })
  declare hop_length: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const audio = (inputs.audio ?? this.audio ?? {}) as Record<
      string,
      unknown
    >;
    const hopLength = Number(inputs.hop_length ?? this.hop_length ?? 512);

    if (!audio.data) return { output: { data: [] } };

    const wav = decodeWav(audio);
    const mono = getMonoSamples(wav);

    // Compute spectral flux as onset strength envelope
    const nFft = 2048;
    const stft = computeSTFT(mono, nFft, hopLength);

    const onsetEnv: number[] = [];
    for (let i = 1; i < stft.length; i++) {
      let flux = 0;
      for (let k = 0; k < stft[i].length; k++) {
        const diff = stft[i][k] - stft[i - 1][k];
        flux += Math.max(0, diff); // half-wave rectified
      }
      onsetEnv.push(flux);
    }

    // Peak picking: find local maxima above threshold
    if (onsetEnv.length === 0) return { output: { data: [] } };

    const mean = onsetEnv.reduce((a, b) => a + b, 0) / onsetEnv.length;
    const std = Math.sqrt(
      onsetEnv.reduce((a, b) => a + (b - mean) ** 2, 0) / onsetEnv.length
    );
    const threshold = mean + 0.5 * std;
    const wait = Math.max(1, Math.floor((wav.sampleRate * 0.03) / hopLength));

    const onsetFrames: number[] = [];
    let lastOnset = -wait;
    for (let i = 1; i < onsetEnv.length - 1; i++) {
      if (
        onsetEnv[i] > onsetEnv[i - 1] &&
        onsetEnv[i] >= onsetEnv[i + 1] &&
        onsetEnv[i] > threshold &&
        i - lastOnset >= wait
      ) {
        onsetFrames.push(i + 1); // +1 because we started from frame 1
        lastOnset = i;
      }
    }

    // Convert frames to times
    const onsetTimes = onsetFrames.map(
      (f) => (f * hopLength) / wav.sampleRate
    );

    return { output: { data: onsetTimes } };
  }
}

export class SegmentAudioByOnsetsNode extends BaseNode {
  static readonly nodeType = "lib.librosa.segmentation.SegmentAudioByOnsets";
            static readonly title = "Segment Audio By Onsets";
            static readonly description = "Segment an audio file based on detected onsets.\n    audio, segmentation, processing\n\n    Use cases:\n    - Split a long audio recording into individual segments\n    - Prepare audio clips for further analysis or processing\n    - Extract specific parts of an audio file based on onset locations";
        static readonly metadataOutputTypes = {
    output: "list[audio]"
  };
  
  @prop({ type: "audio", default: {
  "type": "audio",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Audio", description: "The input audio file to segment." })
  declare audio: any;

  @prop({ type: "np_array", default: {
  "type": "np_array",
  "value": null,
  "dtype": "<i8",
  "shape": [
    1
  ]
}, title: "Onsets", description: "The onset times detected in the audio." })
  declare onsets: any;

  @prop({ type: "float", default: 0.1, title: "Min Segment Length", description: "Minimum length of a segment in seconds." })
  declare min_segment_length: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const audio = (inputs.audio ?? this.audio ?? {}) as Record<
      string,
      unknown
    >;
    const onsetsInput = (inputs.onsets ?? this.onsets ?? {
      data: [],
    }) as { data: number[] };
    const minSegLen = Number(
      inputs.min_segment_length ?? this.min_segment_length ?? 0.1
    );

    if (!audio.data) return { output: [] };

    const wav = decodeWav(audio);
    const mono = getMonoSamples(wav);
    const onsetTimes = onsetsInput.data || [];

    // Convert times to sample indices
    const onsetSamples = onsetTimes.map((t) =>
      Math.floor(t * wav.sampleRate)
    );
    onsetSamples.push(mono.length); // Add end

    const segments: Record<string, unknown>[] = [];
    for (let i = 0; i < onsetSamples.length - 1; i++) {
      const start = onsetSamples[i];
      const end = onsetSamples[i + 1];
      const segDuration = (end - start) / wav.sampleRate;

      if (segDuration >= minSegLen) {
        const segment = mono.slice(start, end);
        segments.push(audioRefFromWav(encodeWav(segment, wav.sampleRate)));
      }
    }

    return { output: segments };
  }
}

export class SaveAudioSegmentsNode extends BaseNode {
  static readonly nodeType = "lib.librosa.segmentation.SaveAudioSegments";
            static readonly title = "Save Audio Segments";
            static readonly description = "Save a list of audio segments to a specified folder.\n    audio, save, export\n\n    Use cases:\n    - Export segmented audio files for further processing or analysis\n    - Create a dataset of audio clips from a longer recording\n    - Organize audio segments into a structured format";
        static readonly metadataOutputTypes = {
    output: "folder"
  };
  
  @prop({ type: "list[audio]", default: [], title: "Segments", description: "The list of audio segments to save." })
  declare segments: any;

  @prop({ type: "folder", default: {
  "type": "folder",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Output Folder", description: "The folder to save the audio segments in." })
  declare output_folder: any;

  @prop({ type: "str", default: "segment", title: "Name Prefix", description: "Prefix for the saved audio file names." })
  declare name_prefix: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const { promises: fs } = await import("node:fs");
    const path = await import("node:path");

    const segments = (inputs.segments ?? this.segments ?? []) as Record<
      string,
      unknown
    >[];
    const folder = (inputs.output_folder ?? this.output_folder ?? {}) as {
      uri?: string;
      path?: string;
    };
    const prefix = String(
      inputs.name_prefix ?? this.name_prefix ?? "segment"
    );

    let folderPath = folder.path || folder.uri || "";
    if (folderPath.startsWith("file://")) folderPath = folderPath.slice(7);

    if (!folderPath) {
      return { output: folder };
    }

    await fs.mkdir(folderPath, { recursive: true });

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (!seg.data) continue;
      const bytes = typeof seg.data === "string"
        ? Buffer.from(seg.data, "base64")
        : Buffer.from(seg.data as Uint8Array);
      const name = `${prefix}_${String(i).padStart(4, "0")}.wav`;
      await fs.writeFile(path.join(folderPath, name), bytes);
    }

    return { output: folder };
  }
}

export const LIB_LIBROSA_SPECTRAL_NODES = [
  STFTNode,
  MelSpectrogramNode,
  MFCCNode,
  ChromaSTFTNode,
  SpectralCentroidNode,
  SpectralContrastNode,
  GriffinLimNode,
  DetectOnsetsNode,
  SegmentAudioByOnsetsNode,
  SaveAudioSegmentsNode,
] as const;
