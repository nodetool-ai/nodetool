/**
 * The library group of the command palette (docs/plans/library-search.md,
 * D20, D22, D25). Typed text goes to `search.query` after a short pause, and
 * each hit opens its item. The server already ranked the hits, so cmdk's own
 * filter is bypassed with `forceMount`. While the index has work, one line
 * says how much. On desktop, the first open offers search by meaning once.
 */
import React, { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Command } from "cmdk";
import type { ResourceKind, SearchKind } from "@nodetool-ai/protocol";
import type { SearchHit } from "@nodetool-ai/protocol/api-schemas/search.js";

import { runCommandAndClose } from "../../stores/CommandMenuStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { useProjects } from "../../hooks/useProjects";
import {
  LIBRARY_QUERY_MIN_CHARS,
  libraryIndexBusy,
  useLibrarySearch,
  useLibrarySearchSetup,
  useLibrarySearchStatus
} from "../../serverState/useLibrarySearch";
import { TYPE_GLYPH } from "../workspace/tabTypeIdentity";
import { openSettingsTab } from "../workspace/openPageTab";
import ErrorBanner from "../support/ErrorBanner";
import {
  BORDER_RADIUS,
  Caption,
  FlexColumn,
  FlexRow,
  GAP,
  PADDING,
  ResponsiveImage,
  SPACING_PX,
  Text
} from "../ui_primitives";
import { openResource } from "../../lib/chat/openResource";
import { isElectron } from "../../utils/browser";

const KIND_GLYPH: Record<SearchKind, string> = {
  image: TYPE_GLYPH.image,
  video: TYPE_GLYPH.timeline,
  audio: TYPE_GLYPH.audio,
  model_3d: TYPE_GLYPH.model3d,
  document: TYPE_GLYPH.document,
  workflow: TYPE_GLYPH.workflow,
  application: TYPE_GLYPH.application,
  sketch: TYPE_GLYPH.sketch,
  script: TYPE_GLYPH.script,
  storyboard: TYPE_GLYPH.storyboard,
  timeline: TYPE_GLYPH.timeline,
  jsscript: TYPE_GLYPH.jsscript,
  game: TYPE_GLYPH.game,
  entity: TYPE_GLYPH.skill,
  file: TYPE_GLYPH.document
};

/** The resource each index table opens as. Project folder files open as file tabs instead. */
const RESOURCE_KIND: Record<Exclude<SearchHit["resource_type"], "project_file">, ResourceKind> = {
  asset: "asset",
  workflow: "workflow",
  application: "app",
  image_document: "sketch",
  script: "script",
  storyboard: "storyboard",
  timeline_sequence: "timeline",
  js_script: "jsscript",
  game: "game"
};

const THUMBNAIL_KINDS: ReadonlySet<SearchKind> = new Set(["image", "video"]);

const HitIcon = ({ hit }: { hit: SearchHit }): React.ReactElement =>
  hit.resource_type === "asset" && THUMBNAIL_KINDS.has(hit.kind) ? (
    <ResponsiveImage
      locator={`asset://${hit.resource_id}`}
      preferThumbnail
      alt=""
      loading="lazy"
      sx={{
        width: SPACING_PX.xxxl,
        height: SPACING_PX.xxxl,
        flexShrink: 0,
        objectFit: "cover",
        borderRadius: BORDER_RADIUS.sm
      }}
    />
  ) : (
    <Text
      size="normal"
      component="span"
      aria-hidden="true"
      sx={{ width: SPACING_PX.xxxl, flexShrink: 0, textAlign: "center" }}
    >
      {KIND_GLYPH[hit.kind]}
    </Text>
  );

interface LibrarySearchCommandsProps {
  /** The text in the palette's input. */
  search: string;
}

