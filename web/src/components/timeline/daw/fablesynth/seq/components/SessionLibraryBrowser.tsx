// Saved-session browser: named sessions in localStorage, plus `.json`
// download/import that round-trips with the JUCE build's Load/Save chooser.

import { useRef, useState } from 'react';
import {
  exportSessionJson, importSessionJson, sessionFileName, type SessionLibraryEntry,
} from '../sessionLibrary';
import { newSessionId, readSessions, uniqueSessionName, writeSessions } from '../sessionLibraryStorage';
import { embedSessionPatches } from '../sessionExport';
import { useSeqStore } from '../store';
import { InlineNameField } from './InlineNameField';

const stamp = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function download(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function SessionLibraryBrowser({ onClose }: { onClose: () => void }) {
  const session = useSeqStore((s) => s.session);
  const [sessions, setSessions] = useState<SessionLibraryEntry[]>(() => readSessions(localStorage));
  const [editing, setEditing] = useState<'save' | string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const importInput = useRef<HTMLInputElement>(null);

  const commit = (next: SessionLibraryEntry[]) => {
    const sorted = [...next].sort((a, b) => b.savedAt - a.savedAt);
    writeSessions(localStorage, sorted);
    setSessions(sorted);
  };

  const saveAs = (name: string) => {
    const now = Date.now();
    commit([...sessions, {
      id: newSessionId(now),
      name: uniqueSessionName(name, sessions),
      savedAt: now,
      // Embed patches so a saved session cannot be altered later by editing
      // the factory bank it happened to reference.
      session: embedSessionPatches({ ...session, name }),
    }]);
  };

  const load = (entry: SessionLibraryEntry) => {
    useSeqStore.getState().applySessionDoc(entry.session);
    onClose();
  };

  const importFile = async (file?: File) => {
    if (!file) return;
    const result = importSessionJson(await file.text());
    if ('error' in result) setError(`Could not import ${file.name}: ${result.error}`);
    else {
      const now = Date.now();
      setError(null);
      commit([...sessions, {
        id: newSessionId(now),
        name: uniqueSessionName(result.session.name || file.name.replace(/\.json$/i, ''), sessions),
        savedAt: now,
        session: result.session,
      }]);
    }
    if (importInput.current) importInput.current.value = '';
  };

  return (
    <div className="sq-lib sq-sessions" role="dialog" aria-label="Session library">
      <header>
        <b>SESSIONS</b>
        <button onClick={onClose} aria-label="Close">×</button>
      </header>
      <div className="sq-sessions-bar">
        {editing === 'save' ? (
          <InlineNameField
            initial={uniqueSessionName(session.name, sessions)}
            onCommit={(name) => { saveAs(name); setEditing(null); }}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <button className="primary" onClick={() => setEditing('save')}>＋ SAVE CURRENT AS…</button>
        )}
        <button onClick={() => importInput.current?.click()}>↑ IMPORT .JSON</button>
        <input
          ref={importInput}
          hidden
          type="file"
          accept=".json,application/json"
          onChange={(e) => void importFile(e.target.files?.[0])}
        />
        <button onClick={() => download(exportSessionJson(session), sessionFileName(session.name))}>
          ↓ DOWNLOAD CURRENT
        </button>
      </div>
      {error && <p className="sq-sessions-error">{error}</p>}
      <div className="sq-sessions-list">
        {sessions.map((entry) => (
          <div key={entry.id} className="sq-sessions-row">
            {editing === entry.id ? (
              <InlineNameField
                initial={entry.name}
                onCommit={(name) => {
                  commit(sessions.map((s) => s.id === entry.id
                    ? { ...s, name: uniqueSessionName(name, sessions, s.id) }
                    : s));
                  setEditing(null);
                }}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <button className="sq-sessions-name" onClick={() => load(entry)} title="Load this session">
                <b>{entry.name}</b>
                <small>{entry.session.bpm} BPM · {stamp(entry.savedAt)}</small>
              </button>
            )}
            <button
              onClick={() => download(exportSessionJson(entry.session, entry.name), sessionFileName(entry.name))}
              title="Download as .json"
              aria-label={`Download ${entry.name}`}
            >↓</button>
            <button onClick={() => setEditing(entry.id)} title="Rename" aria-label={`Rename ${entry.name}`}>✎</button>
            <button
              onClick={() => commit(sessions.filter((s) => s.id !== entry.id))}
              title="Delete"
              aria-label={`Delete ${entry.name}`}
            >✕</button>
          </div>
        ))}
        {!sessions.length && <p>NO SAVED SESSIONS — SAVE THE CURRENT ONE OR IMPORT A .JSON</p>}
      </div>
      <p className="sq-sessions-hint">DOWNLOADED .JSON FILES LOAD IN THE FABLESYNTH VST · SESSION → LOAD</p>
    </div>
  );
}
