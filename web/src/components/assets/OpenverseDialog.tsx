import React, { useCallback, useMemo, useState } from "react";
import type { RouterOutputs } from "../../trpc/client";
import { trpc } from "../../trpc/client";
import { useNotificationStore } from "../../stores/NotificationStore";
import useAssets from "../../serverState/useAssets";
import {
  AlertBanner,
  AudioPlayback,
  AutoGrid,
  Box,
  Caption,
  Checkbox,
  Dialog,
  EditorButton,
  EmptyState,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  ResponsiveImage,
  ScrollArea,
  SearchInput,
  SelectField,
  SPACING,
  TextLink,
  ToggleGroup,
  ToggleOption,
  TruncatedText,
  TYPOGRAPHY,
  selectableTileStyles,
  type SelectOption
} from "../ui_primitives";
import { openverseLicenseLabel } from "../../utils/openverseLicense";

type MediaType = "images" | "audio";
type LicenseType = "all" | "commercial" | "modification";
type OpenverseResult = RouterOutputs["openverse"]["search"]["results"][number];

const ANY = "any";
/** The import procedure accepts at most this many ids per call. */
export const MAX_IMPORT = 20;
const TILE_MIN_WIDTH = 160;

const LICENSE_OPTIONS: readonly SelectOption[] = [
  { value: "all", label: "Any license" },
  { value: "commercial", label: "Commercial use allowed" },
  { value: "modification", label: "Modification allowed" }
];

const CATEGORY_OPTIONS: Readonly<Record<MediaType, readonly SelectOption[]>> = {
  images: [
    { value: ANY, label: "Any category" },
    { value: "photograph", label: "Photographs" },
    { value: "illustration", label: "Illustrations" },
    { value: "digitized_artwork", label: "Digitized artworks" }
  ],
  audio: [
    { value: ANY, label: "Any category" },
    { value: "music", label: "Music" },
    { value: "sound_effect", label: "Sound effects" },
    { value: "podcast", label: "Podcasts" },
    { value: "audiobook", label: "Audiobooks" },
    { value: "news", label: "News" },
    { value: "pronunciation", label: "Pronunciation" }
  ]
};

