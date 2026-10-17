import { useState } from 'react';
import { factoryTables } from '../../store';
import { TableThumb } from './TableThumb';
import type { UserTable } from '../../engine/usertables';

// id scheme: 'f<i>' factory, 'u<i>' user — matches the osc .table selector space.
export function TableLibrary({
  userTables, selectedId, accent,
  onSelectFactory, onSelectUser, onNew,
  onRename, onDuplicateUser, onDuplicateFactory, onDelete,
}: {
  userTables: UserTable[];
  selectedId: string | null;
  accent: string;
  onSelectFactory: (i: number) => void;
  onSelectUser: (i: number) => void;
  onNew: () => void;
  onRename: (i: number, name: string) => void;
  onDuplicateUser: (i: number) => void;
  onDuplicateFactory: (i: number) => void;
  onDelete: (i: number) => void;
}) {
  const [query, setQuery] = useState('');
  const [renameIdx, setRenameIdx] = useState<number | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const factory = factoryTables();
  const q = query.trim().toUpperCase();
  const matches = (name: string) => !q || name.toUpperCase().includes(q);

  const commitRename = () => {
    if (renameIdx !== null) onRename(renameIdx, renameVal);
    setRenameIdx(null);
  };

  return (
    <aside className="wte-lib">
      <div className="wte-lib-head">
        <span className="wte-lib-title">LIBRARY</span>
        <span className="wte-lib-count">{factory.length + userTables.length} TABLES</span>
        <button className="wte-new" onClick={onNew}>＋ NEW</button>
      </div>
      <div className="wte-search">
        <input placeholder="search tables" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="wte-lib-scroll">
        <div className="wte-lib-section">FACTORY</div>
        {factory.map((t, i) => matches(t.name) && (
          <div key={'f' + i}
               className={'wte-lib-row' + (selectedId === 'f' + i ? ' on' : '')}
               onClick={() => onSelectFactory(i)}>
            <TableThumb table={t} accent={accent} selected={selectedId === 'f' + i} />
            <div className="wte-lib-info">
              <div className="wte-lib-name">{t.name}</div>
              <div className="wte-lib-sub">{t.frames}f · FACTORY</div>
            </div>
            <button title="duplicate" className="wte-lib-btn"
                    onClick={(e) => { e.stopPropagation(); onDuplicateFactory(i); }}>⎘</button>
          </div>
        ))}
        <div className="wte-lib-section">USER</div>
        {userTables.map((t, i) => matches(t.name) && (
          <div key={'u' + i}
               className={'wte-lib-row' + (selectedId === 'u' + i ? ' on' : '')}
               onClick={() => onSelectUser(i)}>
            <TableThumb table={t.table} accent={accent} selected={selectedId === 'u' + i} />
            <div className="wte-lib-info">
              {renameIdx === i ? (
                <input autoFocus className="wte-rename" value={renameVal}
                       onClick={(e) => e.stopPropagation()}
                       onChange={(e) => setRenameVal(e.target.value)}
                       onBlur={commitRename}
                       onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenameIdx(null); }} />
              ) : (
                <>
                  <div className="wte-lib-name">{t.name}</div>
                  <div className="wte-lib-sub">{t.frames}f</div>
                </>
              )}
            </div>
            <div className="wte-lib-actions">
              <button title="rename" className="wte-lib-btn"
                      onClick={(e) => { e.stopPropagation(); setRenameIdx(i); setRenameVal(t.name); }}>✎</button>
              <button title="duplicate" className="wte-lib-btn"
                      onClick={(e) => { e.stopPropagation(); onDuplicateUser(i); }}>⎘</button>
              <button title="delete" className="wte-lib-btn wte-lib-del"
                      onClick={(e) => { e.stopPropagation(); onDelete(i); }}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
