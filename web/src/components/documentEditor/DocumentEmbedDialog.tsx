/**
 * Insert media into a document: an image, video, audio clip or 3D model from
 * the project's assets, an uploaded file, a path or URL, or a storyboard shot.
 * Picking an item inserts it at the caret and closes the dialog.
 */
import {
  memo,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode
} from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import ViewInArOutlinedIcon from "@mui/icons-material/ViewInArOutlined";
import {
  embedKindFromContentType,
  shotEmbedSrc,
  type DocumentEmbedKind,
  type Shot
} from "@nodetool-ai/protocol";

import type { Asset } from "../../stores/ApiTypes";
import { trpc, trpcClient } from "../../trpc/client";
import { useStoryboards } from "../../hooks/storyboard/useStoryboards";
import ErrorBanner from "../support/ErrorBanner";
import {
  AutoGrid,
  BORDER_RADIUS,
  Box,
  Caption,
  Dialog,
  EditorButton,
  EmptyState,
  FlexColumn,
  FlexRow,
  GAP,
  LoadingSpinner,
  MediaThumbnail,
  ScrollArea,
  SearchInput,
  SelectField,
  SPACING,
  TabGroup,
  Text,
  TextInput,
  selectableTileStyles
} from "../ui_primitives";
import { useDocumentLocation } from "./documentEditorContext";
import {
  embedForAsset,
  hasMedia,
  isEmbeddableFile,
  shotLabel,
  uploadEmbedFile,
  type DocumentEmbedInsert
} from "./documentEmbeds";

type EmbedTab = "media" | "shot";
type KindFilter = "all" | DocumentEmbedKind;

interface DocumentEmbedDialogProps {
  open: boolean;
  onClose: () => void;
  onInsert: (embeds: DocumentEmbedInsert[]) => void;
}

const TILE_MIN_WIDTH = 140;

interface PickTileProps {
  label: string;
  ariaLabel: string;
  onPick: () => void;
  children: ReactNode;
}

/** A clickable media tile with its name below. */
const PickTile = ({ label, ariaLabel, onPick, children }: PickTileProps) => {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onPick();
    }
  };
  return (
    <FlexColumn
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={onPick}
      onKeyDown={onKeyDown}
      gap={SPACING.xs}
      sx={(theme) => ({
        ...selectableTileStyles(theme),
        p: SPACING.xs,
        minWidth: 0,
        cursor: "pointer"
      })}
    >
      {children}
      <Text size="small" truncate>
        {label}
      </Text>
    </FlexColumn>
  );
};

