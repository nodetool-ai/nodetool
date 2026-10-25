import { useMemo, useState, type ReactElement, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import GridViewOutlinedIcon from "@mui/icons-material/GridViewOutlined";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import ViewListOutlinedIcon from "@mui/icons-material/ViewListOutlined";
import { filterGameAssetCatalog, gameAssetCatalog, gameAssetSiblingRebinds, type AnyGameDocument,
  type GameAssetCatalogEntry, type GameAssetMediaKind, type GameAssetReference } from "@nodetool-ai/protocol";
import type { AnyGameDocumentOp } from "@nodetool-ai/game-runtime";

import { trpc, trpcClient } from "../../../../trpc/client";
import { AutoGrid, BORDER_RADIUS, Box, Caption, Chip, CONTROL, Dialog, Divider, EditorButton, FieldDensityContext, FlexColumn, FlexRow, getSpacingPx, InspectorFieldRow, InspectorSection, LoadingSpinner, ScrollArea, SearchInput, selectableRowStyles, selectableTileStyles, SelectField, SPACING, Text, TextArea, ToggleGroup, ToggleOption, ToolbarIconButton, TruncatedText, TYPOGRAPHY } from "../../../ui_primitives";
import ErrorBanner from "../../../support/ErrorBanner";
import GameAssetThumbnail from "./GameAssetThumbnail";
import { GAME_ASSET_KIND_FILTERS, candidatesForSlot, panelGenerationKind, shortDigest, type GameAssetBrowserTab,
  type GameAssetPanelGenerationKind, type GameAssetSource } from "./gameAssetBrowserModel";

export interface GameAssetBrowserProps {
  readonly gameId: string;
  readonly document: AnyGameDocument;
  /** Runs `edit` on the server, which binds onto the current draft, then merges that draft into the local one. */
  readonly runServerEdit: (edit: () => Promise<unknown>) => Promise<void>;
  readonly onOps: (ops: AnyGameDocumentOp[]) => void;
  readonly onSelectEntity: (sceneId: string, entityId: string) => void;
  /** Drafts a prompt in the assistant, for slots whose generation needs a provider node the panel cannot pick. */
  readonly onAskAssistant: (prompt: string) => void;
}

interface GenerationDraft {
  readonly slot: string;
  readonly kind: GameAssetPanelGenerationKind;
  readonly prompt: string;
  readonly preparation?: Readonly<Record<string, unknown>>;
}

type ViewMode = "grid" | "list";

const TABS = ["assets", "prefabs", "scenes"] as const satisfies readonly GameAssetBrowserTab[];
/** Grid tiles stay wide enough for a short slot name under the thumbnail. */
const TILE_MIN_WIDTH = 88;
/** The detail pane sits beside the list when the panel is at least this wide, and under it otherwise. */
const SIDE_BY_SIDE_MIN_WIDTH = 560;
const STACKED = `@container asset-browser (max-width: ${SIDE_BY_SIDE_MIN_WIDTH - 1}px)`;

/** Renders a flex primitive as a native button, so rows and tiles get keyboard activation for free. */
const BUTTON_ELEMENT = { component: "button", type: "button" } as const;

function referenceLabel(reference: GameAssetReference, t: ReturnType<typeof useTranslation>["t"]): string {
  const where = reference.kind === "entity" ? `${reference.sceneId}/${reference.name ?? reference.entityId}`
    : reference.kind === "scene" ? t("i18n-cont-game-06.assets.sceneReference", { name: reference.name ?? reference.sceneId })
    : reference.kind === "prefab" ? t("i18n-cont-game-06.assets.prefabReference", { id: reference.prefabId, entity: reference.entityId ? `/${reference.entityId}` : "" })
    : t("i18n-cont-game-06.assets.gameSettingsReference");
  return t("i18n-cont-game-06.assets.reference", { where, path: reference.path });
}

function countLabel(t: ReturnType<typeof useTranslation>["t"], kind: "time" | "entity" | "instance" | "asset", count: number, formattedCount: string): string {
  return t(`i18n-cont-game-06.assets.count.${kind}`, { count, formattedCount });
}

/** One compact list row: optional leading media, a label, and right-aligned metadata. */
function ItemRow({ selected, onClick, ariaLabel, leading, label, meta }: {
  readonly selected?: boolean;
  readonly onClick?: () => void;
  readonly ariaLabel?: string;
  readonly leading?: ReactNode;
  readonly label: ReactNode;
  readonly meta?: ReactNode;
}): ReactElement {
  return <FlexRow {...(onClick ? BUTTON_ELEMENT : {})} onClick={onClick}
    aria-label={ariaLabel} aria-pressed={onClick && selected !== undefined ? selected : undefined}
    gap={SPACING.sm} align="center" fullWidth
    sx={(theme) => {
      const row = {
        minWidth: 0, minHeight: CONTROL.height.sm, px: SPACING.sm, py: SPACING.micro, border: 0, bgcolor: onClick ? undefined : "transparent",
        color: "text.primary", textAlign: "left", font: "inherit", cursor: onClick ? "pointer" : "default"
      } as const;
      return onClick ? { ...selectableRowStyles(theme, { selected }), ...row } : row;
    }}>
    {leading}
    <Box sx={{ ...TYPOGRAPHY.sans.label, flex: 1, minWidth: 0 }}><TruncatedText variant="inherit">{label}</TruncatedText></Box>
    {meta && <FlexRow gap={SPACING.sm} align="center" sx={{ flexShrink: 0, color: "text.secondary", ...TYPOGRAPHY.sans.caption }}>
      {meta}
    </FlexRow>}
  </FlexRow>;
}

function ReferenceList({ references, onSelectEntity }: {
  readonly references: readonly GameAssetReference[];
  readonly onSelectEntity: (sceneId: string, entityId: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  if (references.length === 0) { return <Caption sx={{ px: SPACING.sm }}>{t("i18n-cont-game-06.assets.notUsed")}</Caption>; }
  return <FlexColumn gap={SPACING.none}>
    {references.map((reference) => {
      const { sceneId, entityId } = reference;
      const label = referenceLabel(reference, t);
      const [where, path] = label.split(" · ");
      return <ItemRow key={label} label={where} meta={path}
        onClick={reference.kind === "entity" && sceneId && entityId ? () => onSelectEntity(sceneId, entityId) : undefined}
        ariaLabel={reference.kind === "entity" && sceneId && entityId ? t("i18n-cont-game-06.assets.selectReference", { label }) : label} />;
    })}
  </FlexColumn>;
}

/** The detail pane's subject: preview, name and kind, with the pane's actions under it. */
function DetailHeader({ preview, title, subtitle, badge }: {
  readonly preview: ReactNode;
  readonly title: string;
  readonly subtitle: string;
  readonly badge?: ReactNode;
}): ReactElement {
  return <FlexRow gap={SPACING.md} align="center" sx={{ minWidth: 0 }}>
    {preview}
    <FlexColumn gap={SPACING.micro} sx={{ minWidth: 0, flex: 1 }}>
      <FlexRow gap={SPACING.sm} align="center" sx={{ minWidth: 0 }}>
        <Text size="small" weight={600} truncate sx={{ minWidth: 0 }}>{title}</Text>
        {badge}
      </FlexRow>
      <Caption>{subtitle}</Caption>
    </FlexColumn>
  </FlexRow>;
}

function KindIcon({ kind }: { readonly kind: "prefab" | "scene" }): ReactElement {
  return <FlexRow align="center" justify="center" aria-hidden="true" sx={{ width: getSpacingPx(6), height: getSpacingPx(6), flexShrink: 0,
    color: "text.secondary", "& svg": { fontSize: TYPOGRAPHY.sans.body.fontSize } }}>
    {kind === "prefab" ? <AccountTreeOutlinedIcon /> : <LayersOutlinedIcon />}
  </FlexRow>;
}

/**
 * The bottom-dock asset browser: every bound asset, prefab and scene of the
 * draft, where each asset is used, and the slot actions — generate,
 * regenerate with a new prompt, or bind a staged candidate in place.
 */
export default function GameAssetBrowser({ gameId, document, runServerEdit, onOps, onSelectEntity, onAskAssistant }: GameAssetBrowserProps): ReactElement {
  const { t, i18n } = useTranslation();
  const formatCount = (count: number): string => new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language).format(count);
  const tabLabels: Readonly<Record<GameAssetBrowserTab, string>> = {
    assets: t("i18n-cont-game-06.assets.tabs.assets"), prefabs: t("i18n-cont-game-06.assets.tabs.prefabs"), scenes: t("i18n-cont-game-06.assets.tabs.scenes")
  };
  const kindName = (kind: GameAssetMediaKind): string => t(`i18n-cont-game-06.assets.kinds.${kind}`);
  const kindPlural = (kind: GameAssetMediaKind): string => t(`i18n-cont-game-06.assets.kindPlurals.${kind}`);
  const dimension = document.schemaVersion === 3 ? "3d" : "2d";
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<GameAssetMediaKind | "all">("all");
  const [tab, setTab] = useState<GameAssetBrowserTab>("assets");
  const [view, setView] = useState<ViewMode>("grid");
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [selectedPrefab, setSelectedPrefab] = useState<string | null>(null);
  const [selectedScene, setSelectedScene] = useState<string | null>(null);
  const [generation, setGeneration] = useState<GenerationDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queries = trpc.useUtils();
  const { data: server, isLoading: serverLoading } = trpc.games.assetBrowser.useQuery({ id: gameId }, { staleTime: 15_000 });
  const catalog = useMemo(() => gameAssetCatalog(document), [document]);
  const filtered = useMemo(() => filterGameAssetCatalog(catalog, { query, kind: kind === "all" ? undefined : kind }), [catalog, query, kind]);
  const selected = catalog.assets.find((entry) => entry.slot === selectedSlot) ?? filtered.assets[0] ?? null;
  const prefab = catalog.prefabs.find((entry) => entry.id === selectedPrefab) ?? filtered.prefabs[0] ?? null;
  const scene = catalog.scenes.find((entry) => entry.id === selectedScene) ?? filtered.scenes[0] ?? null;
  const counts = { assets: filtered.assets.length, prefabs: filtered.prefabs.length, scenes: filtered.scenes.length };
  const filtering = query !== "" || kind !== "all";

  const run = async (edit: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    try {
      await runServerEdit(edit);
      await queries.games.assetBrowser.invalidate({ id: gameId });
      setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  const install = (slot: string, digest: string): Promise<void> =>
    run(() => trpcClient.games.installStagedCandidate.mutate({ id: gameId, slot, digest }));
  const generate = (draft: GenerationDraft): Promise<void> => run(() => {
    const request: Parameters<typeof trpcClient.games.generateAsset.mutate>[0] = {
      id: gameId, slot: draft.slot, kind: draft.kind, prompt: draft.prompt };
    if (draft.preparation) { request.preparation = { ...draft.preparation }; }
    return trpcClient.games.generateAsset.mutate(request);
  });

  const sourceOf = (entry: GameAssetCatalogEntry): GameAssetSource => ({ kind: "asset", assetId: entry.assetId });
  const boundsOf = (slot: string) => {
    const binding = document.assets[slot];
    return binding && "bounds" in binding && binding.mediaKind === "model" ? binding.bounds : undefined;
  };
  const thumbnailOf = (slot: string, size: "row" | "tile" | "detail"): ReactNode => {
    const entry = catalog.assets.find((candidate) => candidate.slot === slot);
    return entry ? <GameAssetThumbnail source={sourceOf(entry)} mediaKind={entry.mediaKind} digest={entry.digest} label={entry.slot}
      bounds={boundsOf(entry.slot)} size={size} /> : null;
  };
  const openAsset = (slot: string): void => { setTab("assets"); setSelectedSlot(slot); };
  const assetRows = (slots: readonly string[]): ReactElement => slots.length === 0
    ? <Caption sx={{ px: SPACING.sm }}>{t("i18n-cont-game-06.assets.noAssets")}</Caption>
    : <FlexColumn gap={SPACING.none}>{slots.map((slot) => <ItemRow key={slot} label={slot} leading={thumbnailOf(slot, "row")}
      meta={(() => { const entry = catalog.assets.find((candidate) => candidate.slot === slot); return entry ? kindName(entry.mediaKind) : null; })()}
      onClick={() => openAsset(slot)} ariaLabel={t("i18n-cont-game-06.assets.openAsset", { slot })} />)}</FlexColumn>;

  const assetDetail = (entry: GameAssetCatalogEntry): ReactElement => {
    const request = server?.slot_requests[entry.slot];
    const generationKind = panelGenerationKind(request, entry.mediaKind, dimension);
    const candidates = server ? candidatesForSlot(server.candidates, entry.slot, entry.mediaKind) : [];
    const workspaceId = server?.candidate_workspace_id;
    const rebinds = document.schemaVersion !== 3 && entry.staleSiblings.length > 0 && entry.mediaKind === "image"
      ? (() => {
        const parent = document.assets[entry.slot];
        return parent ? gameAssetSiblingRebinds(document.assets, entry.slot, parent) : null;
      })() : null;
    const verb = request?.source === "recorded" ? t("i18n-cont-game-06.assets.regenerate") : t("i18n-cont-game-06.assets.generate");
    return <>
      <FlexColumn gap={SPACING.sm} sx={{ pb: SPACING.md }}>
        <DetailHeader preview={thumbnailOf(entry.slot, "detail")} title={entry.slot}
          subtitle={t("i18n-cont-game-06.assets.assetSubtitle", { kind: kindName(entry.mediaKind), count: countLabel(t, "time", entry.usedBy.length, formatCount(entry.usedBy.length)) })} />
        <FlexColumn gap={SPACING.none}>
          <InspectorFieldRow label={t("i18n-cont-game-06.assets.digest")}>
            <Box sx={{ ...TYPOGRAPHY.mono.label, color: "text.primary" }}>{shortDigest(entry.digest)}</Box>
          </InspectorFieldRow>
          {entry.siblingOf && <InspectorFieldRow label={t("i18n-cont-game-06.assets.frameOf")}>
            <ItemRow label={entry.siblingOf} onClick={() => setSelectedSlot(entry.siblingOf ?? null)} ariaLabel={t("i18n-cont-game-06.assets.openAsset", { slot: entry.siblingOf })} />
          </InspectorFieldRow>}
          {request?.prompt && <InspectorFieldRow label={t("i18n-cont-game-06.assets.prompt")}>
            <Box sx={{ ...TYPOGRAPHY.sans.label, minWidth: 0 }}><TruncatedText variant="inherit">{request.prompt}</TruncatedText></Box>
          </InspectorFieldRow>}
        </FlexColumn>
        {!entry.siblingOf && <FlexRow gap={SPACING.xs}>
          {generationKind
            ? <EditorButton variant="outlined" size="small" startIcon={<AutoAwesomeOutlinedIcon />} disabled={busy} onClick={() => setGeneration({ slot: entry.slot, kind: generationKind,
              prompt: request?.prompt ?? "", preparation: request?.preparation })}>{verb}</EditorButton>
            : <EditorButton variant="outlined" size="small" startIcon={<AutoAwesomeOutlinedIcon />} disabled={busy} onClick={() => onAskAssistant(t("i18n-cont-game-06.assets.assistantGeneratePrompt", { kind: request?.kind ?? entry.mediaKind, slot: entry.slot, prompt: request?.prompt ? t("i18n-cont-game-06.assets.promptSuffix", { prompt: request.prompt }) : "" }))}>
              {t("i18n-cont-game-06.assets.askAssistantToGenerate")}
            </EditorButton>}
        </FlexRow>}
        {rebinds && <FlexColumn gap={SPACING.xs} sx={{ p: SPACING.sm, borderRadius: BORDER_RADIUS.md, bgcolor: "action.hover" }}>
          <Caption role="status" color="warning">{t("i18n-cont-game-06.assets.staleFrameBindings", { count: entry.staleSiblings.length, formattedCount: formatCount(entry.staleSiblings.length) })}</Caption>
          {rebinds.skipped.length > 0 && <Caption>{t("i18n-cont-game-06.assets.skippedFrames", { frames: rebinds.skipped.join(", ") })}</Caption>}
          {rebinds.ops.length > 0 && <FlexRow><EditorButton variant="outlined" size="small" disabled={busy} onClick={() => onOps([...rebinds.ops])}>
            {t("i18n-cont-game-06.assets.moveFrames")}</EditorButton></FlexRow>}
        </FlexColumn>}
      </FlexColumn>
      <InspectorSection title={t("i18n-cont-game-06.assets.usedBy", { count: entry.usedBy.length, formattedCount: formatCount(entry.usedBy.length) })}>
        <ReferenceList references={entry.usedBy} onSelectEntity={onSelectEntity} />
      </InspectorSection>
      {!entry.siblingOf && <InspectorSection title={t("i18n-cont-game-06.assets.stagedCandidates", { count: candidates.length, formattedCount: formatCount(candidates.length) })}>
        {serverLoading
          ? <LoadingSpinner size="small" text={t("i18n-cont-game-06.assets.loadingCandidates")} />
          : candidates.length === 0 || !workspaceId
          ? <Caption sx={{ px: SPACING.sm }}>{t("i18n-cont-game-06.assets.noStagedFiles", { kind: kindPlural(entry.mediaKind) })}</Caption>
          : <FlexColumn gap={SPACING.none}>{candidates.map((candidate) => {
            const current = candidate.digest === entry.digest;
            return <FlexRow key={candidate.digest} gap={SPACING.sm} align="center" sx={{ minHeight: CONTROL.height.md, px: SPACING.sm }}>
              <GameAssetThumbnail source={{ kind: "workspace", workspaceId, path: candidate.path }} mediaKind={candidate.media_kind}
                digest={candidate.digest} label={t("i18n-cont-game-06.assets.candidate", { digest: shortDigest(candidate.digest) })} />
              <FlexColumn sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ ...TYPOGRAPHY.sans.label, minWidth: 0 }}><TruncatedText variant="inherit">{candidate.prompt ?? shortDigest(candidate.digest)}</TruncatedText></Box>
                <Caption>{candidate.slot ? t("i18n-cont-game-06.assets.madeFor", { slot: candidate.slot }) : t("i18n-cont-game-06.assets.unrecorded")} · {new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(candidate.modified_at))}</Caption>
              </FlexColumn>
              {current ? <Chip compact label={t("i18n-cont-game-06.assets.current")} />
                : <EditorButton variant="outlined" disabled={busy} onClick={() => void install(entry.slot, candidate.digest)}>{t("i18n-cont-game-06.assets.use")}</EditorButton>}
            </FlexRow>;
          })}</FlexColumn>}
      </InspectorSection>}
    </>;
  };

  const detail: ReactNode = tab === "assets"
    ? selected && assetDetail(selected)
    : tab === "prefabs"
      ? prefab && <>
        <FlexColumn gap={SPACING.sm} sx={{ pb: SPACING.md }}>
          <DetailHeader preview={<KindIcon kind="prefab" />} title={prefab.id}
            subtitle={t("i18n-cont-game-06.assets.prefabSubtitle", { entities: countLabel(t, "entity", prefab.entityCount, formatCount(prefab.entityCount)), instances: countLabel(t, "instance", prefab.usedBy.length, formatCount(prefab.usedBy.length)) })} />
        </FlexColumn>
        <InspectorSection title={t("i18n-cont-game-06.assets.assetCount", { count: prefab.assets.length, formattedCount: formatCount(prefab.assets.length) })}>{assetRows(prefab.assets)}</InspectorSection>
        <InspectorSection title={t("i18n-cont-game-06.assets.instanceCount", { count: prefab.usedBy.length, formattedCount: formatCount(prefab.usedBy.length) })}>
          <ReferenceList references={prefab.usedBy} onSelectEntity={onSelectEntity} />
        </InspectorSection>
      </>
      : scene && <>
        <FlexColumn gap={SPACING.sm} sx={{ pb: SPACING.md }}>
          <DetailHeader preview={<KindIcon kind="scene" />} title={scene.name} badge={scene.entry && <Chip compact label={t("i18n-cont-game-06.assets.entry")} />}
            subtitle={t("i18n-cont-game-06.assets.sceneSubtitle", { entities: countLabel(t, "entity", scene.entityCount, formatCount(scene.entityCount)), assets: countLabel(t, "asset", scene.assets.length, formatCount(scene.assets.length)) })} />
        </FlexColumn>
        <InspectorSection title={t("i18n-cont-game-06.assets.assetCount", { count: scene.assets.length, formattedCount: formatCount(scene.assets.length) })}>{assetRows(scene.assets)}</InspectorSection>
      </>;

  const assetMeta = (entry: GameAssetCatalogEntry): ReactNode => <>
    {entry.staleSiblings.length > 0 && <Caption color="warning">{t("i18n-cont-game-06.assets.framesOutOfDate")}</Caption>}
    <span>{kindName(entry.mediaKind)}</span>
    <span>{entry.usedBy.length}×</span>
  </>;
  const items: ReactElement[] = tab === "assets"
    ? filtered.assets.map((entry) => view === "list"
      ? <ItemRow key={entry.slot} selected={entry.slot === selected?.slot} onClick={() => setSelectedSlot(entry.slot)}
        ariaLabel={t("i18n-cont-game-06.assets.assetAria", { slot: entry.slot })} leading={thumbnailOf(entry.slot, "row")} label={entry.slot} meta={assetMeta(entry)} />
      : <FlexColumn key={entry.slot} {...BUTTON_ELEMENT} aria-label={t("i18n-cont-game-06.assets.assetAria", { slot: entry.slot })} aria-pressed={entry.slot === selected?.slot}
        title={entry.slot} onClick={() => setSelectedSlot(entry.slot)} gap={SPACING.xs}
        sx={(theme) => ({ ...selectableTileStyles(theme, { selected: entry.slot === selected?.slot }), minWidth: 0, p: SPACING.xs,
          bgcolor: "transparent", color: "text.primary", font: "inherit", textAlign: "left", cursor: "pointer" })}>
        {thumbnailOf(entry.slot, "tile")}
        <FlexColumn sx={{ minWidth: 0, px: SPACING.micro }}>
          <Box sx={{ ...TYPOGRAPHY.sans.label, minWidth: 0 }}><TruncatedText variant="inherit">{entry.slot}</TruncatedText></Box>
          <Caption color={entry.staleSiblings.length > 0 ? "warning" : undefined}>
            {entry.staleSiblings.length > 0 ? t("i18n-cont-game-06.assets.framesOutOfDate") : t("i18n-cont-game-06.assets.assetMeta", { kind: kindName(entry.mediaKind), count: formatCount(entry.usedBy.length) })}
          </Caption>
        </FlexColumn>
      </FlexColumn>)
    : tab === "prefabs"
      ? filtered.prefabs.map((entry) => <ItemRow key={entry.id} selected={entry.id === prefab?.id} onClick={() => setSelectedPrefab(entry.id)}
        ariaLabel={t("i18n-cont-game-06.assets.prefabAria", { id: entry.id })} leading={<KindIcon kind="prefab" />} label={entry.id}
        meta={<><span>{countLabel(t, "entity", entry.entityCount, formatCount(entry.entityCount))}</span><span>{countLabel(t, "instance", entry.usedBy.length, formatCount(entry.usedBy.length))}</span></>} />)
      : filtered.scenes.map((entry) => <ItemRow key={entry.id} selected={entry.id === scene?.id} onClick={() => setSelectedScene(entry.id)}
        ariaLabel={t("i18n-cont-game-06.assets.sceneAria", { name: entry.name })} leading={<KindIcon kind="scene" />} label={entry.name}
        meta={<>{entry.entry && <Chip compact label={t("i18n-cont-game-06.assets.entry")} />}<span>{countLabel(t, "entity", entry.entityCount, formatCount(entry.entityCount))}</span></>} />);
  const grid = tab === "assets" && view === "grid";

  return <FieldDensityContext.Provider value="compact">
    <FlexColumn fullHeight aria-label={t("i18n-cont-game-06.assets.browserAria")} sx={{ minHeight: 0, containerType: "inline-size", containerName: "asset-browser" }}>
      <FlexRow role="toolbar" aria-label={t("i18n-cont-game-06.assets.toolbarAria")} gap={SPACING.sm} align="center" wrap
        sx={{ flexShrink: 0, minHeight: CONTROL.height.md, px: SPACING.sm, py: SPACING.micro, borderBottom: 1, borderColor: "divider" }}>
        <ToggleGroup quiet exclusive size="small" aria-label={t("i18n-cont-game-06.assets.browse")} value={tab}
          onChange={(_event, value: GameAssetBrowserTab | null) => { if (value) { setTab(value); } }} sx={{ flexShrink: 0 }}>
          {TABS.map((value) => <ToggleOption key={value} value={value} aria-label={t("i18n-cont-game-06.assets.tabAria", { tab: tabLabels[value], formattedCount: formatCount(counts[value]) })}
            sx={{ px: SPACING.sm, gap: SPACING.xs, ...TYPOGRAPHY.sans.label, textTransform: "none" }}>
            {tabLabels[value]}<Box component="span" sx={{ ...TYPOGRAPHY.sans.caption, color: "text.secondary" }}>{counts[value]}</Box>
          </ToggleOption>)}
        </ToggleGroup>
        <Divider orientation="vertical" flexItem sx={{ [STACKED]: { display: "none" } }} />
        <FlexRow gap={SPACING.sm} align="center" sx={{ flex: "1 1 auto", minWidth: 0, [STACKED]: { order: 2, flexBasis: "100%" } }}>
          <SearchInput value={query} onChange={setQuery} placeholder={t("i18n-cont-game-06.assets.search")} ariaLabel={t("i18n-cont-game-06.assets.searchAssets")} size="small"
            sx={{ flex: "1 1 auto", minWidth: 0 }} />
          <Box sx={{ flexShrink: 0, width: getSpacingPx(30) }}>
            <SelectField label={t("i18n-cont-game-06.assets.type")} hideLabel size="small" value={kind} onChange={(value) => setKind(value as GameAssetMediaKind | "all")}
              options={[{ value: "all", label: t("i18n-cont-game-06.assets.allTypes") }, ...GAME_ASSET_KIND_FILTERS[dimension].map((value) => ({ value, label: kindPlural(value) }))]} />
          </Box>
        </FlexRow>
        <FlexRow gap={SPACING.micro} align="center" sx={{ flexShrink: 0, [STACKED]: { order: 1, ml: "auto" } }}>
          <ToolbarIconButton icon={<ViewListOutlinedIcon fontSize="small" />} tooltip={t("i18n-cont-game-06.assets.listView")} ariaLabel={t("i18n-cont-game-06.assets.listView")}
            active={view === "list"} disabled={tab !== "assets"} onClick={() => setView("list")} />
          <ToolbarIconButton icon={<GridViewOutlinedIcon fontSize="small" />} tooltip={t("i18n-cont-game-06.assets.gridView")} ariaLabel={t("i18n-cont-game-06.assets.gridView")}
            active={view === "grid"} disabled={tab !== "assets"} onClick={() => setView("grid")} />
        </FlexRow>
      </FlexRow>
      {error && <ErrorBanner sx={{ flexShrink: 0, mx: SPACING.md, my: SPACING.xs }}
        report={{ source: "panel-crash", summary: t("i18n-cont-game-06.assets.actionFailedSummary"), errorText: error }}>
        {error}
      </ErrorBanner>}
      <FlexRow sx={{ flex: 1, minHeight: 0, alignItems: "stretch", [STACKED]: { flexDirection: "column" } }}>
        <ScrollArea thin aria-label={t("i18n-cont-game-06.assets.listAria", { tab: tabLabels[tab] })} sx={{ flex: 1, minWidth: 0, minHeight: 0, p: SPACING.xs }}>
          {items.length === 0
            ? <FlexColumn gap={SPACING.micro} align="center" sx={{ py: SPACING.lg, px: SPACING.md, textAlign: "center" }}>
              <Text size="small" weight={500}>{filtering ? t("i18n-cont-game-06.assets.nothingMatches") : t(`i18n-cont-game-06.assets.empty.${tab}`)}</Text>
              {filtering && <Caption>{t("i18n-cont-game-06.assets.clearFilters")}</Caption>}
            </FlexColumn>
            : grid ? <AutoGrid minItemWidth={TILE_MIN_WIDTH} gap={SPACING.xs}>{items}</AutoGrid>
            : <FlexColumn gap={SPACING.none}>{items}</FlexColumn>}
        </ScrollArea>
        {detail && <ScrollArea thin aria-label={t("i18n-cont-game-06.assets.detailsAria")} sx={{
          flex: "0 0 42%", minWidth: getSpacingPx(70), maxWidth: getSpacingPx(110), minHeight: 0, px: SPACING.md, py: SPACING.md,
          borderLeft: 1, borderColor: "divider",
          [STACKED]: { flex: "0 1 auto", maxHeight: "50%", minWidth: 0, maxWidth: "none", borderLeft: 0, borderTop: 1 }
        }}>
          {detail}
        </ScrollArea>}
      </FlexRow>
      <Dialog open={generation !== null} title={generation ? t("i18n-cont-game-06.assets.generateTitle", { slot: generation.slot }) : ""} onClose={() => setGeneration(null)}
        showActions confirmText={t("i18n-cont-game-06.assets.generateAndInstall")} isLoading={busy} onConfirm={() => {
          if (!generation || !generation.prompt.trim()) { return; }
          const draft = generation;
          setGeneration(null);
          void generate(draft);
        }}>
        <FlexColumn gap={SPACING.sm}>
          <Text>{t("i18n-cont-game-06.assets.generateDescription")}</Text>
          <TextArea label={t("i18n-cont-game-06.assets.prompt")} rows={5} value={generation?.prompt ?? ""}
            onChange={(value) => setGeneration((current) => current ? { ...current, prompt: value } : current)} />
          {generation?.preparation && <Caption>{t("i18n-cont-game-06.assets.preparation")}: {JSON.stringify(generation.preparation)}</Caption>}
        </FlexColumn>
      </Dialog>
    </FlexColumn>
  </FieldDensityContext.Provider>;
}
