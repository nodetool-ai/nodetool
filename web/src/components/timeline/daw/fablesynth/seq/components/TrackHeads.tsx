// Track header row: the SCENES label card plus one card per track with a
// live LED, machine chip, mute/solo and a volume (fader) knob.

import type * as React from 'react';
import { patchName } from '../devices';
import { isTrackAudible } from '../model';
import { useSeqStore } from '../store';
import { SeqKnob } from './SeqKnob';

export function TrackHeads() {
  const tracks = useSeqStore((s) => s.session.tracks);
  const owner = useSeqStore((s) => s.owner);
  const playing = useSeqStore((s) => s.playing);
  const trackMute = useSeqStore((s) => s.trackMute);
  const sceneMute = useSeqStore((s) => s.sceneMute);
  const solo = useSeqStore((s) => s.solo);
  const trackVol = useSeqStore((s) => s.trackVol);
  const focusTrack = useSeqStore((s) => s.focus?.track ?? null);
  const { toggleTrackMute, toggleSolo, setTrackVol, enterFocus } = useSeqStore.getState();

  return (
    <div className="sq-grid sq-heads">
      <div className="sq-scenes-card">
        <div className="sq-scenes-title">SCENES</div>
        <div className="sq-scenes-sub">EMPTY CELLS STOP THEIR TRACK · ≈ PASSES THROUGH</div>
      </div>
      {tracks.map((tr, t) => {
        const audible = playing && isTrackAudible(t, owner, trackMute, sceneMute, solo);
        const machineLabel = tr.machine === 'DR1' ? 'DR-1' : tr.machine === 'BL1' ? 'BL-1' : 'WT-1';
        const patchLabel = patchName(tr.machine, tr.patch);
        return (
          <div
            key={t}
            className={`sq-track-head${t === focusTrack ? ' active' : ''}`}
            style={{ '--tc': tr.color } as React.CSSProperties}
          >
            <span className={`sq-led${audible ? ' on' : ''}`} />
            <div
              className="sq-track-id sq-track-id-btn"
              role="button"
              tabIndex={0}
              title="Open device"
              onClick={() => enterFocus(t)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  if (e.key === ' ') e.preventDefault();
                  enterFocus(t);
                }
              }}
            >
              <div className="sq-track-name-row">
                <span className="sq-track-name">{tr.name}</span>
                <span className="sq-track-editglyph" aria-hidden="true">✎</span>
                <span className="sq-machine-chip">{machineLabel}</span>
              </div>
              <div className="sq-track-patch">{patchLabel}</div>
            </div>
            <button
              className={`sq-mini sq-mute${trackMute[t] ? ' on' : ''}`}
              onClick={() => toggleTrackMute(t)}
              title="Mute track"
            >
              M
            </button>
            <button
              className={`sq-mini sq-solo${solo[t] ? ' on' : ''}`}
              onClick={() => toggleSolo(t)}
              title="Solo track"
            >
              S
            </button>
            <SeqKnob value={trackVol[t]} onChange={(v) => setTrackVol(t, v)} label="VOL" size="xs" defaultValue={tr.gain} />
          </div>
        );
      })}
    </div>
  );
}