const MediaTab = ({
  onInsert
}: {
  onInsert: (embeds: DocumentEmbedInsert[]) => void;
}) => {
  const { t } = useTranslation();
  const location = useDocumentLocation();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [link, setLink] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["document-embed-assets", location.projectId ?? "", query],
    queryFn: async (): Promise<Asset[]> => {
      const result = await trpcClient.assets.search.query({
        query,
        page_size: 500,
        project_id: location.projectId ?? undefined
      });
      return (result.assets as Asset[]).filter(
        (asset) => embedKindFromContentType(asset.content_type) !== null
      );
    },
    staleTime: 30_000
  });
  const assets = useMemo(
    () =>
      (data ?? []).filter(
        (asset) =>
          kind === "all" || embedKindFromContentType(asset.content_type) === kind
      ),
    [data, kind]
  );

  const kindOptions = useMemo(
    () => [
      { value: "all", label: t("documentEditor.embed.kindAll") },
      { value: "image", label: t("documentEditor.embed.kindImage") },
      { value: "video", label: t("documentEditor.embed.kindVideo") },
      { value: "audio", label: t("documentEditor.embed.kindAudio") },
      { value: "model3d", label: t("documentEditor.embed.kindModel3d") }
    ],
    [t]
  );

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter(isEmbeddableFile);
    event.target.value = "";
    if (files.length === 0) {
      return;
    }
    setUploadError(null);
    setUploading(true);
    try {
      const embeds: DocumentEmbedInsert[] = [];
      for (const file of files) {
        embeds.push(await uploadEmbedFile(file, location));
      }
      onInsert(embeds);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : String(error));
    } finally {
      setUploading(false);
    }
  };

  return (
    <FlexColumn gap={GAP.normal}>
      <FlexRow gap={GAP.normal} align="flex-end">
        <Box sx={{ flex: 1 }}>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={t("documentEditor.embed.searchAssets")}
            ariaLabel={t("documentEditor.embed.searchAssets")}
            debounceMs={250}
            autoFocus
          />
        </Box>
        <Box sx={{ minWidth: "9rem" }}>
          <SelectField
            label={t("documentEditor.embed.kindLabel")}
            value={kind}
            onChange={(value) => setKind(value as KindFilter)}
            options={kindOptions}
            size="small"
          />
        </Box>
        <EditorButton
          variant="outlined"
          startIcon={<UploadFileOutlinedIcon fontSize="small" />}
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
        >
          {t("documentEditor.embed.upload")}
        </EditorButton>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          accept="image/*,video/*,audio/*,.glb,.gltf"
          data-testid="document-embed-file-input"
          onChange={(event) => void handleFiles(event)}
        />
      </FlexRow>
      {uploadError !== null && (
        <ErrorBanner
          report={{
            source: "operation-failure",
            summary: "Could not upload a file into a document",
            errorText: uploadError
          }}
          onDismiss={() => setUploadError(null)}
        >
          {t("documentEditor.embed.uploadFailed")}
        </ErrorBanner>
      )}
      {uploading ? (
        <FlexRow align="center" justify="center" sx={{ p: SPACING.lg }}>
          <LoadingSpinner text={t("documentEditor.embed.uploading")} />
        </FlexRow>
      ) : isLoading ? (
        <FlexRow align="center" justify="center" sx={{ p: SPACING.lg }}>
          <LoadingSpinner text={t("documentEditor.embed.loadingAssets")} />
        </FlexRow>
      ) : assets.length === 0 ? (
        <EmptyState
          variant="no-data"
          title={t("documentEditor.embed.noAssets")}
          description={t("documentEditor.embed.noAssetsDescription")}
          size="small"
        />
      ) : (
        <ScrollArea maxHeight="50vh" sx={{ width: "100%" }}>
          <AutoGrid minItemWidth={TILE_MIN_WIDTH} gap={SPACING.md} sx={{ width: "100%" }}>
            {assets.map((asset) => (
              <PickTile
                key={asset.id}
                label={asset.name}
                ariaLabel={t("documentEditor.embed.insertNamed", { name: asset.name })}
                onPick={() => onInsert([embedForAsset(asset, location)])}
              >
                <MediaThumbnail
                  asset={asset}
                  alt={asset.name}
                  aspectRatio="4/3"
                  borderRadius={BORDER_RADIUS.sm}
                  icon={
                    embedKindFromContentType(asset.content_type) === "model3d" ? (
                      <ViewInArOutlinedIcon />
                    ) : undefined
                  }
                />
              </PickTile>
            ))}
          </AutoGrid>
        </ScrollArea>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (link.trim() !== "") {
            onInsert([{ src: link.trim(), alt: "" }]);
          }
        }}
      >
        <FlexRow gap={GAP.normal} align="flex-end">
          <Box sx={{ flex: 1 }}>
            <TextInput
              compact
              label={t("documentEditor.embed.linkLabel")}
              placeholder={t("documentEditor.embed.linkPlaceholder")}
              value={link}
              onChange={(event) => setLink(event.target.value)}
            />
          </Box>
          <EditorButton type="submit" variant="outlined" disabled={link.trim() === ""}>
            {t("documentEditor.embed.insert")}
          </EditorButton>
        </FlexRow>
      </form>
    </FlexColumn>
  );
};

