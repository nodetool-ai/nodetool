import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
  Tooltip,
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

const LICENSE_OPTIONS: readonly { value: LicenseType; key: string }[] = [
  { value: "all", key: "anyLicense" },
  { value: "commercial", key: "commercialAllowed" },
  { value: "modification", key: "modificationAllowed" }
];

const CATEGORY_KEYS: Readonly<
  Record<MediaType, readonly { value: string; key: string }[]>
> = {
  images: [
    { value: ANY, key: "anyCategory" },
    { value: "photograph", key: "photographs" },
    { value: "illustration", key: "illustrations" },
    { value: "digitized_artwork", key: "digitizedArtworks" }
  ],
  audio: [
    { value: ANY, key: "anyCategory" },
    { value: "music", key: "music" },
    { value: "sound_effect", key: "soundEffects" },
    { value: "podcast", key: "podcasts" },
    { value: "audiobook", key: "audiobooks" },
    { value: "news", key: "news" },
    { value: "pronunciation", key: "pronunciation" }
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

const ResultCredit: React.FC<ResultCreditProps> = ({ result }) => {
  const { t } = useTranslation();
  return (
    <FlexColumn sx={{ minWidth: 0 }}>
      <Box sx={{ ...TYPOGRAPHY.sans.label, minWidth: 0 }}>
        <TruncatedText variant="inherit">
          {result.title || t("i18n-next1.openverse.untitled")}
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
};

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
  const { t } = useTranslation();
  const licenseOptions: readonly SelectOption[] = LICENSE_OPTIONS.map(
    ({ value, key }) => ({
      value,
      label: t(`i18n-next1.openverse.licenses.${key}`)
    })
  );
  const categoryOptions: Readonly<Record<MediaType, readonly SelectOption[]>> =
    {
      images: CATEGORY_KEYS.images.map(({ value, key }) => ({
        value,
        label: t(`i18n-next1.openverse.categories.${key}`)
      })),
      audio: CATEGORY_KEYS.audio.map(({ value, key }) => ({
        value,
        label: t(`i18n-next1.openverse.categories.${key}`)
      }))
    };
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
          content: t("i18n-next1.openverse.addedFiles", {
            count: assets.length
          })
        });
      }
      if (failed.length > 0) {
        addNotification({
          type: "error",
          content: t("i18n-next1.openverse.failedFiles", {
            count: failed.length,
            error: failed[0]?.error ?? ""
          })
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
          title={t("i18n-next1.openverse.searchTitle")}
          description={t("i18n-next1.openverse.searchDescription")}
        />
      );
    }
    if (search.isLoading) {
      return <LoadingSpinner text={t("i18n-next1.openverse.searching")} />;
    }
    if (search.error) {
      return (
        <AlertBanner
          severity="error"
          title={t("i18n-next1.openverse.searchFailed")}
        >
          {search.error.message}
        </AlertBanner>
      );
    }
    if (results.length === 0) {
      return (
        <EmptyState
          variant="no-results"
          title={t("i18n-next1.openverse.noResults")}
          description={t("i18n-next1.openverse.noResultsDescription")}
        />
      );
    }
    if (mediaType === "images") {
      return (
        <AutoGrid
          minItemWidth={TILE_MIN_WIDTH}
          gap={SPACING.sm}
          role="group"
          aria-label={t("i18n-next1.openverse.imagesGroup")}
        >
          {results.map((result) => {
            const isSelected = selected.has(result.id);
            return (
              <Tooltip key={result.id} title={result.attribution}>
                <FlexColumn
                  component="button"
                  aria-pressed={isSelected}
                  aria-label={t("i18n-next1.openverse.resultLabel", {
                    title: result.title || t("i18n-next1.openverse.untitled"),
                    license: openverseLicenseLabel(result)
                  })}
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
                    alt={result.title || t("i18n-next1.openverse.imageAlt")}
                    aspectRatio="4 / 3"
                    fit="cover"
                    loading="lazy"
                    showErrorFallback
                  />
                  <ResultCredit result={result} />
                </FlexColumn>
              </Tooltip>
            );
          })}
        </AutoGrid>
      );
    }
    return (
      <FlexColumn
        gap={SPACING.xs}
        role="list"
        aria-label={t("i18n-next1.openverse.audioGroup")}
      >
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
                "aria-label": t("i18n-next1.openverse.selectTrack", {
                  title: result.title || t("i18n-next1.openverse.untitledTrack")
                })
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
        {t("i18n-next1.openverse.licenseNotice")}
      </Caption>
      {pageCount > 1 && (
        <FlexRow align="center" gap={SPACING.xs}>
          <EditorButton
            variant="text"
            density="compact"
            disabled={page <= 1 || search.isFetching}
            onClick={() => setPage((current) => current - 1)}
          >
            {t("i18n-next1.openverse.previous")}
          </EditorButton>
          <Caption>
            {t("i18n-next1.openverse.pageOf", {
              page,
              total: Math.min(pageCount, 12)
            })}
          </Caption>
          <EditorButton
            variant="text"
            density="compact"
            disabled={page >= Math.min(pageCount, 12) || search.isFetching}
            onClick={() => setPage((current) => current + 1)}
          >
            {t("i18n-next1.openverse.next")}
          </EditorButton>
        </FlexRow>
      )}
      <EditorButton variant="text" onClick={onClose}>
        {t("i18n-next1.openverse.close")}
      </EditorButton>
      <EditorButton
        variant="contained"
        disabled={selected.size === 0 || busy}
        onClick={handleImport}
      >
        {busy
          ? t("i18n-next1.openverse.adding")
          : selected.size > 0
            ? t("i18n-next1.openverse.addSelected", { count: selected.size })
            : t("i18n-next1.openverse.addToAssets")}
      </EditorButton>
    </FlexRow>
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("i18n-next1.openverse.title")}
      maxWidth="lg"
      fullWidth
      actions={actions}
    >
      <FlexColumn gap={SPACING.md} sx={{ minHeight: 0 }}>
        <FlexRow align="center" gap={SPACING.sm} wrap>
          <ToggleGroup
            exclusive
            size="small"
            aria-label={t("i18n-next1.openverse.mediaType")}
            value={mediaType}
            onChange={(_event, value: MediaType | null) => {
              if (value) {
                setMediaType(value);
                setCategory(ANY);
                resetResults();
              }
            }}
          >
            <ToggleOption value="images">
              {t("i18n-next1.openverse.images")}
            </ToggleOption>
            <ToggleOption value="audio">
              {t("i18n-next1.openverse.audio")}
            </ToggleOption>
          </ToggleGroup>
          <Box sx={{ flex: 1, minWidth: 200 }}>
            <SearchInput
              value={draft}
              onChange={setDraft}
              onSubmit={handleSubmit}
              onClear={() => handleSubmit("")}
              placeholder={
                mediaType === "images"
                  ? t("i18n-next1.openverse.searchImagesPlaceholder")
                  : t("i18n-next1.openverse.searchAudioPlaceholder")
              }
              ariaLabel={t("i18n-next1.openverse.searchLabel")}
              autoFocus
              fullWidth
              loading={search.isFetching}
            />
          </Box>
          <SelectField
            label={t("i18n-next1.openverse.license")}
            hideLabel
            value={licenseType}
            options={licenseOptions}
            onChange={(value) => {
              setLicenseType(value as LicenseType);
              resetResults();
            }}
            size="small"
          />
          <SelectField
            label={t("i18n-next1.openverse.category")}
            hideLabel
            value={category}
            options={categoryOptions[mediaType]}
            onChange={(value) => {
              setCategory(value);
              resetResults();
            }}
            size="small"
          />
        </FlexRow>
        {search.data && (
          <Caption>
            {t("i18n-next1.openverse.resultCount", {
              count: search.data.result_count
            })}
            {selected.size >= MAX_IMPORT
              ? ` ${t("i18n-next1.openverse.maxImportNotice", { count: MAX_IMPORT })}`
              : ""}
          </Caption>
        )}
        <ScrollArea sx={{ maxHeight: "60vh" }}>{body}</ScrollArea>
      </FlexColumn>
    </Dialog>
  );
};

export default OpenverseDialog;
