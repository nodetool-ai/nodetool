declare module "soundtouchjs" {
  export class SoundTouch {
    sampleRate: number;
    tempo: number;
    pitch: number;
    pitchSemitones: number;
    inputBuffer: {
      putSamples(samples: Float32Array, offset: number, numFrames: number): void;
    };
    outputBuffer: {
      frameCount: number;
      receiveSamples(output: Float32Array, numFrames: number): number;
    };
    process(): void;
    clear(): void;
  }

  export class SimpleFilter {
    constructor(sourceSound: unknown, pipe: SoundTouch, callback?: () => void);
    extract(target: Float32Array, numFrames: number): number;
  }
}
