import React, { useCallback, useState } from "react";
import {
  Button,
  Caption,
  EmptyState,
  FlexColumn,
  SearchInput,
  SPACING
} from "../../ui_primitives";

// These aliases make controls discoverable while their section is unmounted.
const SECTION_CONTROLS: Readonly<Record<string, string>> = {
  Media: "type asset parent group",
  Timing: "start duration speed playback hidden",
  Render: "opacity blend volume mute fade in fade out",
  Audio: "volume gain mute fade in fade out",
  Transform: "position scale rotation anchor crop radius",
  Color:
    "brightness contrast saturation hue temperature tint shadows highlights",
  Effects:
    "blur radius glow shadow vignette sharpen chroma key curves levels lift gamma gain grain",
  Transition: "wipe crossfade direction easing duration",
  Mask: "rectangle ellipse feather invert",
  Matte: "source alpha luma invert",
  Animate: "animation preset motion curve keyframes",
  Keyframes: "animation property curve easing",
  Text: "font family size color align stroke spacing",
  Shape: "geometry fill stroke dash points",
  "Time remap": "speed freeze reverse playback",
  "Smart Reframe": "crop subject focus zoom",
  "Audio drive": "reactive envelope frequency band strength",
  Caption: "font size color spoken bottom outline scrim"
};
const SEARCH_SECTIONS = Object.entries(SECTION_CONTROLS).sort(
  ([a], [b]) => b.length - a.length
);

interface SearchResult {
  title: string;
  header: HTMLElement;
}

interface InspectorSearchProps {
  contentRef: React.RefObject<HTMLDivElement | null>;
}

export default function InspectorSearch({ contentRef }: InspectorSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);

  const search = useCallback(
    (value: string) => {
      setQuery(value);
      const words = value.trim().toLowerCase().split(/\s+/);
      // Search only this inspector's mounted section headers. This naturally
      // respects clip type, generated panels and other open timeline tabs.
      const headers = contentRef.current?.querySelectorAll<HTMLElement>(
        '[role="button"][aria-expanded]'
      );
      setResults(
        Array.from(headers ?? []).flatMap((header) => {
          const heading = header.textContent?.trim() ?? "";
          const section = SEARCH_SECTIONS.find(([name]) =>
            heading.toLowerCase().startsWith(name.toLowerCase())
          );
          const title = section?.[0] ?? heading;
          const aliases = section?.[1] ?? "";
          const text = `${title} ${aliases}`.toLowerCase();
          return words.every((word) => text.includes(word))
            ? [{ title, header }]
            : [];
        })
      );
    },
    [contentRef]
  );

  const reveal = useCallback((result: SearchResult) => {
    if (result.header.getAttribute("aria-expanded") === "false") {
      result.header.click();
    }
    setQuery("");
    setResults([]);
    result.header.focus();
    result.header.scrollIntoView?.({ block: "nearest" });
  }, []);

  const submit = useCallback(() => {
    if (results.length === 1) {
      reveal(results[0]);
    }
  }, [results, reveal]);

  return (
    <FlexColumn gap={SPACING.xs} sx={{ px: SPACING.lg, pt: SPACING.md }}>
      <SearchInput
        value={query}
        onChange={search}
        onSubmit={submit}
        placeholder="Find a control"
        fullWidth
      />
      {query.trim() && (
        <FlexColumn
          gap={SPACING.none}
          role="region"
          aria-label="Matching inspector sections"
        >
          <Caption color="muted">Jump to section</Caption>
          {results.map((result, index) => (
            <Button
              key={`${result.title}-${index}`}
              variant="text"
              size="small"
              onClick={() => reveal(result)}
              sx={{ justifyContent: "flex-start" }}
            >
              {result.title}
            </Button>
          ))}
          {results.length === 0 && (
            <EmptyState size="small" title="No matching controls" />
          )}
        </FlexColumn>
      )}
    </FlexColumn>
  );
}
