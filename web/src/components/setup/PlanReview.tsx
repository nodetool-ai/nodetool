/**
 * The plan step, generic over the plan's shape (PRD § 6.3): the storyboard
 * screenplay, the video beat list, the script, the image brief, the workflow
 * step list. Sections with a header, rows that are inline-editable fields, and
 * one `Re-plan` action whose label the flow chooses — the storyboard flow
 * calls it `Re-direct`.
 *
 * Cheap text before spend (PRD § 6.2, D4): nothing here renders, generates or
 * places anything. Every edit writes straight back through the row's
 * `onChange`, because the document is the draft.
 */

import React, { memo, useEffect, useRef, useState } from "react";
import ClearIcon from "@mui/icons-material/Clear";
import type { SxProps, Theme } from "@mui/material/styles";

import {
  Box,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  SelectField,
  SPACING,
  SPACING_PX,
  Text,
  TextInput,
  ToolbarIconButton
} from "../ui_primitives";
import type { SelectOption } from "../ui_primitives";
import {
  EDITABLE_FIELD,
  REVIEW_BLOCK,
  REVIEW_COMPACT_WIDTH,
  REVIEW_CONTENT_WIDTH,
  REVIEW_FLEX_MIN_WIDTH,
  REVIEW_SCENE,
  REVIEW_SCENE_RAIL,
  REVIEW_WIDE_WIDTH
} from "./reviewStyles";

export interface PlanReviewField {
  id: string;
  /** Visible label and the field's accessible name. */
  label: string;
  value: string;
  /** Every keystroke. The document is the draft, so it writes straight back. */
  onChange: (value: string) => void;
  /**
   * The value has settled: the field lost focus, or Enter was pressed on a
   * single-line field. A select commits on the change itself, which is the
   * only settled moment it has.
   *
   * Use it for anything that must not run mid-word. A duration parsed on every
   * keystroke reads `900` as `9` on the way through and writes 9 seconds the
   * creator never typed. `onChange` still fires per keystroke, so a field that
   * passes nothing here is unaffected.
   *
   * It never fires on unmount — a removed section or a re-plan drops an
   * uncommitted draft rather than committing what was abandoned.
   */
  onCommit?: (value: string) => void;
  /** Multi-line body text — an action line, a beat, a step description. */
  multiline?: boolean;
  placeholder?: string;
  /** A field the flow owns elsewhere, e.g. dialogue on a script-linked board. */
  readOnly?: boolean;
  /**
   * A field whose value is one of a known set — a line's speaker, a step's
   * node type. Rendered as a select, so the row cannot be left holding a value
   * the document has no meaning for.
   */
  options?: readonly SelectOption[];
  /**
   * A short field — a speaker, a shot size. It keeps a narrow fixed column and
   * shares its line with the field that follows, instead of stretching the
   * full width of the review.
   */
  compact?: boolean;
  /**
   * Drops the visible label, keeping it as the field's accessible name. Use it
   * where the same two labels repeat on every line and the value says what the
   * field is.
   */
  hideLabel?: boolean;
  /**
   * Sets the field in from the left, the way a screenplay sets dialogue in
   * from action. It is the only thing separating the two once both rows have
   * dropped their labels.
   */
  indent?: boolean;
  /** Empty optional fields open on request. */
  addLabel?: string;
}

/**
 * A block inside a section — one shot of a scene. Its rows read as a unit and
 * are drawn as one, so a scene's shots do not run together into a single
 * column of labelled fields.
 */
export interface PlanReviewGroup {
  id: string;
  /** The block's name, e.g. "Shot 2". Quieter than the section header. */
  header: string;
  /** Beside the header, in the same quiet tone — a shot size, a duration. */
  meta?: string;
  rows: readonly PlanReviewField[];
}

export interface PlanReviewSection {
  id: string;
  /** Section header — a slugline, a beat title, a step name. */
  header: string;
  /** One line under the header, e.g. a scene's lighting note. */
  subheader?: string;
  /** Rows that belong to the section itself, above its groups. */
  rows: readonly PlanReviewField[];
  /** The section's blocks, drawn one after another under its own rows. */
  groups?: readonly PlanReviewGroup[];
  /**
   * The remove control's name, when `Remove {header}` is not what it removes —
   * a slugline header makes a long name. Only read when the flow supports
   * removal.
   */
  removeLabel?: string;
}

