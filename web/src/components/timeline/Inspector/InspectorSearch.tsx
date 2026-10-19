import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Caption,
  EmptyState,
  FlexColumn,
  SearchInput,
  SPACING
} from "../../ui_primitives";

interface SearchResult {
  title: string;
  header: HTMLElement;
}

interface InspectorSearchProps {
  contentRef: React.RefObject<HTMLDivElement | null>;
}

export default function InspectorSearch({ contentRef }: InspectorSearchProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);

  // Localized aliases make controls discoverable while their section is unmounted.
  const searchSections = useMemo(
    (): ReadonlyArray<readonly [string, string, string]> =>
      [
        [
          t("i18n-cont-inspector-02.search.sections.media.title"),
          t("i18n-cont-inspector-02.search.sections.media.aliases"),
          t("i18n-cont-inspector-02.search.sections.media.legacyTitle")
        ],
        [
          t("i18n-cont-inspector-02.search.sections.timing.title"),
          t("i18n-cont-inspector-02.search.sections.timing.aliases"),
          t("i18n-cont-inspector-02.search.sections.timing.legacyTitle")
        ],
        [
          t("i18n-cont-inspector-02.search.sections.render.title"),
          t("i18n-cont-inspector-02.search.sections.render.aliases"),
          t("i18n-cont-inspector-02.search.sections.render.legacyTitle")
        ],
        [
          t("i18n-cont-inspector-02.search.sections.audio.title"),
          t("i18n-cont-inspector-02.search.sections.audio.aliases"),
          t("i18n-cont-inspector-02.search.sections.audio.legacyTitle")
        ],
        [
          t("i18n-cont-inspector-02.search.sections.transform.title"),
          t("i18n-cont-inspector-02.search.sections.transform.aliases"),
          t("i18n-cont-inspector-02.search.sections.transform.legacyTitle")
        ],
        [
          t("i18n-cont-inspector-02.search.sections.color.title"),
          t("i18n-cont-inspector-02.search.sections.color.aliases"),
          t("i18n-cont-inspector-02.search.sections.color.legacyTitle")
        ],
        [
          t("i18n-cont-inspector-02.search.sections.effects.title"),
          t("i18n-cont-inspector-02.search.sections.effects.aliases"),
          t("i18n-cont-inspector-02.search.sections.effects.legacyTitle")
        ],
        [
          t("i18n-cont-inspector-02.search.sections.transition.title"),
          t("i18n-cont-inspector-02.search.sections.transition.aliases"),
          t("i18n-cont-inspector-02.search.sections.transition.legacyTitle")
        ],
        [
          t("i18n-cont-inspector-02.search.sections.mask.title"),
          t("i18n-cont-inspector-02.search.sections.mask.aliases"),
          t("i18n-cont-inspector-02.search.sections.mask.legacyTitle")
        ],
        [
          t("i18n-cont-inspector-02.search.sections.matte.title"),
          t("i18n-cont-inspector-02.search.sections.matte.aliases"),
          t("i18n-cont-inspector-02.search.sections.matte.legacyTitle")
        ],
        [
          t("i18n-cont-inspector-02.search.sections.animate.title"),
          t("i18n-cont-inspector-02.search.sections.animate.aliases"),
          t("i18n-cont-inspector-02.search.sections.animate.legacyTitle")
        ],
        [
          t("i18n-cont-inspector-02.search.sections.keyframes.title"),
          t("i18n-cont-inspector-02.search.sections.keyframes.aliases"),
          t("i18n-cont-inspector-02.search.sections.keyframes.legacyTitle")
        ],
        [
          t("i18n-cont-inspector-02.search.sections.text.title"),
          t("i18n-cont-inspector-02.search.sections.text.aliases"),
          t("i18n-cont-inspector-02.search.sections.text.legacyTitle")
        ],
        [
          t("i18n-cont-inspector-02.search.sections.shape.title"),
          t("i18n-cont-inspector-02.search.sections.shape.aliases"),
          t("i18n-cont-inspector-02.search.sections.shape.legacyTitle")
        ],
        [
          t("i18n-cont-inspector-02.search.sections.timeRemap.title"),
          t("i18n-cont-inspector-02.search.sections.timeRemap.aliases"),
          t("i18n-cont-inspector-02.search.sections.timeRemap.legacyTitle")
        ],
        [
          t("i18n-cont-inspector-02.search.sections.smartReframe.title"),
          t("i18n-cont-inspector-02.search.sections.smartReframe.aliases"),
          t("i18n-cont-inspector-02.search.sections.smartReframe.legacyTitle")
        ],
        [
          t("i18n-cont-inspector-02.search.sections.audioDrive.title"),
          t("i18n-cont-inspector-02.search.sections.audioDrive.aliases"),
          t("i18n-cont-inspector-02.search.sections.audioDrive.legacyTitle")
        ],
        [
          t("i18n-cont-inspector-02.search.sections.caption.title"),
          t("i18n-cont-inspector-02.search.sections.caption.aliases"),
          t("i18n-cont-inspector-02.search.sections.caption.legacyTitle")
        ]
      ].sort(([a], [b]) => b.length - a.length),
    [t]
  );

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
          const section = searchSections.find(([title, , englishTitle]) =>
            heading.toLowerCase().startsWith(title.toLowerCase()) ||
            heading.toLowerCase().startsWith(englishTitle.toLowerCase())
          );
          const title = section?.[0] ?? heading;
          const aliases = section?.[1] ?? "";
          const text = `${title} ${aliases} ${section?.[2] ?? ""}`.toLowerCase();
          return words.every((word) => text.includes(word))
            ? [{ title, header }]
            : [];
        })
      );
    },
    [contentRef, searchSections]
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
        placeholder={t("i18n-cont-inspector-02.search.placeholder")}
        fullWidth
      />
      {query.trim() && (
        <FlexColumn
          gap={SPACING.none}
          role="region"
          aria-label={t("i18n-cont-inspector-02.search.matchingSections")}
        >
          <Caption color="muted">
            {t("i18n-cont-inspector-02.search.jumpToSection")}
          </Caption>
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
            <EmptyState
              size="small"
              title={t("i18n-cont-inspector-02.search.noMatchingControls")}
            />
          )}
        </FlexColumn>
      )}
    </FlexColumn>
  );
}