const LibrarySearchCommands: React.FC<LibrarySearchCommandsProps> = ({ search }) => {
  const { t } = useTranslation();
  const { query, data, isFetching, isError, error, retry } = useLibrarySearch(search, true);
  const { status } = useLibrarySearchStatus(true);
  const { setUp } = useLibrarySearchSetup();
  const { data: projects } = useProjects();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);

  const projectNames = useMemo(
    () => new Map((projects ?? []).map((project) => [project.id, project.name])),
    [projects]
  );
  const folderIds = useMemo(
    () => new Map((projects ?? []).map((project) => [project.id, project.folder?.workspace_id])),
    [projects]
  );
  const locationOf = useCallback(
    (hit: SearchHit): string =>
      [projectNames.get(hit.project_id), hit.folder_path].filter(Boolean).join(" / "),
    [projectNames]
  );

  const open = useCallback(
    (hit: SearchHit) => {
      if (hit.resource_type !== "project_file") {
        const kind = RESOURCE_KIND[hit.resource_type];
        runCommandAndClose(() => openResource({ kind, id: hit.resource_id }));
        return;
      }
      // The resource id is `<project id>:<path>`; the tab names the folder's workspace.
      const path = hit.resource_id.slice(hit.project_id.length + 1);
      const workspaceId = folderIds.get(hit.project_id);
      if (!workspaceId) {
        return;
      }
      runCommandAndClose(() =>
        openTab({
          type: "workspace-file",
          ref: `${workspaceId}::${path}`,
          mode: "view",
          title: hit.title,
          projectId: hit.project_id
        })
      );
    },
    [folderIds, openTab]
  );
  const chooseLocalModel = useCallback(() => {
    if (status) {
      void setUp({ provider: status.local_model.provider, model: status.local_model.model });
    }
  }, [setUp, status]);
  const chooseProviderModel = useCallback(() => {
    runCommandAndClose(() => openSettingsTab("integrations"));
  }, []);
  const notNow = useCallback(() => void setUp(null), [setUp]);

  const offerSetup =
    isElectron && !!status && status.can_set_up && status.semantic.choice === "unset" && search.trim() === "";
  const hits = data?.hits ?? [];
  const noMatch =
    !isError && !!data && hits.length === 0 && !isFetching && search.trim().length >= LIBRARY_QUERY_MIN_CHARS;

  return (
    <>
      {offerSetup && status && (
        <Command.Group heading={t("librarySearch.setup.heading")} forceMount>
          <Caption sx={{ px: PADDING.normal }}>{t("librarySearch.setup.description")}</Caption>
          <Command.Item value="library-setup-local" forceMount onSelect={chooseLocalModel}>
            {t("librarySearch.setup.local", { size: status.local_model.download_megabytes })}
          </Command.Item>
          <Command.Item value="library-setup-provider" forceMount onSelect={chooseProviderModel}>
            <FlexColumn gap={GAP.micro}>
              <Text size="small">{t("librarySearch.setup.provider")}</Text>
              <Caption>{t("librarySearch.setup.providerNote", { count: status.chunks })}</Caption>
            </FlexColumn>
          </Command.Item>
          <Command.Item value="library-setup-not-now" forceMount onSelect={notNow}>
            {t("librarySearch.setup.notNow")}
          </Command.Item>
        </Command.Group>
      )}
      {libraryIndexBusy(status) && status && (
        <Caption sx={{ px: PADDING.normal, py: PADDING.compact }} data-testid="library-index-status">
          {status.items.pending > 0
            ? t("librarySearch.palette.indexing", { ready: status.items.ready, total: status.items.total })
            : t("librarySearch.palette.embedding", { count: status.semantic.remaining })}
        </Caption>
      )}
      {hits.length > 0 && (
        <Command.Group heading={t("librarySearch.palette.heading")} forceMount>
          {hits.map((hit) => {
            const match = hit.matches[0];
            const location = locationOf(hit);
            return (
              <Command.Item
                key={hit.item_id}
                value={`library:${hit.item_id}`}
                forceMount
                onSelect={() => open(hit)}
              >
                <FlexRow gap={GAP.normal} align="center" sx={{ minWidth: 0 }}>
                  <HitIcon hit={hit} />
                  <FlexColumn gap={GAP.micro} sx={{ minWidth: 0 }}>
                    <Text size="small" truncate>
                      {hit.title}
                    </Text>
                    {match && match.field !== "title" && (
                      <Caption sx={{ overflowWrap: "anywhere" }}>{match.snippet}</Caption>
                    )}
                    {location && <Caption color="muted">{location}</Caption>}
                  </FlexColumn>
                </FlexRow>
              </Command.Item>
            );
          })}
        </Command.Group>
      )}
      {data?.index.note && hits.length > 0 && (
        <Caption sx={{ px: PADDING.normal }}>{data.index.note}</Caption>
      )}
      {isError && (
        <ErrorBanner
          data-testid="library-search-error"
          onRetry={retry}
          report={{
            source: "operation-failure",
            summary: "Library search failed in the command palette",
            errorText: error ?? undefined
          }}
          sx={{ mx: PADDING.normal, my: PADDING.compact }}
        >
          {t("librarySearch.palette.failed")}
        </ErrorBanner>
      )}
      {noMatch && (
        <Caption sx={{ px: PADDING.normal, py: PADDING.compact }} data-testid="library-no-match">
          {t("librarySearch.palette.noMatch", { query })}
        </Caption>
      )}
    </>
  );
};

export default memo(LibrarySearchCommands);
