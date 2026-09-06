/**
 * Model picker — the panel's copy of the web composer's model chip.
 *
 * Same behaviour as `web/src/components/model_menu/LanguageModelMenuDialog`
 * and `examples/chat_app`'s picker: every configured provider's language
 * models, grouped by provider, filtered by a search box once the list is long
 * enough to need one. A narrow side panel has no room for the web dialog's
 * two-column provider/model split, so the groups stack.
 *
 * Nothing is chosen by default, so the trigger's first job is to ask for a
 * choice, and the panel blocks sending until it gets one. A stored model the
 * current server no longer offers is kept and marked unavailable rather than
 * swapped silently — the user chose it, and a different server may bring it
 * back.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import type { LanguageModelOption } from "../../lib/nodetool-client.js";
import { modelKey } from "../modelSelection.js";
import { CheckIcon, ChevronDownIcon } from "./Icons.js";

/** Below this many models a search box is more chrome than help. */
const SEARCH_THRESHOLD = 8;

interface ModelPickerProps {
  models: LanguageModelOption[];
  value: LanguageModelOption | null;
  onChange: (model: LanguageModelOption) => void;
  loading?: boolean;
  /** False when `value` is set but the server does not offer it. */
  valid?: boolean;
}

export function ModelPicker({
  models,
  value,
  onChange,
  loading,
  valid = true,
}: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Index into the flattened option list — the row arrow keys move over and
  // Enter picks. Kept separate from `value`: highlighting is not choosing.
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // A click anywhere else, or Escape, closes the menu — the panel has no
  // portal layer, so the menu handles its own dismissal.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q),
    );
  }, [models, query]);

  const grouped = useMemo(() => {
    const byProvider = new Map<string, LanguageModelOption[]>();
    for (const m of matches) {
      const list = byProvider.get(m.provider) ?? [];
      list.push(m);
      byProvider.set(m.provider, list);
    }
    return [...byProvider.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [matches]);

  // The keyboard walks the list in the order it is rendered, not the order the
  // server sent it, so the row index comes from the grouped output.
  const flat = useMemo(() => grouped.flatMap(([, list]) => list), [grouped]);
  const indexByKey = useMemo(
    () => new Map(flat.map((m, i) => [modelKey(m), i])),
    [flat],
  );

  // Open on the current model so the first arrow key moves from where the user
  // already is; a new search starts at the top.
  useEffect(() => {
    if (!open) return;
    const current = value ? flat.findIndex((m) => modelKey(m) === modelKey(value)) : -1;
    setActiveIndex(current >= 0 ? current : 0);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Arrow keys are handled on the menu, so it needs the focus when there is no
  // search box to take it.
  useEffect(() => {
    if (open && models.length <= SEARCH_THRESHOLD) menuRef.current?.focus();
  }, [open, models.length]);

  // Keep the highlighted row on screen while arrowing through a long list.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function commit(model: LanguageModelOption) {
    onChange(model);
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  }

  function onMenuKeyDown(event: React.KeyboardEvent) {
    if (flat.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % flat.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i - 1 + flat.length) % flat.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(flat.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const model = flat[activeIndex];
      if (model) commit(model);
    }
  }

  const unavailable = !!value && !valid && !loading;
  const state = loading
    ? "loading"
    : unavailable
      ? "unavailable"
      : value
        ? "chosen"
        : "empty";
  const label = loading
    ? "Loading models…"
    : value
      ? (value.name || value.id)
      : "Choose model";
  const title = loading
    ? "Loading models…"
    : unavailable
      ? `${value!.provider} · ${value!.id} is not available on this server. Choose another model.`
      : value
        ? `${value.provider} · ${value.id}`
        : "Choose a model before sending";

  return (
    <div className="model-picker" ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className="model-picker__trigger"
        data-state={state}
        disabled={loading}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={
          value ? `Model: ${value.name || value.id}` : "Choose a model"
        }
        title={title}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="model-picker__label">{label}</span>
        <ChevronDownIcon size={12} />
      </button>

      {open && (
        <div
          className="model-picker__menu"
          ref={menuRef}
          tabIndex={-1}
          onKeyDown={onMenuKeyDown}
        >
          {models.length > SEARCH_THRESHOLD && (
            <input
              className="model-picker__search"
              value={query}
              autoFocus
              placeholder="Search models…"
              aria-label="Search models"
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
          {unavailable && (
            <p className="model-picker__notice" role="status">
              {value!.name || value!.id} is not available on this server.
            </p>
          )}
          <div className="model-picker__list" role="listbox" ref={listRef}>
            {flat.length === 0 && (
              <p className="model-picker__empty">
                {models.length === 0
                  ? "No language models available. Add a provider API key in NodeTool, or start the server with NODETOOL_ENABLE_FAKE_PROVIDER=1."
                  : "No models match your search."}
              </p>
            )}
            {grouped.map(([provider, list]) => (
              <div key={provider}>
                <div className="model-picker__group-label">{provider}</div>
                {list.map((model) => {
                  const index = indexByKey.get(modelKey(model)) ?? 0;
                  const selected =
                    !!value && modelKey(value) === modelKey(model);
                  return (
                    <button
                      type="button"
                      key={modelKey(model)}
                      data-index={index}
                      data-active={index === activeIndex}
                      className="model-picker__item"
                      role="option"
                      aria-selected={selected}
                      title={model.id}
                      onMouseMove={() => setActiveIndex(index)}
                      onClick={() => commit(model)}
                    >
                      <span className="model-picker__item-text">
                        <span className="model-picker__item-name">
                          {model.name || model.id}
                        </span>
                        {model.name && model.name !== model.id && (
                          <span className="model-picker__item-id">
                            {model.id}
                          </span>
                        )}
                      </span>
                      {selected && (
                        <span className="model-picker__check" aria-hidden="true">
                          <CheckIcon size={12} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
