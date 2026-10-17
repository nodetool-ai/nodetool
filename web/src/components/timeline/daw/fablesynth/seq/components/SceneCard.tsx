// The scene card: launch / mute / stop, per-track dots and a live status
// line. Shared by both views so they cannot drift — it is the lead column of
// every session grid row (SceneRow) and, stacked, the focus-mode launcher
// column (SeqApp). Focus mode adds two things on top of the session card: the
// body retargets the editor, and the focused scene is ringed.

import { compileClipArp } from '../clipArp';
import { isTrackAudible, pad2 } from '../model';
import { STEPS_PER_BAR } from '../protocol';
import { useSeqStore } from '../store';
import { SceneChordChip } from './SceneChordChip';
import { TransportGlyph } from './TransportGlyph';

export function SceneCard({ s, focus = false }: { s: number; focus?: boolean }) {
  const session = useSeqStore((st) => st.session);
  const owner = useSeqStore((st) => st.owner);
  const trackMute = useSeqStore((st) => st.trackMute);
  const sceneMute = useSeqStore((st) => st.sceneMute);
  const solo = useSeqStore((st) => st.solo);
  const queued = useSeqStore((st) => Object.values(st.queue).includes(s));
  const focusState = useSeqStore((st) => st.focus);
  const { launchScene, stopScene, toggleSceneMute, focusScene } = useSeqStore.getState();

  const sc = session.scenes[s];
  const clipTracks = sc.clips.map((c, t) => (c ? t : -1)).filter((t) => t >= 0);
  const owned = clipTracks.filter((t) => owner[t] === s);
  const muted = !!sceneMute[s];
  const liveAny = owned.length > 0;
  const full = liveAny && owned.length === clipTracks.length;

  let status: string, statusCls: string;
  if (muted && liveAny) { status = 'LIVE · MUTED'; statusCls = 'warn'; }
  else if (muted) { status = 'MUTED'; statusCls = 'warn'; }
  else if (queued) { status = 'QUEUED'; statusCls = 'lit'; }
  else if (full) { status = 'LIVE'; statusCls = 'live'; }
  else if (liveAny) { status = `LIVE ${owned.length}/${clipTracks.length}`; statusCls = 'live'; }
  else { status = 'READY'; statusCls = ''; }

  const hot = liveAny && !muted;
  const active = focus && focusState?.scene === s;

  // Focus only: the focused track's playhead through the clip this scene owns,
  // driven by the device's own pos messages rather than an animation so the
  // fill cannot drift from what is sounding.
  const pos = useSeqStore((st) => (focus && st.focus ? st.pos[st.focus.track] : null));
  const playingClip = focus && focusState && owner[focusState.track] === s
    ? sc.clips[focusState.track] : null;
  const progress = pos && playingClip
    ? playingClip.arp?.enabled ? (pos.step + 1) / (compileClipArp(playingClip)?.notes.length ?? STEPS_PER_BAR) : Math.min(1, (pos.bar * STEPS_PER_BAR + pos.step + 1) / (playingClip.bars * STEPS_PER_BAR))
    : null;

  return (
    <div
      className={`sq-scene-card${hot ? ' live' : ''}${active ? ' active' : ''}`}
      onClick={focus ? () => focusScene(s) : undefined}
      title={focus ? `Edit ${sc.name} in the open device` : undefined}
    >
      <div className="sq-scene-top">
        <button
          className={`sq-scene-launch${hot ? ' live' : ''}${queued ? ' queued' : ''}`}
          onClick={(e) => { e.stopPropagation(); launchScene(s); }}
          title="Launch scene"
          aria-label="Launch scene"
        >
          <TransportGlyph kind="play" />
        </button>
        <div className="sq-scene-id">
          <div className="sq-scene-name-row">
            <span className="sq-scene-num">{pad2(s + 1)}</span>
            <span className="sq-scene-name">{sc.name}</span>
          </div>
          <div className={`sq-scene-status ${statusCls}`}>{status}</div>
        </div>
        <button
          className={`sq-mini sq-mute${muted ? ' on' : ''}`}
          onClick={(e) => { e.stopPropagation(); toggleSceneMute(s); }}
          title="Mute scene"
        >
          M
        </button>
        <button
          className="sq-mini"
          onClick={(e) => { e.stopPropagation(); stopScene(s); }}
          title="Stop scene"
        >
          ■
        </button>
      </div>
      <div className="sq-scene-dots">
        {session.tracks.map((tr, t) => {
          const has = !!sc.clips[t];
          const on = has && owner[t] === s
            && isTrackAudible(t, owner, trackMute, sceneMute, solo);
          return (
            <span
              key={t}
              className={`sq-dot${on ? ' on' : ''}`}
              style={{
                background: !has ? '#1a1f2a' : on ? tr.color : `${tr.color}44`,
                boxShadow: on ? `0 0 8px ${tr.color}` : 'none',
              }}
            />
          );
        })}
        <span className="sq-clip-count">
          {clipTracks.length} {clipTracks.length === 1 ? 'CLIP' : 'CLIPS'}
        </span>
      </div>
      <SceneChordChip s={s} />
      {progress !== null && (
        <span className="sq-scene-progress" style={{ transform: `scaleX(${progress})` }} />
      )}
    </div>
  );
}
