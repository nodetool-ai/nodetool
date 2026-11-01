/**
 * PresetPicker
 *
 * A searchable grid of generation presets with kind and tag filters. It builds
 * a stack of up to three presets and enforces the same rules the server
 * compiler applies (`canAddPreset` from `@nodetool-ai/presets`): stackable
 * presets only, one per slot, no declared conflicts. A card that cannot join
 * the current stack stays visible and focusable, dimmed, with the reason in its
 * tooltip.
 *
 * Keyboard: the grid is one tab stop. Arrow keys move over the cards, Home and
 * End jump to the ends, Enter and Space toggle the focused card.
 *
 * The picker is controlled. `value` is the ordered list of preset ids, which is
 * also the compile order.
 */

import React, {
  forwardRef,
  memo,
  useCallback,
  useMemo,
  useRef,
  useState
} from "react";
import { useTranslation } from "react-i18next";
import { Box } from "@mui/material";
import CloseIcon from "@mui/icons-material/CloseOutlined";
import {
  MAX_PRESET_STACK,
  canAddPreset,
  type ModelFamily,
  type Preset,
  type PresetBlockReason,
  type PresetFilter
} from "@nodetool-ai/presets";
import { presetText } from "../../utils/presetText";
import { AutoGrid } from "./AutoGrid";
import { Caption } from "./Caption";
import { Chip } from "./Chip";
import { EmptyState } from "./EmptyState";
import { FlexColumn } from "./FlexColumn";
import { FlexRow } from "./FlexRow";
import { PresetCard } from "./PresetCard";
import { SearchInput } from "./SearchInput";
import { SPACING } from "./spacing";

/** Narrowest card the grid lays out, in px. */
const MIN_CARD_WIDTH = 180;

const KINDS: ReadonlyArray<Preset["kind"]> = ["camera", "look", "effect"];

export interface PresetPickerProps {
  presets: readonly Preset[];
  /** Selected preset ids in stack order. */
  value: string[];
  /** Presets selected in another field that share this request's stack. */
  companionIds?: readonly string[];
  onChange: (ids: string[]) => void;
  /** Limits the grid to one kind or generation mode. */
  filter?: PresetFilter;
  /** The model family of the chosen model. Its badge reads as active. */
  activeFamily?: ModelFamily | null;
  /** The list price of using one preset, shown on its card. */
  renderCostHint?: (preset: Preset) => React.ReactNode;
  className?: string;
}

const matchesQuery = (text: string, query: string): boolean =>
  query
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => text.includes(word));

