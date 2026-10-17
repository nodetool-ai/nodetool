import { useDrumStore } from '../drum/store';
import { useEffect, useState } from 'react';
import { WebAgentPanel } from '../agent/WebAgentPanel';
import { makeSqAgentHost } from '../agent/sqAgentHost';
import { DeviceView } from './components/DeviceView';
import { FooterRow } from './components/FooterRow';
import { Header } from './components/Header';
import { Onboarding } from './components/Onboarding';
import { SceneCard } from './components/SceneCard';
import { SceneRow } from './components/SceneRow';
import { SqPowerOverlay } from './components/SqPowerOverlay';
import { TrackHeads } from './components/TrackHeads';
import { MasterFxRack } from './components/MasterFxRack';
import { useSeqStore } from './store';
import { useStore as useWtStore } from '../store';
import { useBassStore } from '../bass/store';
import { setTempoProvider } from '../engine/autoComp';

// Auto-comp release times follow the session tempo inside SQ-4.
setTempoProvider(() => useSeqStore.getState().session.bpm);

export function SeqApp() {
  const [agentOpen, setAgentOpen] = useState(false);
  const agentHost = useState(makeSqAgentHost)[0];
  const session = useSeqStore((s) => s.session);
  const powered = useSeqStore((s) => s.powered);
  const quant = useSeqStore((s) => s.quant);
  const focus = useSeqStore((s) => s.focus);
  const masterFxOpen = useSeqStore((s) => s.masterFxOpen);

  // UI clock: beat dots / bar counter derive from the shared context-frame
  // timebase while the logical transport is running.
  useEffect(() => {
    if (!powered) return;
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      useSeqStore.getState().tick();
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [powered]);

  // exposed for debugging / automated verification
  useEffect(() => {
    (window as unknown as { __fableSq: unknown }).__fableSq = { store: useSeqStore, wt: useWtStore, bl: useBassStore, dr: useDrumStore };
  }, []);

  // focus-mode keys: Esc exits, 1–4 switch devices, ↑/↓ move the scene rail.
  // Session mode adds the grid editing verbs: Cmd/Ctrl combos are claimed
  // globally (plain keys stay free for note-playing surfaces); Esc / Delete /
  // arrows act only while a grid selection or drag exists.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useSeqStore.getState();
      const el = e.target as HTMLElement | null;
      if (el?.closest('input, textarea, select, [role="slider"], [contenteditable="true"]')) return;
      if (st.focus) {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && st.session.tracks[st.focus.track].machine === 'DR1') {
          e.preventDefault(); if (e.shiftKey) useDrumStore.getState().redo(); else useDrumStore.getState().undo(); return;
        }
        // Arp is seq-store state. Melodic note edits and POLY rhythm share the device undo
        // (its snapshot includes the rhythm; the write-back keeps the clip in sync), which
        // the hosted editors' key hooks handle, so POLY clips must not be claimed here.
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && st.session.scenes[st.focus.scene]?.clips[st.focus.track]?.arp) {
          e.preventDefault(); if (e.shiftKey) st.redo(); else st.undo(); return;
        }
        if (e.key === 'Escape') st.exitFocus();
        else if (e.key >= '1' && e.key <= String(st.session.tracks.length)) st.enterFocus(Number(e.key) - 1);
        else if (e.key === 'ArrowUp') { e.preventDefault(); st.focusScene(st.focus.scene - 1); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); st.focusScene(st.focus.scene + 1); }
        return;
      }
      if (e.metaKey || e.ctrlKey) {
        const k = e.key.toLowerCase();
        if (k === 'z') { e.preventDefault(); if (e.shiftKey) st.redo(); else st.undo(); }
        else if (k === 'a') {
          e.preventDefault();
          st.setGridSelection(
            { s: 0, t: 0 },
            { s: st.session.scenes.length - 1, t: st.session.tracks.length - 1 },
          );
        } else if (k === 'c' && st.gridSel) { e.preventDefault(); st.copySelection(); }
        else if (k === 'x' && st.gridSel) { e.preventDefault(); st.cutSelection(); }
        else if (k === 'd' && st.gridSel) { e.preventDefault(); st.duplicateSelection(); }
        else if (k === 'v' && st.gridSel) {
          e.preventDefault();
          st.pasteAt(st.gridSel.anchor.s, st.gridSel.anchor.t);
        }
        return;
      }
      if (e.key === 'Escape') {
        if (st.gridDrag) st.setGridDrag(null); // cancel the drag, keep selection
        else if (st.gridSel) st.clearGridSelection();
        return;
      }
      if (!st.gridSel) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); st.deleteSelection(); return; }
      const dir: Record<string, [number, number]> = {
        ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
      };
      const d = dir[e.key];
      if (!d) return;
      e.preventDefault();
      const head = { s: st.gridSel.head.s + d[0], t: st.gridSel.head.t + d[1] };
      if (e.shiftKey) st.setGridSelection(st.gridSel.anchor, head);
      else st.setGridSelection(head);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <SqPowerOverlay />
      <Onboarding />
      {agentOpen && <WebAgentPanel host={agentHost} plugin="SQ-4" onClose={() => setAgentOpen(false)} />}
      <main id="sq-rack" className={focus ? 'focused' : ''}>
        <Header />
        <TrackHeads />
        {masterFxOpen ? (
          <MasterFxRack />
        ) : focus ? (
          <div className="sq-focus" key={`f${focus.track}`}>
            <aside className="sq-launcher">
              <button
                className="sq-launcher-back"
                onClick={() => useSeqStore.getState().exitFocus()}
                title="Back to session (Esc)"
              >
                ◂ SESSION
              </button>
              {session.scenes.map((_, s) => <SceneCard key={s} s={s} focus />)}
            </aside>
            <DeviceView />
          </div>
        ) : (
          session.scenes.map((_, s) => <SceneRow key={s} s={s} />)
        )}
        {!focus && !masterFxOpen && <FooterRow />}
        <div className="sq-hint">
          {masterFxOpen
            ? 'MASTER BUS · POST-FADER EQ → OTT → COMP → LIMITER · CLICK MASTER FX TO RETURN TO SESSION'
            : focus
            ? 'SCENE CHIPS RETARGET THE EDITOR · 1–4 SWITCH DEVICE · ESC BACK TO SESSION'
            : `TAP CLIP TO LAUNCH · TAP AGAIN TO STOP · LAUNCHES QUANTIZE TO ${quant} · CMD-CLICK SELECTS · DRAG MOVES (ALT COPIES) · CMD-C/X/V/D/Z EDIT · RIGHT-CLICK EMPTY CELL TO TOGGLE PASS-THROUGH`}
        </div>
      </main>
      <button className="web-agent-launcher" onClick={() => setAgentOpen(true)}>AGENT</button>
    </>
  );
}