export interface PlanReviewProps {
  sections: readonly PlanReviewSection[];
  /** The re-plan action's label, e.g. "Re-direct". */
  replanLabel?: string;
  /**
   * Re-runs the generator. Optional: a step that puts the retry with its own
   * heading — where a creator looks after reading the first rows, rather than
   * below every field — owns the control and passes nothing here.
   */
  onReplan?: () => void;
  /** True while the plan generator is running. */
  replanPending?: boolean;
  /**
   * Drops one item of the plan. Optional: a flow whose plan has a fixed shape
   * passes nothing and no remove control is drawn, so nothing changes for it.
   *
   * The last item is never removable — the flows check that a plan has content
   * before they let it advance, so an empty review would be a dead end with no
   * way back except leaving the flow.
   */
  onRemoveSection?: (id: string) => void;
  /**
   * What one item is called, for the message on the last item's disabled
   * remove control: "beat", "scene", "step".
   */
  sectionNoun?: string;
}

/**
 * Packs a section's fields into visual lines. A short field opens a line and
 * the field after it joins that line — a speaker and the words spoken. Every
 * other field gets a line of its own, so two unrelated rows can never end up
 * side by side.
 */
const toLines = (
  rows: readonly PlanReviewField[]
): readonly (readonly PlanReviewField[])[] => {
  const lines: PlanReviewField[][] = [];
  let current: PlanReviewField[] = [];
  for (const row of rows) {
    const opensLine =
      current.length === 0
        ? false
        : row.compact || current.some((field) => !field.compact);
    if (opensLine) {
      lines.push(current);
      current = [];
    }
    current.push(row);
  }
  if (current.length > 0) {
    lines.push(current);
  }
  return lines;
};

const PlanReviewControl: React.FC<{ row: PlanReviewField }> = ({ row }) => {
  const [expanded, setExpanded] = useState(false);
  const holder = useRef<HTMLDivElement>(null);

  // The add control is replaced by the field it opens, so the focus it held
  // would otherwise land back on the document. Move it into the new field.
  useEffect(() => {
    if (!expanded) {
      return;
    }
    holder.current?.querySelector<HTMLElement>("input, textarea")?.focus();
  }, [expanded]);

  // What the last commit sent, so tabbing through an untouched review does not
  // write a value nobody edited.
  const committed = useRef(row.value);
  const commit = (value: string): void => {
    if (row.onCommit === undefined || value === committed.current) {
      return;
    }
    committed.current = value;
    row.onCommit(value);
  };

  if (row.addLabel && !row.value && !expanded) {
    return (
      <EditorButton
        variant="text"
        size="small"
        onClick={() => setExpanded(true)}
      >
        {row.addLabel}
      </EditorButton>
    );
  }
  const control = row.options ? (
    <SelectField
      label={row.label}
      hideLabel={row.hideLabel}
      value={row.value}
      options={row.options}
      disabled={row.readOnly}
      onChange={(value) => {
        row.onChange(value);
        commit(value);
      }}
    />
  ) : (
    <TextInput
      compact
      minRows={1}
      label={row.label}
      hideLabel={row.hideLabel}
      value={row.value}
      multiline={row.multiline}
      placeholder={row.placeholder}
      onChange={(event) => row.onChange(event.target.value)}
      onBlur={(event) => commit(event.target.value)}
      onKeyDown={(event) => {
        // Enter is a line break in a body field, so only a single-line field
        // commits on it. It commits and nothing else: the key stops here
        // rather than reaching a form or the shell's primary action.
        if (event.key !== "Enter" || row.multiline === true) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        commit((event.target as HTMLInputElement).value);
      }}
      slotProps={{ input: { readOnly: row.readOnly } }}
    />
  );
  return <Box ref={holder}>{control}</Box>;
};

