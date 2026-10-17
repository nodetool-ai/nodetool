// Now-playing footer: stop-all + live scene chips on the left, then one
// cell per track showing its owning scene/clip, the device playhead and a
// real VU meter fed by the track's analyser.

import type * as React from 'react';
import { useEffect, useRef } from 'react';
import { isTrackAudible, pad2 } from '../model';
import { useSeqStore } from '../store';

/** RMS meter over the track's analyser, drawn at rAF rate without renders. */
function TrackVu({ t }: { t: number }) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    let buf: Float32Array<ArrayBuffer> | null = null;
    let level = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const el = barRef.current;
      const an = useSeqStore.getState().rig?.trackAnalysers?.[t];
      if (!el || !an) return;
      if (!buf || buf.length !== an.fftSize) buf = new Float32Array(an.fftSize);
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const target = Math.min(1, rms * 3.2);
      level = target > level ? target : level * 0.86; // fast attack, slow fall
      el.style.width = `${Math.max(3, Math.round(level * 100))}%`;
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [t]);

  return (
    <div className="sq-vu">
      <div ref={barRef} style={{ width: '3%' }} />
    </div>
  );
}

export function FooterRow() {
  const session = useSeqStore((s) => s.session);
  const owner = useSeqStore((s) => s.owner);
  const pos = useSeqStore((s) => s.pos);
  const trackMute = useSeqStore((s) => s.trackMute);
  const sceneMute = useSeqStore((s) => s.sceneMute);
  const solo = useSeqStore((s) => s.solo);
  const { stopAll, stopTrack } = useSeqStore.getState();

  const liveScenes = session.scenes
    .map((sc, s) => ({ sc, s }))
    .filter(({ s }) => Object.values(owner).includes(s));

  return (
    <div className="sq-grid">
      <div className="sq-foot-master">
        <button className="sq-stopall" onClick={stopAll}>■ STOP ALL</button>
        <div className="sq-live-chips">
          <span className="sq-live-tag">LIVE</span>
          {liveScenes.length ? (
            liveScenes.map(({ sc, s }) => (
              <span key={s} className="sq-live-chip">
                {pad2(s + 1)} {sc.name}{sceneMute[s] ? ' ·M' : ''}
              </span>
            ))
          ) : (
            <span className="sq-live-chip">—</span>
          )}
        </div>
      </div>
      {session.tracks.map((tr, t) => {
        const o = owner[t];
        const live = o != null;
        const audible = live && isTrackAudible(t, owner, trackMute, sceneMute, solo);
        const clip = live ? session.scenes[o].clips[t] : null;
        const p = pos[t];
        const posLabel = live && clip && p ? ` · ${p.bar + 1}/${clip.bars}` : '';
        return (
          <div key={t} className="sq-foot-cell" style={{ '--tc': tr.color } as React.CSSProperties}>
            <button className="sq-mini" onClick={() => stopTrack(t)} title="Stop track">■</button>
            <div className="sq-foot-now">
              <div className="sq-foot-tag">NOW</div>
              <div className={`sq-foot-owner${audible ? ' on' : ''}`}>
                {live ? `${pad2(o + 1)} ${session.scenes[o].name} · ${clip ? clip.name : ''}${posLabel}` : '—'}
              </div>
            </div>
            <TrackVu t={t} />
          </div>
        );
      })}
    </div>
  );
}