const PresetPickerInner = forwardRef<HTMLDivElement, PresetPickerProps>(
  (
    {
      presets,
      value,
      companionIds,
      onChange,
      filter,
      activeFamily,
      renderCostHint,
      className
    },
    ref
  ) => {
    const { t } = useTranslation();
    const gridRef = useRef<HTMLDivElement>(null);
    const [query, setQuery] = useState("");
    const [kind, setKind] = useState<Preset["kind"] | null>(null);
    const [tags, setTags] = useState<string[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);

    const scoped = useMemo(
      () =>
        presets.filter(
          (preset) =>
            (!filter?.kind || preset.kind === filter.kind) &&
            (!filter?.mode || preset.modes.includes(filter.mode))
        ),
      [presets, filter?.kind, filter?.mode]
    );

    const kinds = useMemo(
      () => KINDS.filter((k) => scoped.some((preset) => preset.kind === k)),
      [scoped]
    );
    const allTags = useMemo(
      () =>
        [
          ...new Set(
            scoped
              .filter((preset) => !kind || preset.kind === kind)
              .flatMap((preset) => preset.tags)
          )
        ].sort((a, b) => a.localeCompare(b)),
      [scoped, kind]
    );
    // A tag the selected kind doesn't offer has no chip to clear it, so it stops filtering.
    const activeTags = useMemo(
      () => tags.filter((tag) => allTags.includes(tag)),
      [tags, allTags]
    );

    const visible = useMemo(() => {
      const needle = query.trim().toLowerCase();
      return scoped.filter((preset) => {
        if (kind && preset.kind !== kind) {
          return false;
        }
        if (!activeTags.every((tag) => preset.tags.includes(tag))) {
          return false;
        }
        if (!needle) {
          return true;
        }
        const text = presetText(t, preset);
        return matchesQuery(
          [text.name, text.description, preset.name, ...preset.tags, ...preset.aliases]
            .join(" ")
            .toLowerCase(),
          needle
        );
      });
    }, [scoped, kind, activeTags, query, t]);

    const byId = useMemo(
      () => new Map(presets.map((preset) => [preset.id, preset])),
      [presets]
    );
    const selection = useMemo(
      () =>
        [...value, ...(companionIds ?? [])]
          .map((id) => byId.get(id))
          .filter((preset): preset is Preset => preset !== undefined),
      [value, companionIds, byId]
    );

    const reasonText = useCallback(
      (reason: PresetBlockReason, candidate: Preset, other?: Preset): string => {
        const otherName = other ? presetText(t, other).name : "";
        switch (reason) {
          case "limit":
            return t("preset_picker.reason.limit", { max: MAX_PRESET_STACK });
          case "mode":
            return t("preset_picker.reason.mode", {
              name: presetText(t, candidate).name
            });
          case "not-stackable":
            return t("preset_picker.reason.notStackable", { name: otherName });
          case "slot":
            return t("preset_picker.reason.slot", { name: otherName });
          case "conflict":
            return t("preset_picker.reason.conflict", { name: otherName });
          default:
            return "";
        }
      },
      [t]
    );

    const toggle = useCallback(
      (preset: Preset) => {
        onChange(
          value.includes(preset.id)
            ? value.filter((id) => id !== preset.id)
            : [...value, preset.id]
        );
      },
      [onChange, value]
    );

    const focusCard = useCallback((id: string) => {
      setActiveId(id);
      const cards = gridRef.current?.querySelectorAll<HTMLElement>(
        "[data-preset-id]"
      );
      cards?.forEach((card) => {
        if (card.dataset.presetId === id) {
          card.focus();
        }
      });
    }, []);

    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLDivElement>) => {
        const card = (event.target as HTMLElement).closest<HTMLElement>(
          "[data-preset-id]"
        );
        if (!card || visible.length === 0) {
          return;
        }
        const index = visible.findIndex(
          (preset) => preset.id === card.dataset.presetId
        );
        if (index < 0) {
          return;
        }
        const cards = [
          ...(gridRef.current?.querySelectorAll<HTMLElement>(
            "[data-preset-id]"
          ) ?? [])
        ];
        const firstTop = cards[0]?.offsetTop;
        const rowEnd = cards.findIndex((item) => item.offsetTop !== firstTop);
        const columns = rowEnd === -1 ? cards.length : rowEnd;
        const steps: Record<string, number | undefined> = {
          ArrowRight: 1,
          ArrowLeft: -1,
          ArrowDown: columns,
          ArrowUp: -columns
        };
        let next: number | undefined;
        if (event.key === "Home") {
          next = 0;
        } else if (event.key === "End") {
          next = visible.length - 1;
        } else if (steps[event.key] !== undefined) {
          next = Math.min(
            visible.length - 1,
            Math.max(0, index + (steps[event.key] as number))
          );
        }
        if (next === undefined) {
          return;
        }
        event.preventDefault();
        focusCard(visible[next].id);
      },
      [visible, focusCard]
    );

    const filtersActive = query.trim() !== "" || kind !== null || activeTags.length > 0;
    const clearFilters = useCallback(() => {
      setQuery("");
      setKind(null);
      setTags([]);
    }, []);

    const tabbableId =
      visible.find((preset) => preset.id === activeId)?.id ??
      visible.find((preset) => value.includes(preset.id))?.id ??
      visible[0]?.id;

    return (
      <FlexColumn ref={ref} className={className} gap={SPACING.lg}>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={t("preset_picker.searchPlaceholder")}
          ariaLabel={t("preset_picker.searchLabel")}
          fullWidth
        />
        {(kinds.length > 1 && !filter?.kind) || allTags.length > 0 ? (
          <FlexColumn gap={SPACING.xs}>
            {kinds.length > 1 && !filter?.kind ? (
              <FlexRow
                wrap
                gap={SPACING.xs}
                role="group"
                aria-label={t("preset_picker.kindLabel")}
              >
                <Chip
                  compact
                  label={t("preset_picker.allKinds")}
                  active={kind === null}
                  onClick={() => setKind(null)}
                />
                {kinds.map((k) => (
                  <Chip
                    key={k}
                    compact
                    label={t(`preset_picker.kind.${k}`)}
                    active={kind === k}
                    onClick={() => setKind(kind === k ? null : k)}
                  />
                ))}
              </FlexRow>
            ) : null}
            {allTags.length > 0 ? (
              <FlexRow
                wrap
                gap={SPACING.xs}
                role="group"
                aria-label={t("preset_picker.tagsLabel")}
              >
                {allTags.map((tag) => (
                  <Chip
                    key={tag}
                    compact
                    label={tag}
                    active={tags.includes(tag)}
                    onClick={() =>
                      setTags(
                        tags.includes(tag)
                          ? tags.filter((item) => item !== tag)
                          : [...tags, tag]
                      )
                    }
                  />
                ))}
              </FlexRow>
            ) : null}
          </FlexColumn>
        ) : null}
        <FlexRow
          wrap
          align="center"
          gap={SPACING.xs}
          role="group"
          aria-label={t("preset_picker.selectedLabel")}
        >
          {value.map((id) => {
            const preset = byId.get(id);
            const name = preset ? presetText(t, preset).name : id;
            return (
              <Chip
                key={id}
                compact
                active
                label={name}
                onDelete={() => onChange(value.filter((item) => item !== id))}
                deleteIcon={
                  <CloseIcon
                    titleAccess={t("preset_picker.remove", { name })}
                  />
                }
              />
            );
          })}
          <Caption color="secondary" role="status">
            {t("preset_picker.selectedCount", {
              count: value.length,
              max: MAX_PRESET_STACK
            })}
          </Caption>
        </FlexRow>
        {visible.length === 0 ? (
          <EmptyState
            variant="no-results"
            size="small"
            actionText={
              filtersActive ? t("preset_picker.clearFilters") : undefined
            }
            onAction={filtersActive ? clearFilters : undefined}
          />
        ) : (
          <Box
            ref={gridRef}
            role="listbox"
            aria-multiselectable="true"
            aria-label={t("preset_picker.listLabel")}
            onKeyDown={handleKeyDown}
          >
            <AutoGrid minItemWidth={MIN_CARD_WIDTH} gap={SPACING.md} role="presentation">
              {visible.map((preset) => {
                const selected = value.includes(preset.id);
                const verdict = selected
                  ? { ok: true as const }
                  : canAddPreset(selection, preset, { mode: filter?.mode });
                const blocked = !verdict.ok;
                return (
                  <PresetCard
                    key={preset.id}
                    role="option"
                    tabIndex={preset.id === tabbableId ? 0 : -1}
                    preset={preset}
                    selected={selected}
                    disabled={blocked}
                    disabledReason={
                      verdict.ok
                        ? undefined
                        : reasonText(verdict.reason, preset, verdict.other)
                    }
                    activeFamily={activeFamily}
                    costHint={renderCostHint?.(preset)}
                    onFocus={() => setActiveId(preset.id)}
                    onClick={toggle}
                  />
                );
              })}
            </AutoGrid>
          </Box>
        )}
      </FlexColumn>
    );
  }
);
PresetPickerInner.displayName = "PresetPicker";

export const PresetPicker = memo(PresetPickerInner);
PresetPicker.displayName = "PresetPicker";
