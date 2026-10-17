// The scene's chord progression: one chip on the scene card that names the
// progression its linked chord tracks share, and opens the progression
// browser. A load writes every linked clip of the scene, so the pads, arps
// and FOLLOW lines all change together.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { chordName, PITCH_NAMES, progressionChords, progressionIndex, PROGRESSIONS } from '../../chords';
import { ProgressionBrowser } from '../../components/panels/ProgressionBrowser';
import { sceneChords, sceneChordTracks } from '../clipArp';
import { useSeqStore } from '../store';
import '../../components/panels/arp.css';

export function SceneChordChip({ s }: { s: number }) {
  const session = useSeqStore((st) => st.session);
  const [open, setOpen] = useState(false);
  const p = sceneChords(session, s);
  if (!p) return null;
  const { setSceneChords } = useSeqStore.getState();
  const preset = progressionIndex(p.chords, p.key);
  const names = p.chords.map(chordName).join(' ');
  const tracks = sceneChordTracks(session, s).length;
  const load = (i: number) => {
    const { chords, bars } = progressionChords(PROGRESSIONS[i], p.key);
    setSceneChords(s, { chords, key: p.key, bars });
  };
  const setKey = (key: number) => setSceneChords(s, { ...p, key,
    chords: p.chords.map(c => ({ ...c, root: (c.root + key - p.key + 12) % 12 })) });
  return <>
    <button type="button" className="sq-scene-chords" onClick={(e) => { e.stopPropagation(); setOpen(true); }}
      title={`Scene chords: ${names} · drives ${tracks} linked ${tracks === 1 ? 'track' : 'tracks'} · click to change`}>
      <span className="sq-scene-chords-key">{PITCH_NAMES[p.key]}</span>
      <span className="sq-scene-chords-name">{preset >= 0 ? PROGRESSIONS[preset].name : names}</span>
    </button>
    {open && createPortal(<div className="sq-scene-chords-scrim" onClick={() => setOpen(false)}>
      <div className="sq-scene-chords-dialog arp-panel" onClick={(e) => e.stopPropagation()}>
        <ProgressionBrowser chordKey={p.key} current={preset} load={load} onClose={() => setOpen(false)}
          title={`${session.scenes[s].name} · ${tracks} LINKED ${tracks === 1 ? 'TRACK' : 'TRACKS'}`}
          setKey={setKey} />
      </div>
    </div>, document.body)}
  </>;
}
