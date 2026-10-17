import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { DEST_OF_PARAM, MOD_SOURCES, SOURCE_COLORS, routeBipolar, routeLabel, polarityFor } from '../params';
import { useStore } from '../store';
import { findFreeSlot } from '../store/slotHelpers';
import { useModsByDest } from '../hooks/useModsByDest';
import { automationFocus } from '../seq/automationFocus';
import type { MachineId } from '../seq/protocol';
import './controlMenu.css';

export function useControlMenu(machine: MachineId, paramId: string) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [sources, setSources] = useState(false);
  const [polarity, setPolarity] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const owner = useRef<HTMLElement | null>(null);
  const close = () => { setPosition(null); owner.current?.focus(); };
  useEffect(() => {
    if (!position) return;
    menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const dismiss = (e: Event) => {
      if (!menuRef.current?.contains(e.target as Node)) setPosition(null);
    };
    const hide = () => setPosition(null);
    document.addEventListener('pointerdown', dismiss, true);
    window.addEventListener('resize', hide);
    window.addEventListener('scroll', hide, true);
    return () => {
      document.removeEventListener('pointerdown', dismiss, true);
      window.removeEventListener('resize', hide);
      window.removeEventListener('scroll', hide, true);
    };
  }, [position, sources, polarity]);
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!position || !el) return;
    const rect = el.getBoundingClientRect();
    el.style.top = `${Math.max(0, Math.min(position.y, window.innerHeight - rect.height))}px`;
    el.style.left = `${Math.max(0, Math.min(position.x, window.innerWidth - rect.width))}px`;
  }, [position, sources, polarity]);
  const dest = machine === 'WT1' ? DEST_OF_PARAM[paramId] : undefined;
  const modAvailable = Boolean(dest && findFreeSlot(useStore.getState().params));
  const mods = useModsByDest(dest);
  const auto = automationFocus(machine);
  const hasLane = Boolean(position && auto?.has?.(paramId));
  const onContextMenu = (e: MouseEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    owner.current = e.currentTarget;
    setSources(false);
    setPolarity(false);
    setPosition({ x: Math.max(0, Math.min(e.clientX, window.innerWidth - 220)),
      y: Math.max(0, Math.min(e.clientY, window.innerHeight - 230)) });
  };
  const menu = position && createPortal(
    <div ref={menuRef} className="control-menu" role="menu" aria-label="Control actions"
      style={{ left: position.x, top: position.y }}
      onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()} onContextMenu={e => e.preventDefault()}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); close(); }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
          e.preventDefault();
          const buttons = Array.from(menuRef.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
          const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
          const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1
            : (i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
          buttons[next]?.focus();
        }
      }}>
      <button type="button" role="menuitem" disabled={!modAvailable} aria-expanded={sources}
        onClick={() => setSources(!sources)}>Set modulation source ▸</button>
      {sources && MOD_SOURCES.slice(1).map((label, i) => <button type="button" role="menuitem"
        key={label} className="control-menu-source" onClick={() => {
          if (dest) useStore.getState().addRoute(i + 1, dest);
          close();
        }}>{label}</button>)}
      <button type="button" role="menuitem" disabled={!auto?.canShow(paramId)} onClick={() => {
        automationFocus(machine)?.show(paramId);
        close();
      }}>Show in automation</button>
      {(mods.length > 0 || hasLane) && <div className="control-menu-sep" role="separator" />}
      {mods.length > 0 && <button type="button" role="menuitem" aria-expanded={polarity}
        onClick={() => setPolarity(!polarity)}>Route polarity ▸</button>}
      {polarity && mods.map(m => {
        const bi = routeBipolar(m.src, m.pol);
        return <button type="button" role="menuitemcheckbox" aria-checked={bi} key={`pol${m.slot}`}
          className="control-menu-source control-menu-remove" style={{ ['--src' as string]: SOURCE_COLORS[m.src] }}
          onClick={() => useStore.getState().updateSlot(m.slot, { pol: polarityFor(m.src, !bi) })}>
          {MOD_SOURCES[m.src]} bipolar {bi ? '✓' : ''}</button>;
      })}
      {mods.map(m => <button type="button" role="menuitem" key={m.slot} className="control-menu-remove"
        style={{ ['--src' as string]: SOURCE_COLORS[m.src] }} onClick={() => {
          useStore.getState().clearSlot(m.slot);
          close();
        }}>Remove {routeLabel(m.src, m.amt, routeBipolar(m.src, m.pol))}</button>)}
      {hasLane && <button type="button" role="menuitem" className="control-menu-remove control-menu-remove-auto"
        onClick={() => {
          automationFocus(machine)?.remove?.(paramId);
          close();
        }}>Remove automation lane</button>}
    </div>, document.body);
  return { onContextMenu, menu };
}
