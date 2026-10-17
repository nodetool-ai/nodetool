import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CLIP_FAMILIES,
  CLIP_ROLES,
  CLIP_TAGS,
  decodeClipLibrary,
  type ClipRole,
  type ClipTag,
  type RuntimeClipLibraryEntry,
} from '../clipLibrary';
import { FACTORY_CLIP_LIBRARY } from '../clipLibrary.gen';
import { previewSteps } from '../model';
import { b64ToBytes, type MachineId } from '../protocol';
import { clipPattern, useSeqStore } from '../store';
import { DR_REMAP_ALTERNATE_KIT, transformClip } from '../clipTransformations';
import { InlineNameField } from './InlineNameField';
import { resolveVisibleClipSelection } from '../clipLibraryActions';
import {
  exportSqclip, importSqclip, readPersistentClips, sourceFactoryClips,
  uniqueClipName, writePersistentClips, type ClipSource, type SourcedClip,
} from '../clipLibraryStorage';

const FAV_KEY = 'fablesynth:sq4:favorite-clips:v1';
const FACTORY = sourceFactoryClips(decodeClipLibrary({ v: 1, clips: FACTORY_CLIP_LIBRARY }).clips);

function readPersistent(): { users: SourcedClip[]; imported: SourcedClip[] } {
  try {
    return readPersistentClips(localStorage, FACTORY);
  } catch { return { users: [], imported: [] }; }
}

function readFavorites(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  } catch { return []; }
}