const ShotTab = ({
  onInsert
}: {
  onInsert: (embeds: DocumentEmbedInsert[]) => void;
}) => {
  const { t } = useTranslation();
  const { projectId } = useDocumentLocation();
  const { data: boards, isLoading: boardsLoading } = useStoryboards(
    projectId ?? undefined
  );
  const [boardId, setBoardId] = useState("");
  const selectedBoard = boardId || boards?.[0]?.id || "";
  const { data: board, isLoading: boardLoading } = trpc.storyboards.get.useQuery(
    { id: selectedBoard },
    { enabled: selectedBoard !== "", staleTime: 30_000, retry: false }
  );
  // SAFETY: the wire document's `shots` is the passthrough zod mirror of
  // `Shot`, as in LinkShotDialog.
  const shots = useMemo(
    () =>
      [...((board?.document.shots ?? []) as Shot[])].sort(
        (a, b) => a.index - b.index
      ),
    [board]
  );

  if (boardsLoading) {
    return (
      <FlexRow align="center" justify="center" sx={{ p: SPACING.lg }}>
        <LoadingSpinner text={t("documentEditor.embed.loadingStoryboards")} />
      </FlexRow>
    );
  }
  if (!boards || boards.length === 0) {
    return (
      <EmptyState
        variant="no-data"
        title={t("documentEditor.embed.noStoryboards")}
        description={t("documentEditor.embed.noStoryboardsDescription")}
        size="small"
      />
    );
  }
  return (
    <FlexColumn gap={GAP.normal}>
      <SelectField
        label={t("documentEditor.embed.storyboardLabel")}
        value={selectedBoard}
        onChange={setBoardId}
        options={boards.map((item) => ({
          value: item.id,
          label: item.name || t("documentEditor.embed.untitledStoryboard")
        }))}
        size="small"
      />
      {boardLoading ? (
        <FlexRow align="center" justify="center" sx={{ p: SPACING.lg }}>
          <LoadingSpinner />
        </FlexRow>
      ) : shots.length === 0 ? (
        <EmptyState
          variant="no-data"
          title={t("documentEditor.embed.noShots")}
          size="small"
        />
      ) : (
        <ScrollArea maxHeight="50vh" sx={{ width: "100%" }}>
          <AutoGrid minItemWidth={TILE_MIN_WIDTH} gap={SPACING.md} sx={{ width: "100%" }}>
            {shots.map((shot) => {
              const title = shotLabel(shot);
              const still = hasMedia(shot.keyframe) ? shot.keyframe : null;
              const clip = hasMedia(shot.clip) ? shot.clip : null;
              return (
                <PickTile
                  key={shot.id}
                  label={title}
                  ariaLabel={t("documentEditor.embed.insertNamed", { name: title })}
                  onPick={() =>
                    onInsert([{ src: shotEmbedSrc(selectedBoard, shot.id), alt: title }])
                  }
                >
                  <MediaThumbnail
                    locator={still ?? clip ?? undefined}
                    kind={still ? "image" : "video"}
                    alt={title}
                    aspectRatio="16/9"
                    borderRadius={BORDER_RADIUS.sm}
                  />
                </PickTile>
              );
            })}
          </AutoGrid>
        </ScrollArea>
      )}
      <Caption color="muted">{t("documentEditor.embed.shotHint")}</Caption>
    </FlexColumn>
  );
};

const DocumentEmbedDialog = ({ open, onClose, onInsert }: DocumentEmbedDialogProps) => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<EmbedTab>("media");
  const insert = (embeds: DocumentEmbedInsert[]) => {
    onInsert(embeds);
    onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("documentEditor.embed.title")}
      maxWidth="md"
      fullWidth
    >
      <FlexColumn gap={GAP.normal}>
        <TabGroup
          value={tab}
          onChange={(value) => setTab(value as EmbedTab)}
          tabs={[
            { value: "media", label: t("documentEditor.embed.tabMedia") },
            { value: "shot", label: t("documentEditor.embed.tabShot") }
          ]}
          size="small"
        />
        {open && (tab === "media" ? <MediaTab onInsert={insert} /> : <ShotTab onInsert={insert} />)}
      </FlexColumn>
    </Dialog>
  );
};

export default memo(DocumentEmbedDialog);
