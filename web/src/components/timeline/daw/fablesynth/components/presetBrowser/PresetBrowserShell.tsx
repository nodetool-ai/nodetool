// Machine-independent preset browser drawer. Clicking a row loads the item at
// once and auditions it. KEEP keeps the sound you hear; REVERT and A / B work
// against the sound that was loaded when the drawer opened or last kept. VARY
// (when the machine supports it) makes an unsaved variant of the selected item.
//
// Each instrument supplies a PresetBrowserAdapter: its items, how to load and
// snapshot a sound, the row glyph, the detail readout, and the audition.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { favoriteKey, filterEntries, loadFavorites, saveFavorites, type BrowserItem } from '../../shared/presetBrowser';
import './presetBrowser.css';

export type BrowserMode = 'kept' | 'audition' | 'variant' | 'b';

/** What the shell needs from a captured sound. Machines add their own fields. */
export interface BrowserSnapshot {
  value: string; // the loaded item's value at capture time
  dirty: boolean;
}

export interface PresetBrowserAdapter<I extends BrowserItem, S extends BrowserSnapshot> {
  /** List heading, e.g. 'WT-1 presets'. */
  title: string;
  /** Names the glyph cells, e.g. 'wave · filter · env · lfo'. */
  glyphLegend?: string;
  /** localStorage key for this machine's favorites. */
  favoritesKey: string;
  roles: readonly string[];
  characters: readonly string[];
  items: I[];
  /** Value of the item loaded now. */
  value: string;
  load: (item: I) => void;
  capture: () => S;
  restore: (snap: S) => void;
  /** Applies an unsaved variant of `item`. Omit to hide VARY. */
  vary?: (item: I) => void;
  /** Plays a short audition of the sound loaded now. */
  audition: (item: I | null) => void;
  stopAudition: () => void;
  /** One line under the phrase toggle, e.g. why nothing plays. */
  auditionHint: (phraseOn: boolean) => string;
  /** Row fingerprint; `color` is dim grey or the selection accent. */
  renderGlyph: (item: I, color: string) => ReactNode;
  /** Detail readout of the sound loaded now (glyph strip and values). */
  renderDetail: (color: string) => ReactNode;
}

const ROW_DIM = 'rgba(147, 160, 184, 0.38)';
const MODE_COLOR: Record<BrowserMode, string> = { kept: '#9fb4d8', audition: '#9fb4d8', variant: '#b18cff', b: '#ffa14d' };
function toggle<T>(set: ReadonlySet<T>, v: T): Set<T> {
  const next = new Set(set);
  if (next.has(v)) next.delete(v); else next.add(v);
  return next;
}

