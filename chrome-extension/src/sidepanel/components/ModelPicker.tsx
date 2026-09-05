/**
 * Model picker — the panel's copy of the web composer's model chip.
 *
 * Same behaviour as `web/src/components/model_menu/LanguageModelMenuDialog`
 * and `examples/chat_app`'s picker: every configured provider's language
 * models, grouped by provider, filtered by a search box once the list is long
 * enough to need one. A narrow side panel has no room for the web dialog's
 * two-column provider/model split, so the groups stack.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import type { LanguageModelOption } from "../../lib/nodetool-client.js";
import { ChevronDownIcon } from "./Icons.js";

/** Below this many models a search box is more chrome than help. */
const SEARCH_THRESHOLD = 8;

interface ModelPickerProps {
  models: LanguageModelOption[];
  value: LanguageModelOption | null;
  onChange: (model: LanguageModelOption) => void;
  loading?: boolean;
}

function modelKey(m: LanguageModelOption): string {
  return `${m.provider}::${m.id}`;
}

export function ModelPicker({
  models,
  value,
  onChange,
  loading,
}: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  // A click anywhere else, or Escape, closes the menu — the panel has no
  // portal layer, so the menu handles its own dismissal.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? models.filter(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            m.id.toLowerCase().includes(q) ||
            m.provider.toLowerCase().includes(q),
        )
      : models;
    const byProvider = new Map<string, LanguageModelOption[]>();
    for (const m of filtered) {
      const list = byProvider.get(m.provider) ?? [];
      list.push(m);
      byProvider.set(m.provider, list);
    }
    return [...byProvider.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [models, query]);

  const label = loading
    ? "Loading models…"
    : (value?.name ?? value?.id ?? "Select model");

  return (
    <div className="model-picker" ref={rootRef}>
      <button
        type="button"
        className="model-picker__trigger"
        data-empty={value ? "false" : "true"}
        disabled={loading}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={value ? `${value.provider} · ${value.id}` : "Select a model"}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="model-picker__label">{label}</span>
        <ChevronDownIcon size={12} />
      </button>

      {open && (
        <div className="model-picker__menu" role="listbox">
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
          <div className="model-picker__list">
            {grouped.length === 0 && (
              <p className="model-picker__empty">
                {models.length === 0
                  ? "No language models available. Add a provider API key in NodeTool, or start the server with NODETOOL_ENABLE_FAKE_PROVIDER=1."
                  : "No models match your search."}
              </p>
            )}
            {grouped.map(([provider, list]) => (
              <div key={provider}>
                <div className="model-picker__group-label">{provider}</div>
                {list.map((model) => (
                  <button
                    type="button"
                    key={modelKey(model)}
                    className="model-picker__item"
                    role="option"
                    aria-selected={
                      !!value && modelKey(value) === modelKey(model)
                    }
                    title={model.id}
                    onClick={() => {
                      onChange(model);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    {model.name || model.id}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
