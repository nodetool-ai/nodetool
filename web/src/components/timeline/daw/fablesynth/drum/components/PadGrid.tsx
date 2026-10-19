import { useEffect, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { CHOKE_NAMES, OUT_NAMES, pad } from '../params';
import { useDrumStore } from '../dr1Store';

const PAD_ORDER = Array.from({ length: 4 }, (_, row) =>
  Array.from({ length: 4 }, (_, col) => (3 - row) * 4 + col),
).flat();

export function PadGrid() {
  const { t } = useTranslation();
  const sel = useDrumStore((s) => s.sel);
  const padNames = useDrumStore((s) => s.padNames);
  const hitTick = useDrumStore((s) => s.hitTick);
  const params = useDrumStore((s) => s.params);
  const selectPad = useDrumStore((s) => s.selectPad);
  const setParam = useDrumStore((s) => s.setParam);
  const setPadName = useDrumStore((s) => s.setPadName);
  const [now, setNow] = useState(() => performance.now());
  const [editing, setEditing] = useState<number | null>(null);
  const [draftName, setDraftName] = useState('');

  useEffect(() => {
    const timer = window.setInterval(() => setNow(performance.now()), 90);
    return () => window.clearInterval(timer);
  }, []);

  const beginRename = (i: number) => {
    setDraftName(padNames[i] ?? '');
    setEditing(i);
  };

  const commitRename = (i: number) => {
    setPadName(i, draftName);
    setEditing(null);
  };

  const renameKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
    e.stopPropagation();
  };

  return (
    <section className="panel dr-pads-panel" data-accent="a">
      <div className="panel-head">
        <h2>{t('i18n-next48.pads.title')}</h2>
        <span className="panel-hint">{t('i18n-next48.pads.hint')}</span>
      </div>
      <div className="pad-grid">
        {PAD_ORDER.map((i) => {
          const choke = params[pad(i, 'choke')] | 0;
          const out = params[pad(i, 'out')] | 0;
          const tag = choke > 0 ? CHOKE_NAMES[choke] : OUT_NAMES[out];
          const lit = now - (hitTick[i] ?? -Infinity) < 180;
          return (
            <button
              key={i}
              type="button"
              className={`pad${i === sel ? ' sel' : ''}`}
              onClick={() => selectPad(i)}
            >
              <span className="pad-num">{String(i + 1).padStart(2, '0')}</span>
              <span className={`pad-led${lit ? ' lit' : ''}`} />
              <span className="pad-meta">
                {editing === i ? (
                  <input
                    className="pad-name-input"
                    value={draftName}
                    maxLength={14}
                    autoFocus
                    onChange={(e) => setDraftName(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    onBlur={() => commitRename(i)}
                    onKeyDown={renameKeyDown}
                    aria-label={t('i18n-next48.pads.rename', { number: i + 1 })}
                  />
                ) : (
                  <span
                    className="pad-name"
                    onDoubleClick={(e) => { e.stopPropagation(); beginRename(i); }}
                  >
                    {padNames[i]}
                  </span>
                )}
                <span className="pad-tag">{tag}</span>
              </span>
            </button>
          );
        })}
      </div>
      <label className="dr-pad-output">
        <span>{t('i18n-next48.common.output')}</span>
        <select className="mod-select" aria-label={t('i18n-next48.pads.selectedOutput')} value={params[pad(sel, 'out')] | 0}
          onChange={(e) => setParam(pad(sel, 'out'), Number(e.target.value))}>
          {OUT_NAMES.map((name, index) => <option key={name} value={index}>{name}</option>)}
        </select>
      </label>
    </section>
  );
}
