// Live third-octave spectrum for analyser displays (EQ panels, KIT MIX,
// ASSIST). Each animation frame reads the analyser, smooths the band powers
// over ~250 ms and hands `draw` the levels in dB relative to the total; the
// caller turns them into an SVG path in its own coordinates. The path is
// written directly so the panel does not re-render every frame. Silence
// clears it.
import { useEffect, useRef } from 'react';
import { BAND_HZ, SILENCE_DB, addBandPower, powerDb, rmsDb } from '../../engine/autoEq';

/** `source` is any node; the hook taps it with its own 8192-point analyser so the bass bands resolve. */
export function useLiveSpectrum(source: AudioNode | null, draw: (levels: number[]) => string) {
  const path = useRef<SVGPathElement | null>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  useEffect(() => {
    const el = path.current;
    if (!el) return;
    if (!source) { el.setAttribute('d', ''); return; }
    const analyser = Object.assign(source.context.createAnalyser(), { fftSize: 8192, smoothingTimeConstant: 0 });
    source.connect(analyser);
    const spec = new Float32Array(analyser.frequencyBinCount), time = new Float32Array(analyser.fftSize);
    const smooth = new Float64Array(BAND_HZ.length), bands = new Float64Array(BAND_HZ.length);
    let raf = 0, last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      analyser.getFloatTimeDomainData(time);
      if (rmsDb(time) < SILENCE_DB) { smooth.fill(0); el.setAttribute('d', ''); return; }
      analyser.getFloatFrequencyData(spec);
      bands.fill(0);
      addBandPower(bands, spec, analyser.context.sampleRate, analyser.fftSize);
      const k = 1 - Math.exp(-(now - last) / 250);
      last = now;
      for (let i = 0; i < bands.length; i++) smooth[i] += (bands[i] - smooth[i]) * k;
      const total = smooth.reduce((a, b) => a + b, 0) || 1e-20;
      el.setAttribute('d', drawRef.current(Array.from(smooth, p => powerDb(p / total))));
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf); el.setAttribute('d', '');
      try { source.disconnect(analyser); } catch { /* already gone */ }
    };
  }, [source]);
  return path;
}

/** EQ-analyser view: +4.5 dB/octave tilt around 1 kHz, centred on the median of 100 Hz–8 kHz. */
export function tiltedLevels(levels: number[]): number[] {
  const tilted = levels.map((l, i) => l + 4.5 * Math.log2(BAND_HZ[i] / 1000));
  const mid = tilted.filter((_, i) => BAND_HZ[i] >= 100 && BAND_HZ[i] <= 8000).sort((a, b) => a - b);
  const centre = mid[mid.length >> 1] ?? 0;
  return tilted.map(l => l - centre);
}