function makeId(machine: MachineId): string {
  return `user-${machine.toLowerCase()}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function PatternPreview({ entry, label }: { entry: RuntimeClipLibraryEntry; label?: string }) {
  const steps = previewSteps(entry.machine, entry.pattern, entry.bars);
  return (
    <div className="sq-lib-preview">
      {label && <span>{label}</span>}
      <div className="sq-lib-steps">
        {steps.map((step, i) => <i key={i} className={step.on ? 'on' : ''} style={{ height: step.h }} />)}
      </div>
    </div>
  );
}

interface Props {
  machine: MachineId;
  onClose: () => void;
}

export function ClipLibraryBrowser({ machine, onClose }: Props) {
  const focus = useSeqStore((s) => s.focus)!;
  const session = useSeqStore((s) => s.session);
  const current = session.scenes[focus.scene]?.clips[focus.track];
  const initial = useMemo(readPersistent, []);
  const [users, setUsers] = useState(initial.users);
  const [imported, setImported] = useState(initial.imported);
  const [favorites, setFavorites] = useState<string[]>(readFavorites);
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [family, setFamily] = useState('');
  const [role, setRole] = useState('');
  const [energy, setEnergy] = useState('');
  const [tag, setTag] = useState('');
  const [bars, setBars] = useState('');
  const [source, setSource] = useState<ClipSource | ''>('');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [transpose, setTranspose] = useState(0);
  const [transformKind, setTransformKind] = useState('rotate');
  const [transformValue, setTransformValue] = useState(1);
  const [editing, setEditing] = useState<'save' | 'rename' | null>(null);
  useEffect(() => setEditing(null), [selectedId]);
  const importInput = useRef<HTMLInputElement>(null);
  const allSources = useMemo(() => [...FACTORY, ...users, ...imported], [users, imported]);
  const all = useMemo(() => allSources.filter((entry) => entry.machine === machine), [allSources, machine]);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((entry) => {
      const haystack = `${entry.name} ${entry.id} ${entry.family} ${entry.role} ${entry.tags.join(' ')}`.toLowerCase();
      return (!q || haystack.includes(q))
        && (!family || entry.family === family)
        && (!role || entry.role === role)
        && (!energy || entry.energy === Number(energy))
        && (!tag || entry.tags.includes(tag as ClipTag))
        && (!bars || entry.bars === Number(bars))
        && (!source || entry.source === source)
        && (!onlyFavorites || favorites.includes(entry.id));
    });
  }, [all, search, family, role, energy, tag, bars, source, onlyFavorites, favorites]);
  const selected = resolveVisibleClipSelection(visible, selectedId);
  const isUser = selected?.source === 'USER';
  const isMutable = selected?.source === 'USER' || selected?.source === 'IMPORTED';

  const setAndPersistUsers = (next: SourcedClip[]) => {
    setUsers(next);
    try { writePersistentClips(localStorage, 'USER', next); } catch { /* storage optional */ }
  };
  const setAndPersistImported = (next: SourcedClip[]) => {
    setImported(next);
    try { writePersistentClips(localStorage, 'IMPORTED', next); } catch { /* storage optional */ }
  };
  const toggleFavorite = (id: string) => {
    const next = favorites.includes(id) ? favorites.filter((x) => x !== id) : [...favorites, id];
    setFavorites(next);
    try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch { /* storage optional */ }
  };
  const saveCurrent = (name: string) => {
    if (!current || current.arp?.enabled) return;
    if (allSources.some((clip) => clip.name.trim().toLowerCase() === name.toLowerCase())) {
      window.alert('A clip with that name already exists.'); return;
    }
    const pattern = clipPattern(session, focus.scene, focus.track);
    if (!pattern) return;
    const entry: SourcedClip = {
      id: makeId(machine), name, machine, bars: current.bars, pattern: new Uint8Array(pattern),
      family: 'experimental', role: CLIP_ROLES[machine][0] as ClipRole,
      energy: 3, tags: [], transpose: false, source: 'USER',
    };
    setAndPersistUsers([...users, entry]);
    setSelectedId(entry.id);
  };
  const duplicate = () => {
    if (!selected) return;
    const copy: SourcedClip = {
      ...selected, source: 'USER', id: makeId(machine),
      name: uniqueClipName(`${selected.name} COPY`, allSources),
      pattern: new Uint8Array(selected.pattern), tags: [...selected.tags],
    };
    setAndPersistUsers([...users, copy]);
    setSelectedId(copy.id);
  };
  const rename = (name: string) => {
    if (!selected || !isUser) return;
    if (!allSources.some((clip) => clip.id !== selected.id && clip.name.trim().toLowerCase() === name.toLowerCase())) {
      setAndPersistUsers(users.map((entry) => entry.id === selected.id ? { ...entry, name } : entry));
    }
  };
  const remove = () => {
    if (!selected || !isMutable) return;
    if (selected.source === 'USER') setAndPersistUsers(users.filter((entry) => entry.id !== selected.id));
    else setAndPersistImported(imported.filter((entry) => entry.id !== selected.id));
    setSelectedId('');
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      const additions = importSqclip(await file.text(), allSources);
      setAndPersistImported([...imported, ...additions]);
      setSelectedId(additions[0].id);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not import .sqclip');
    } finally {
      if (importInput.current) importInput.current.value = '';
    }
  };
  const exportSelected = () => {
    if (!selected) return;
    const blob = new Blob([exportSqclip([selected])], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `${selected.id}.sqclip`; link.click();
    URL.revokeObjectURL(url);
  };
  const load = () => {
    if (!selected) return;
    useSeqStore.getState().loadLibraryClip(focus.scene, focus.track, selected, transpose);
  };
  const saveTransform = () => {
    if (!selected) return;
    const op = transformKind === 'transpose' ? { kind: 'transpose' as const, semitones: transformValue }
      : transformKind === 'rotate' ? { kind: 'rotate' as const, steps: transformValue }
      : transformKind === 'reverse' ? { kind: 'reverse' as const }
      : transformKind === 'double' ? { kind: 'density' as const, factor: 2 as const }
      : transformKind === 'halve' ? { kind: 'density' as const, factor: 0.5 as const }
      : transformKind === 'accent' ? { kind: 'accent-shift' as const, steps: transformValue }
      : transformKind === 'humanize' ? { kind: 'humanize' as const, seed: transformValue }
      : transformKind === 'extract' ? { kind: 'extract-bar' as const, bar: transformValue - 1 }
      : transformKind === 'repeat' ? { kind: 'repeat' as const, bars: transformValue }
      : { kind: 'dr-lane-remap' as const, lanes: DR_REMAP_ALTERNATE_KIT };
    try {
      const transformed = transformClip(selected, op);
      const entry: SourcedClip = {
        ...transformed, id: makeId(machine), name: `${selected.name} · ${transformKind.toUpperCase()}`,
        pattern: new Uint8Array(transformed.pattern), tags: [...transformed.tags], source: 'USER',
      };
      entry.name = uniqueClipName(entry.name, allSources);
      setAndPersistUsers([...users, entry]);
      setSelectedId(entry.id);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not transform clip');
    }
  };
  const currentEntry: RuntimeClipLibraryEntry | null = current ? {
    id: 'current', name: current.name, machine, bars: current.bars,
    pattern: b64ToBytes(current.pattern), family: 'experimental',
    role: CLIP_ROLES[machine][0] as ClipRole, energy: 3, tags: [], transpose: false,
  } : null;

  return (
    <div className="sq-lib" role="dialog" aria-label="Clip library">
      <header><b>CLIP LIBRARY · {machine}</b><button onClick={onClose} aria-label="Close">×</button></header>
      <div className="sq-lib-filters">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or tag…" autoFocus />
        <select value={family} onChange={(e) => setFamily(e.target.value)}><option value="">ALL FAMILIES</option>{CLIP_FAMILIES.map((x) => <option key={x}>{x}</option>)}</select>
        <select value={role} onChange={(e) => setRole(e.target.value)}><option value="">ALL ROLES</option>{CLIP_ROLES[machine].map((x) => <option key={x}>{x}</option>)}</select>
        <select value={energy} onChange={(e) => setEnergy(e.target.value)}><option value="">ENERGY</option>{[1, 2, 3, 4, 5].map((x) => <option key={x}>{x}</option>)}</select>
        <select value={tag} onChange={(e) => setTag(e.target.value)}><option value="">ALL TAGS</option>{CLIP_TAGS.map((x) => <option key={x}>{x}</option>)}</select>
        <select value={bars} onChange={(e) => setBars(e.target.value)}><option value="">BARS</option>{[1, 2, 4, 8, 16].map((x) => <option key={x}>{x}</option>)}</select>
        <select value={source} onChange={(e) => setSource(e.target.value as ClipSource | '')}><option value="">ALL SOURCES</option><option>FACTORY</option><option>USER</option><option>IMPORTED</option></select>
        <button className={onlyFavorites ? 'active' : ''} onClick={() => setOnlyFavorites(!onlyFavorites)}>★ FAV</button>
      </div>
      <div className="sq-lib-body">
        <div className="sq-lib-list">
          {visible.map((entry) => (
            <button key={entry.id} className={entry.id === selected?.id ? 'selected' : ''} onClick={() => setSelectedId(entry.id)}>
              <span className="sq-lib-star" onClick={(e) => { e.stopPropagation(); toggleFavorite(entry.id); }}>{favorites.includes(entry.id) ? '★' : '☆'}</span>
              <span><b>{entry.name}</b><small>{entry.source} · {entry.family} · {entry.role} · E{entry.energy} · {entry.bars}B</small></span>
              <PatternPreview entry={entry} />
            </button>
          ))}
          {!visible.length && <p>NO MATCHING CLIPS</p>}
        </div>
        <aside>
          {currentEntry && <PatternPreview entry={currentEntry} label={`TARGET · ${currentEntry.name}`} />}
          {selected && <><PatternPreview entry={selected} label={`SELECTED · ${selected.name}`} /><p>{selected.tags.join(' · ') || 'untagged'}</p></>}
          {selected?.transpose && <label>TRANSPOSE <input type="number" min={-24} max={24} value={transpose} onChange={(e) => setTranspose(Math.max(-24, Math.min(24, Number(e.target.value))))} /> ST</label>}
          <button className="primary" disabled={!selected} onClick={load}>LOAD INTO TARGET</button>
          {editing === 'save' ? (
            <InlineNameField
              initial={current ? uniqueClipName(`${current.name} COPY`, allSources) : ''}
              onCommit={(name) => { saveCurrent(name); setEditing(null); }}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <button disabled={!current || current.arp?.enabled} title={current?.arp?.enabled ? 'Save the session to retain the arp. Switch to SEQ to save written notes here.' : undefined} onClick={() => setEditing('save')}>SAVE CURRENT</button>
          )}
          <button disabled={!selected} onClick={duplicate}>DUPLICATE</button>
          <button onClick={() => importInput.current?.click()}>IMPORT .SQCLIP</button>
          <input ref={importInput} hidden type="file" accept=".sqclip,application/json" onChange={(e) => void importFile(e.target.files?.[0])} />
          <button disabled={!selected} onClick={exportSelected}>EXPORT .SQCLIP</button>
          <label>TRANSFORM
            <select value={transformKind} onChange={(e) => setTransformKind(e.target.value)}>
              {machine !== 'DR1' && <option value="transpose">TRANSPOSE</option>}
              <option value="rotate">ROTATE</option><option value="reverse">REVERSE</option>
              <option value="double">DENSITY ×2</option><option value="halve">DENSITY ÷2</option>
              <option value="accent">SHIFT ACCENTS</option><option value="humanize">HUMANIZE</option>
              {selected && selected.bars > 1 && <option value="extract">EXTRACT BAR</option>}
              <option value="repeat">EXTEND / REPEAT</option>
              {machine === 'DR1' && <option value="remap">REMAP KIT LANES</option>}
            </select>
          </label>
          {!['reverse', 'double', 'halve', 'remap'].includes(transformKind) &&
            <label>{transformKind === 'humanize' ? 'SEED' : transformKind === 'extract' ? 'BAR' : transformKind === 'repeat' ? 'BARS' : 'AMOUNT'}
              <input type="number" min={transformKind === 'extract' || transformKind === 'repeat' ? 1 : undefined}
                max={transformKind === 'extract' ? selected?.bars : transformKind === 'repeat' ? 16 : undefined}
                value={transformValue} onChange={(e) => setTransformValue(Number(e.target.value))} />
            </label>}
          <button disabled={!selected} onClick={saveTransform}>SAVE TRANSFORM AS NEW</button>
          {editing === 'rename' ? (
            <InlineNameField
              initial={selected?.name ?? ''}
              onCommit={(name) => { rename(name); setEditing(null); }}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <button disabled={!isUser} onClick={() => setEditing('rename')}>RENAME</button>
          )}
          <button disabled={!isMutable} onClick={remove}>DELETE</button>
        </aside>
      </div>
    </div>
  );
}