/** A field's box: how much of the line it takes, and how far in it sits. */
const fieldSx = (row: PlanReviewField): SxProps<Theme> => {
  const box: Record<string, unknown> = { ...EDITABLE_FIELD };
  if (row.compact) {
    // It keeps its narrow column while the line holds, and takes the full
    // width once the line has wrapped.
    box.flex = `0 1 ${REVIEW_COMPACT_WIDTH}px`;
    box.minWidth = `min(100%, ${REVIEW_COMPACT_WIDTH}px)`;
  } else {
    // The basis is what wraps the line: below it there is no room for both
    // fields, so the row stacks instead of clipping the text.
    box.flex = `1 1 ${REVIEW_FLEX_MIN_WIDTH}px`;
    box.minWidth = 0;
  }
  if (row.indent) {
    box.pl = `${SPACING_PX.xxl}px`;
  }
  return box;
};

/** A run of rows, packed into lines. Used by a section and by its groups. */
const PlanReviewLines: React.FC<{ rows: readonly PlanReviewField[] }> = ({
  rows
}) => (
  <FlexColumn gap={GAP.compact}>
    {toLines(rows).map((line) => (
      <FlexRow
        key={line[0].id}
        gap={GAP.normal}
        align="flex-start"
        wrap
        sx={{ width: "100%" }}
      >
        {line.map((row) => (
          <Box key={row.id} sx={fieldSx(row)}>
            <PlanReviewControl row={row} />
          </Box>
        ))}
      </FlexRow>
    ))}
  </FlexColumn>
);

/** One bounded, compact shot inside its scene. */
const PlanReviewBlock: React.FC<{ group: PlanReviewGroup }> = ({ group }) => (
  <FlexColumn gap={GAP.normal} sx={REVIEW_BLOCK}>
    <FlexRow gap={GAP.normal} align="baseline" wrap>
      <Text size="small" component="h4">
        {group.header}
      </Text>
      {group.meta ? <Caption color="muted">{group.meta}</Caption> : null}
    </FlexRow>
    <PlanReviewLines rows={group.rows} />
  </FlexColumn>
);

/**
 * Drops one item of the plan.
 *
 * Its name says what it removes: a row of bare "Remove" buttons tells a screen
 * reader nothing about which one it is on.
 *
 * The last item's control carries `aria-disabled` rather than `disabled`, the
 * same contract `SetupCardButton` uses. A disabled button takes no focus, and
 * this is exactly the control the keyboard lands on after the second-to-last
 * removal — disabling it would strand focus on the way to explaining itself.
 */
const RemoveSectionControl: React.FC<{
  section: PlanReviewSection;
  last: boolean;
  noun: string;
  onRemove: (id: string) => void;
  register: (id: string) => (node: HTMLButtonElement | null) => void;
}> = ({ section, last, noun, onRemove, register }) => {
  const name = section.removeLabel ?? `Remove ${section.header}`;
  return (
    <ToolbarIconButton
      ref={register(section.id)}
      icon={<ClearIcon fontSize="small" />}
      variant="error"
      aria-disabled={last || undefined}
      ariaLabel={name}
      tooltip={last ? `A plan keeps at least one ${noun}.` : name}
      onClick={() => {
        if (!last) {
          onRemove(section.id);
        }
      }}
      sx={{ ml: "auto", alignSelf: "center", opacity: last ? 0.5 : 1 }}
    />
  );
};

/** A section's name and size, in the one tone every plan header uses. */
const PlanReviewHeader: React.FC<{ section: PlanReviewSection }> = ({
  section
}) => (
  <>
    {/* A section header is a heading, so it reads as one. The small uppercase
        label tone put it below the block headings under it, which is backwards:
        18/600 for the section, 13/500 for its blocks. */}
    <Text size="big" component="h3">
      {section.header}
    </Text>
    {section.subheader ? (
      <Caption color="muted">{section.subheader}</Caption>
    ) : null}
  </>
);

/**
 * A section that holds blocks — a scene and its shots. The scene's own fields
 * go in a rail beside the shots, so the shots start at the same left edge as
 * each other and the scene reads as one surface rather than a run of rows.
 */