function formatDuration(seconds: number | null): string | null {
  if (seconds === null) {
    return null;
  }
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

interface ResultCreditProps {
  result: OpenverseResult;
}

const ResultCredit: React.FC<ResultCreditProps> = ({ result }) => (
  <FlexColumn sx={{ minWidth: 0 }}>
    <Box sx={{ ...TYPOGRAPHY.sans.label, minWidth: 0 }}>
      <TruncatedText variant="inherit">
        {result.title || "Untitled"}
      </TruncatedText>
    </Box>
    <Caption>
      <TruncatedText variant="inherit">
        {[result.creator, result.source].filter(Boolean).join(" · ")}
      </TruncatedText>
    </Caption>
    <Caption>
      {result.landing_url ? (
        <TextLink
          href={result.landing_url}
          external
          onClick={(event: React.MouseEvent) => event.stopPropagation()}
        >
          {openverseLicenseLabel(result)}
        </TextLink>
      ) : (
        openverseLicenseLabel(result)
      )}
    </Caption>
  </FlexColumn>
);

interface OpenverseDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Search Openverse for Creative Commons and public-domain images and audio,
 * and add the chosen results to the current asset folder. The server downloads
 * each file and stores its license and attribution in the asset's metadata.
 */
const OpenverseDialog: React.FC<OpenverseDialogProps> = ({ open, onClose }) => {
  const [mediaType, setMediaType] = useState<MediaType>("images");
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [licenseType, setLicenseType] = useState<LicenseType>("all");
  const [category, setCategory] = useState<string>(ANY);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const { currentFolderId, projectId, refetchAssetsAndFolders } = useAssets();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const search = trpc.openverse.search.useQuery(
    {
      media_type: mediaType,
      q: query,
      license_type: licenseType,
      category: category === ANY ? undefined : category,
      page
    },
    {
      enabled: open && query.length > 0,
      staleTime: 5 * 60 * 1000,
      retry: false
    }
  );
  const results = useMemo(() => search.data?.results ?? [], [search.data]);

  const importMutation = trpc.openverse.import.useMutation({
    onSuccess: ({ assets, failed }) => {
      refetchAssetsAndFolders();
      setSelected(new Set());
      if (assets.length > 0) {
        addNotification({
          type: "success",
          content: `Added ${assets.length} ${assets.length === 1 ? "file" : "files"} from Openverse. The license is saved with each asset.`
        });
      }
      if (failed.length > 0) {
        addNotification({
          type: "error",
          content: `${failed.length} could not be added: ${failed[0]?.error ?? ""}`
        });
      }
    }
  });

  const resetResults = useCallback(() => {
    setPage(1);
    setSelected(new Set());
  }, []);

  const handleSubmit = useCallback(
    (value: string) => {
      setQuery(value.trim());
      resetResults();
    },
    [resetResults]
  );

  const toggle = useCallback((id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX_IMPORT) {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleImport = useCallback(() => {
    importMutation.mutate({
      media_type: mediaType,
      ids: [...selected],
      parent_id: currentFolderId ?? undefined,
      project_id: projectId ?? undefined
    });
  }, [importMutation, mediaType, selected, currentFolderId, projectId]);

  const pageCount = search.data?.page_count ?? 0;
  const busy = importMutation.isPending;

  const body = (() => {
    if (!query) {
      return (
        <EmptyState
          title="Search openly licensed media"
          description="Openverse indexes Creative Commons and public-domain images and audio from Flickr, Wikimedia, Freesound and other collections."
        />
      );
    }
    if (search.isLoading) {
      return <LoadingSpinner text="Searching Openverse" />;
    }
    if (search.error) {
      return (
        <AlertBanner severity="error" title="Search failed">
          {search.error.message}
        </AlertBanner>
      );
    }
    if (results.length === 0) {
      return (
        <EmptyState
          variant="no-results"
          title="No results"
          description="Try other words, or allow more licenses."
        />
      );
    }
    if (mediaType === "images") {
      return (
        <AutoGrid
          minItemWidth={TILE_MIN_WIDTH}
          gap={SPACING.sm}
          role="group"
          aria-label="Openverse images"
        >
          {results.map((result) => {
            const isSelected = selected.has(result.id);
            return (
              <FlexColumn
                key={result.id}
                component="button"
                aria-pressed={isSelected}
                aria-label={`${result.title || "Untitled"}, ${openverseLicenseLabel(result)}`}
                title={result.attribution}
                onClick={() => toggle(result.id)}
                gap={SPACING.xs}
                sx={(theme) => ({
                  ...selectableTileStyles(theme, { selected: isSelected }),
                  minWidth: 0,
                  p: SPACING.xs,
                  bgcolor: "transparent",
                  color: "text.primary",
                  font: "inherit",
                  textAlign: "left",
                  cursor: "pointer"
                })}
              >
                <ResponsiveImage
                  locator={result.thumbnail || result.url}
                  alt={result.title || "Openverse image"}
                  aspectRatio="4 / 3"
                  fit="cover"
                  loading="lazy"
                  showErrorFallback
                />
                <ResultCredit result={result} />
              </FlexColumn>
            );
          })}
        </AutoGrid>
      );
    }
    return (
      <FlexColumn gap={SPACING.xs} role="list" aria-label="Openverse audio">
        {results.map((result) => (
          <FlexRow
            key={result.id}
            role="listitem"
            align="center"
            gap={SPACING.sm}
            sx={(theme) => ({
              ...selectableTileStyles(theme, {
                selected: selected.has(result.id)
              }),
              p: SPACING.xs
            })}
          >
            <Checkbox
              checked={selected.has(result.id)}
              onChange={() => toggle(result.id)}
              inputProps={{
                "aria-label": `Select ${result.title || "untitled track"}`
              }}
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <ResultCredit result={result} />
            </Box>
            {formatDuration(result.duration_seconds) && (
              <Caption>{formatDuration(result.duration_seconds)}</Caption>
            )}
            <Box sx={{ width: 240, flexShrink: 0 }}>
              <AudioPlayback locator={result.url} label={result.title} />
            </Box>
          </FlexRow>
        ))}
      </FlexColumn>
    );
  })();

  const actions = (
    <FlexRow align="center" gap={SPACING.sm} sx={{ width: "100%" }}>
      <Caption sx={{ flex: 1 }}>
        Openverse does not guarantee license data. Check the source page before
        publishing.
      </Caption>
      {pageCount > 1 && (
        <FlexRow align="center" gap={SPACING.xs}>
          <EditorButton
            variant="text"
            density="compact"
            disabled={page <= 1 || search.isFetching}
            onClick={() => setPage((current) => current - 1)}
          >
            Previous
          </EditorButton>
          <Caption>
            Page {page} of {Math.min(pageCount, 12)}
          </Caption>
          <EditorButton
            variant="text"
            density="compact"
            disabled={page >= Math.min(pageCount, 12) || search.isFetching}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </EditorButton>
        </FlexRow>
      )}
      <EditorButton variant="text" onClick={onClose}>
        Close
      </EditorButton>
      <EditorButton
        variant="contained"
        disabled={selected.size === 0 || busy}
        onClick={handleImport}
      >
        {busy
          ? "Adding…"
          : selected.size > 0
            ? `Add ${selected.size} to assets`
            : "Add to assets"}
      </EditorButton>
    </FlexRow>
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Openverse"
      maxWidth="lg"
      fullWidth
      actions={actions}
    >
      <FlexColumn gap={SPACING.md} sx={{ minHeight: 0 }}>
        <FlexRow align="center" gap={SPACING.sm} wrap>
          <ToggleGroup
            exclusive
            size="small"
            aria-label="Media type"
            value={mediaType}
            onChange={(_event, value: MediaType | null) => {
              if (value) {
                setMediaType(value);
                setCategory(ANY);
                resetResults();
              }
            }}
          >
            <ToggleOption value="images">Images</ToggleOption>
            <ToggleOption value="audio">Audio</ToggleOption>
          </ToggleGroup>
          <Box sx={{ flex: 1, minWidth: 200 }}>
            <SearchInput
              value={draft}
              onChange={setDraft}
              onSubmit={handleSubmit}
              onClear={() => handleSubmit("")}
              placeholder={
                mediaType === "images"
                  ? "Search images, e.g. mountain lake"
                  : "Search audio, e.g. rain on window"
              }
              ariaLabel="Search Openverse"
              autoFocus
              fullWidth
              loading={search.isFetching}
            />
          </Box>
          <SelectField
            label="License"
            hideLabel
            value={licenseType}
            options={LICENSE_OPTIONS}
            onChange={(value) => {
              setLicenseType(value as LicenseType);
              resetResults();
            }}
            size="small"
          />
          <SelectField
            label="Category"
            hideLabel
            value={category}
            options={CATEGORY_OPTIONS[mediaType]}
            onChange={(value) => {
              setCategory(value);
              resetResults();
            }}
            size="small"
          />
        </FlexRow>
        {search.data && (
          <Caption>
            {search.data.result_count.toLocaleString()} results
            {selected.size >= MAX_IMPORT
              ? `. Up to ${MAX_IMPORT} can be added at once.`
              : ""}
          </Caption>
        )}
        <ScrollArea sx={{ maxHeight: "60vh" }}>{body}</ScrollArea>
      </FlexColumn>
    </Dialog>
  );
};

export default OpenverseDialog;