export function PresetBrowserShell<I extends BrowserItem, S extends BrowserSnapshot>({ adapter: a, onClose }: {
  adapter: PresetBrowserAdapter<I, S>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const modeLabels: Record<BrowserMode, string> = { kept: t('i18n-next24.presetBrowser.mode.kept'), audition: t('i18n-next24.presetBrowser.mode.audition'), variant: t('i18n-next24.presetBrowser.mode.variant'), b: t('i18n-next24.presetBrowser.mode.bKept') };
  const [query, setQuery] = useState('');
  const [roles, setRoles] = useState<ReadonlySet<string>>(new Set());
  const [tags, setTags] = useState<ReadonlySet<string>>(new Set());
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [userOnly, setUserOnly] = useState(false);
  const [favorites, setFavorites] = useState(() => loadFavorites(a.favoritesKey));
  const [phraseOn, setPhraseOn] = useState(true);

  const [kept, setKept] = useState<S>(a.capture);
  const [audition, setAudition] = useState<S | null>(null);
  const [mode, setMode] = useState<BrowserMode>('kept');
  const [variantN, setVariantN] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  // Canvas glyphs need a literal colour: the selected row uses the machine's accent.
  const [rowOn] = useState(() => getComputedStyle(document.documentElement).getPropertyValue('--ac-a').trim() || '#4de8ff');

  const visible = filterEntries(a.items, { query, roles, tags, favoritesOnly, userOnly }, favorites);
  const byValue = (v: string) => a.items.find((e) => e.value === v) ?? null;
  const current = byValue(a.value);
  const hasUser = a.items.some((e) => e.user);

  useEffect(() => {
    listRef.current?.querySelector('.pbr-row.sel')?.scrollIntoView({ block: 'nearest' });
  }, []);
  useEffect(() => a.stopAudition, []);

  const sound = (item: I | null) => { if (phraseOn) a.audition(item); };

  const select = (e: I) => {
    a.load(e);
    setAudition(null);
    setVariantN(0);
    setMode(e.value === kept.value && !kept.dirty ? 'kept' : 'audition');
    sound(e);
  };
  const keep = () => {
    setKept(a.capture());
    setAudition(null);
    setMode('kept');
  };
  const revert = () => {
    a.restore(kept);
    setAudition(null);
    setVariantN(0);
    setMode('kept');
    sound(byValue(kept.value));
  };
  const ab = () => {
    if (mode === 'b' && audition) {
      a.restore(audition);
      setMode(variantN ? 'variant' : 'audition');
      setAudition(null);
      sound(byValue(audition.value));
    } else {
      setAudition(a.capture());
      a.restore(kept);
      setMode('b');
      sound(byValue(kept.value));
    }
  };
  const vary = () => {
    if (!current || !a.vary) return;
    a.vary(current);
    setVariantN((n) => n + 1);
    setMode('variant');
    sound(current);
  };
  const toggleFavorite = (e: I) => {
    const next = toggle(favorites, favoriteKey(e));
    saveFavorites(a.favoritesKey, next);
    setFavorites(next);
  };
  const close = () => { a.stopAudition(); onClose(); };

  const shownValue = mode === 'b' && audition ? audition.value : a.value;
  const detailName = mode === 'variant' && current ? `${current.name} ~${variantN}` : (current?.name ?? '—');
  const role = current?.role ?? (current?.user ? 'user' : null);
  const isKept = mode === 'kept' || mode === 'b';

  return (
    <div className="pbr" role="dialog" aria-label={t('i18n-next24.presetBrowser.dialogLabel')}>
      <div className="pbr-col pbr-filters">
        <input
          className="pbr-search"
          type="search"
          placeholder={t('i18n-next24.presetBrowser.search')}
          aria-label={t('i18n-next24.presetBrowser.searchPresets')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="pbr-group">
          <span className="pbr-label">{t('i18n-next24.presetBrowser.role')}</span>
          <div className="pbr-chips">
            {a.roles.map((r) => (
              <button key={r} type="button" className="pbr-chip" aria-pressed={roles.has(r)} onClick={() => setRoles(toggle(roles, r))}>{r}</button>
            ))}
          </div>
        </div>
        <div className="pbr-group">
          <span className="pbr-label">{t('i18n-next24.presetBrowser.character')}</span>
          <div className="pbr-chips">
            {a.characters.map((t) => (
              <button key={t} type="button" className="pbr-chip" aria-pressed={tags.has(t)} onClick={() => setTags(toggle(tags, t))}>{t}</button>
            ))}
          </div>
        </div>
        <div className="pbr-group">
          <span className="pbr-label">{t('i18n-next24.presetBrowser.collection')}</span>
          <div className="pbr-chips">
            <button type="button" className="pbr-chip fav" aria-pressed={favoritesOnly} onClick={() => setFavoritesOnly(!favoritesOnly)}>♥ {t('i18n-next24.presetBrowser.favorites')}</button>
            {hasUser && (
              <button type="button" className="pbr-chip" aria-pressed={userOnly} onClick={() => setUserOnly(!userOnly)}>{t('i18n-next24.presetBrowser.user')}</button>
            )}
          </div>
        </div>
        <span className="pbr-count">{t('i18n-next24.presetBrowser.itemCount', { visible: visible.length, total: a.items.length })}</span>
      </div>

      <div className="pbr-col pbr-main">
        <div className="pbr-head">
          <span className="pbr-label">{a.title}</span>
          {a.glyphLegend && <span className="pbr-label">{a.glyphLegend}</span>}
        </div>
        <div className="pbr-list" ref={listRef}>
          {visible.length === 0 && <div className="pbr-empty">{t('i18n-next24.presetBrowser.noMatches')}</div>}
          {visible.map((e) => {
            const sel = e.value === shownValue;
            const fav = favorites.has(favoriteKey(e));
            return (
              <div key={e.value} className={`pbr-row${sel ? ' sel' : ''}`}>
                <button type="button" className="pbr-pick" onClick={() => select(e)} aria-current={sel}>
                  <span className="pbr-num">{e.user ? 'USR' : String(+e.value.slice(1) + 1).padStart(3, '0')}</span>
                  <span className="pbr-text">
                    <span className="pbr-name">{e.name}</span>
                    <span className="pbr-tags">{e.user ? 'user' : [e.role, ...e.tags].filter(Boolean).join(' · ')}</span>
                  </span>
                  {a.renderGlyph(e, sel ? rowOn : ROW_DIM)}
                </button>
                <button
                  type="button"
                  className={`pbr-heart${fav ? ' on' : ''}`}
                  aria-label={fav ? t('i18n-next24.presetBrowser.removeFavorite', { name: e.name }) : t('i18n-next24.presetBrowser.addFavorite', { name: e.name })}
                  aria-pressed={fav}
                  onClick={() => toggleFavorite(e)}
                >{fav ? '♥' : '♡'}</button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="pbr-col pbr-detail">
        <div className="pbr-detail-head">
          <div>
            <div className="pbr-dname">{detailName}</div>
            <div className="pbr-dmeta">{[role, ...(current?.tags ?? [])].filter(Boolean).join(' · ') || t('i18n-next24.presetBrowser.untagged')}</div>
          </div>
          <span className={`pbr-state ${mode}`}>{MODE_LABEL[mode]}</span>
        </div>
        {a.renderDetail(MODE_COLOR[mode])}
        <div className="pbr-actions">
          <button type="button" className="pbr-btn primary" onClick={keep} disabled={isKept}>{t('i18n-next24.presetBrowser.keep')}</button>
          <button type="button" className="pbr-btn" onClick={revert} disabled={isKept}>{t('i18n-next24.presetBrowser.revert')}</button>
          <button type="button" className="pbr-btn" aria-pressed={mode === 'b'} onClick={ab} disabled={mode === 'kept'}>A / B</button>
          {a.vary && <button type="button" className="pbr-btn vary" onClick={vary} disabled={!current || mode === 'b'}>{t('i18n-next24.presetBrowser.vary')}</button>}
        </div>
        <div className="pbr-foot">
          <button type="button" className="pbr-chip" aria-pressed={phraseOn} onClick={() => { setPhraseOn(!phraseOn); a.stopAudition(); }}>
            ♪ {t('i18n-next24.presetBrowser.phrase')}
          </button>
          <span className="pbr-hint">{a.auditionHint(phraseOn)}</span>
          <button type="button" className="pbr-btn close" onClick={close}>{t('i18n-next24.presetBrowser.close')}</button>
        </div>
      </div>
    </div>
  );
}
