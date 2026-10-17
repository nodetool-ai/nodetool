/** Steady-state response, mirrored by DriveColor in the web/native DSP. */
export const DRIVE_TYPES = ['SOFT', 'TAPE', 'HARD'] as const;
export function driveTransfer(input: number, amount: number, type: number): number {
  const pre = 1 + amount * 2, k = 1 + amount * 12, z = input * pre * k;
  const shaped = type === 1 ? (Math.abs(z) < 1 ? 1.5 * z - 0.5 * z * z * z : Math.sign(z))
    : type === 2 ? Math.max(-1, Math.min(1, z)) : Math.tanh(z);
  return shaped / (pre * Math.tanh(k));
}

/** Discrete one-pole high shelf, including the audio engine's sample rate. */
export function driveToneDb(hz: number, tone: number, sr = 48000): number {
  const pole = Math.exp(-2 * Math.PI * 1000 / sr), w = 2 * Math.PI * hz / sr;
  const real = 1 - pole * Math.cos(w), imag = pole * Math.sin(w), denom = real * real + imag * imag;
  const lpReal = (1 - pole) * real / denom, lpImag = -(1 - pole) * imag / denom;
  const gain = tone * (tone < 0 ? 0.5 : 1);
  return 20 * Math.log10(Math.hypot(1 + gain * (1 - lpReal), -gain * lpImag));
}
