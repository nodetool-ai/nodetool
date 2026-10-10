export interface Voice {
  readonly id: string;
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
  readonly loop: boolean;
  readonly fadeOutTicks: number;
  readonly bus: string;
}

export function playBuiltinGameVoice(context: BaseAudioContext, volume: number, destination: AudioNode, onEnded: () => void): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = 660;
  gain.gain.setValueAtTime(volume * 0.08, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.12);
  oscillator.connect(gain).connect(destination);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); onEnded(); };
  oscillator.start();
  oscillator.stop(context.currentTime + 0.12);
}

export function stopGameVoice(voice: Voice, context: AudioContext, fadeTicks: number, tickRate: number, fading: Set<Voice>): void {
  const now = context.currentTime;
  voice.gain.gain.cancelScheduledValues(now);
  if (fadeTicks > 0) {
    fading.add(voice);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(0, now + fadeTicks / tickRate);
  }
  voice.source.stop(now + fadeTicks / tickRate);
}