const PlanReviewSceneSection: React.FC<{
  section: PlanReviewSection;
  remove?: React.ReactNode;
}> = ({ section, remove }) => (
  <Box component="section" sx={REVIEW_SCENE}>
    <FlexRow align="stretch" sx={{ flexWrap: { xs: "wrap", md: "nowrap" } }}>
      <FlexColumn gap={GAP.comfortable} sx={REVIEW_SCENE_RAIL}>
        <FlexRow gap={GAP.normal} align="flex-start">
          <FlexColumn gap={GAP.tight} sx={{ minWidth: 0 }}>
            <PlanReviewHeader section={section} />
          </FlexColumn>
          {remove}
        </FlexRow>
        {section.rows.length > 0 ? (
          <PlanReviewLines rows={section.rows} />
        ) : null}
      </FlexColumn>
      <FlexColumn
        gap={GAP.comfortable}
        sx={{ flex: 1, minWidth: 0, padding: SPACING.lg }}
      >
        {section.groups?.map((group) => (
          <PlanReviewBlock key={group.id} group={group} />
        ))}
      </FlexColumn>
    </FlexRow>
  </Box>
);

const PlanReviewInternal: React.FC<PlanReviewProps> = ({
  sections,
  replanLabel,
  onReplan,
  replanPending = false,
  onRemoveSection,
  sectionNoun = "item"
}) => {
  // A grouped plan needs two columns; a flat one still reads as prose in one.
  const grouped = sections.some((section) => (section.groups?.length ?? 0) > 0);

  // Removing an item destroys the control the keyboard was on. Focus moves to
  // the item that took its place, or to the one before it when the last item
  // went, so the review never hands focus back to the document.
  const removeControls = useRef(new Map<string, HTMLButtonElement>());
  const [focusAfterRemove, setFocusAfterRemove] = useState<string | null>(null);
  const registerRemoveControl =
    (id: string) =>
    (node: HTMLButtonElement | null): void => {
      if (node === null) {
        removeControls.current.delete(id);
      } else {
        removeControls.current.set(id, node);
      }
    };

  useEffect(() => {
    if (focusAfterRemove === null) {
      return;
    }
    removeControls.current.get(focusAfterRemove)?.focus();
    setFocusAfterRemove(null);
  }, [sections, focusAfterRemove]);

  const handleRemove = (id: string): void => {
    const index = sections.findIndex((section) => section.id === id);
    const neighbour = sections[index + 1] ?? sections[index - 1];
    setFocusAfterRemove(neighbour?.id ?? null);
    onRemoveSection?.(id);
  };

  const removeControl = (section: PlanReviewSection): React.ReactNode =>
    onRemoveSection === undefined ? null : (
      <RemoveSectionControl
        section={section}
        last={sections.length <= 1}
        noun={sectionNoun}
        onRemove={handleRemove}
        register={registerRemoveControl}
      />
    );

  return (
    <FlexColumn
      gap={grouped ? GAP.spacious : GAP.normal}
      sx={{
        width: "100%",
        maxWidth: grouped ? REVIEW_WIDE_WIDTH : REVIEW_CONTENT_WIDTH
      }}
    >
      {sections.map((section) =>
        section.groups && section.groups.length > 0 ? (
          <PlanReviewSceneSection
            key={section.id}
            section={section}
            remove={removeControl(section)}
          />
        ) : (
          <FlexColumn key={section.id} gap={GAP.compact} component="section">
            {/* Name and size share the header's line: stacked, a two-word
                subheader read as a row of its own and pushed the section's
                first field a line further down on every scene. */}
            <FlexRow
              gap={GAP.normal}
              align="baseline"
              wrap
              sx={{
                borderBottom: "1px solid",
                borderColor: "divider",
                pb: `${SPACING_PX.sm}px`,
                maxWidth: REVIEW_CONTENT_WIDTH
              }}
            >
              <PlanReviewHeader section={section} />
              {removeControl(section)}
            </FlexRow>
            {section.rows.length > 0 ? (
              <Box sx={{ maxWidth: REVIEW_CONTENT_WIDTH }}>
                <PlanReviewLines rows={section.rows} />
              </Box>
            ) : null}
          </FlexColumn>
        )
      )}
      {onReplan ? (
        <FlexRow gap={GAP.normal} justify="flex-start">
          <EditorButton
            variant="outlined"
            onClick={onReplan}
            disabled={replanPending}
          >
            {replanLabel}
          </EditorButton>
        </FlexRow>
      ) : null}
    </FlexColumn>
  );
};

export const PlanReview = memo(PlanReviewInternal);
PlanReview.displayName = "PlanReview";

export default PlanReview;
