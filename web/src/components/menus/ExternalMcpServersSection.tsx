/** @jsxImportSource @emotion/react */
import { memo, useCallback, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/AddOutlined";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import ExtensionIcon from "@mui/icons-material/Extension";
import {
  MCP_SERVER_ID_PATTERN,
  MCP_TOOL_PREFIX,
  type McpServerConfig
} from "@nodetool-ai/protocol";
import {
  BORDER_RADIUS,
  Caption,
  Card,
  Chip,
  ConfirmDialog,
  Dialog,
  EditorButton,
  EmptyState,
  FlexColumn,
  FlexRow,
  LabeledSwitch,
  MOTION,
  SPACING,
  SelectField,
  Text,
  TextInput
} from "../ui_primitives";
import { useNotificationStore } from "../../stores/NotificationStore";
import { trpcClient, type RouterOutputs } from "../../trpc/client";

type ProbeResult = RouterOutputs["externalMcp"]["probe"];

const QUERY_KEY = ["external-mcp-servers"];

interface DraftState {
  id: string;
  name: string;
  enabled: boolean;
  type: "stdio" | "http";
  command: string;
  args: string;
  env: string;
  cwd: string;
  url: string;
  headers: string;
}

const EMPTY_DRAFT: DraftState = {
  id: "",
  name: "",
  enabled: true,
  type: "stdio",
  command: "",
  args: "",
  env: "",
  cwd: "",
  url: "",
  headers: ""
};

/** `KEY=value` lines → record. Blank lines and lines without `=` are skipped. */
function parseKeyValues(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return out;
}

function formatKeyValues(values: Record<string, string>): string {
  return Object.entries(values)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}

function draftFrom(server: McpServerConfig): DraftState {
  const t = server.transport;
  return {
    id: server.id,
    name: server.name,
    enabled: server.enabled,
    type: t.type,
    command: t.type === "stdio" ? t.command : "",
    args: t.type === "stdio" ? t.args.join("\n") : "",
    env: t.type === "stdio" ? formatKeyValues(t.env) : "",
    cwd: t.type === "stdio" ? (t.cwd ?? "") : "",
    url: t.type === "http" ? t.url : "",
    headers: t.type === "http" ? formatKeyValues(t.headers) : ""
  };
}

function configFrom(draft: DraftState): McpServerConfig {
  const base = {
    id: draft.id,
    name: draft.name.trim() || draft.id,
    enabled: draft.enabled
  };
  if (draft.type === "http") {
    return {
      ...base,
      transport: {
        type: "http",
        url: draft.url.trim(),
        headers: parseKeyValues(draft.headers)
      }
    };
  }
  const transport: McpServerConfig["transport"] = {
    type: "stdio",
    command: draft.command.trim(),
    args: draft.args
      .split("\n")
      .map((a) => a.trim())
      .filter(Boolean),
    env: parseKeyValues(draft.env)
  };
  const cwd = draft.cwd.trim();
  if (cwd) transport.cwd = cwd;
  return { ...base, transport };
}

function idError(id: string): "required" | "format" | null {
  if (!id) return "required";
  if (!MCP_SERVER_ID_PATTERN.test(id)) {
    return "format";
  }
  return null;
}

function urlError(url: string): "required" | "protocol" | "invalid" | null {
  if (!url.trim()) return "required";
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "protocol";
    }
    return null;
  } catch {
    return "invalid";
  }
}

const ServerRow = memo(function ServerRow({
  server,
  onEdit,
  onDelete,
  onProbe,
  onToggle,
  probing,
  probe
}: {
  server: McpServerConfig;
  onEdit: (server: McpServerConfig) => void;
  onDelete: (server: McpServerConfig) => void;
  onProbe: (server: McpServerConfig) => void;
  onToggle: (server: McpServerConfig) => void;
  probing: boolean;
  probe: ProbeResult | null;
}) {
  const { t: translate, i18n } = useTranslation();
  const theme = useTheme();
  const handleEdit = useCallback(() => onEdit(server), [onEdit, server]);
  const handleDelete = useCallback(() => onDelete(server), [onDelete, server]);
  const handleProbe = useCallback(() => onProbe(server), [onProbe, server]);
  const handleToggle = useCallback(() => onToggle(server), [onToggle, server]);
  const t = server.transport;
  const summary =
    t.type === "stdio" ? [t.command, ...t.args].join(" ") : t.url;

  return (
    <Card
      variant="outlined"
      padding="compact"
      sx={{
        display: "flex",
        flexDirection: { xs: "column", sm: "row" },
        alignItems: { xs: "stretch", sm: "center" },
        gap: theme.spacing(3),
        borderRadius: BORDER_RADIUS.lg,
        border: `1px solid ${theme.vars.palette.divider}`,
        transition: MOTION.border,
        opacity: server.enabled ? 1 : 0.6,
        "&:hover": { borderColor: theme.vars.palette.grey[700] }
      }}
    >
      <FlexRow align="center" gap={3} sx={{ flex: 1, minWidth: 0 }}>
        <FlexRow
          align="center"
          justify="center"
          sx={{
            width: 48,
            height: 48,
            minWidth: 48,
            borderRadius: BORDER_RADIUS.lg,
            backgroundColor: theme.vars.palette.background.default
          }}
        >
          <ExtensionIcon sx={{ fontSize: 24, opacity: 0.7 }} />
        </FlexRow>
        <FlexColumn sx={{ flex: 1, minWidth: 0, gap: theme.spacing(0.5) }}>
          <FlexRow align="center" gap={0.5}>
            <Text size="small" weight={600}>
              {server.name}
            </Text>
            <Chip label={t.type} compact variant="outlined" />
            {!server.enabled && (
              <Chip label={translate("screens4_3.externalMcp.disabled")} compact variant="outlined" />
            )}
          </FlexRow>
          <Caption sx={{ opacity: 0.55, wordBreak: "break-all" }}>
            {summary}
          </Caption>
          <Caption size="smaller" sx={{ opacity: 0.45 }}>
            {translate("screens4_3.externalMcp.toolNameHelp", { toolName: `${MCP_TOOL_PREFIX}${server.id}_<tool>` })}
          </Caption>
          {probe && (
            <Caption
              size="smaller"
              color={probe.ok ? "success" : "error"}
              sx={{ lineHeight: 1.5 }}
            >
              {probe.ok
                ? probe.tools.length === 0
                  ? translate("screens4_3.externalMcp.connectedNoTools")
                  : translate("screens4_3.externalMcp.toolsFound", { count: probe.tools.length, formattedCount: new Intl.NumberFormat(i18n.language).format(probe.tools.length), tools: probe.tools
                      .map((tool) => tool.name)
                      .join(", ") })
                : (probe.error ?? translate("screens4_3.externalMcp.couldNotConnect"))}
            </Caption>
          )}
        </FlexColumn>
      </FlexRow>

      <FlexRow align="center" gap={0.5} sx={{ flexWrap: "wrap" }}>
        <EditorButton
          density="compact"
          variant="text"
          size="small"
          onClick={handleProbe}
          disabled={probing}
        >
          {probing ? translate("screens4_3.externalMcp.connecting") : translate("screens4_3.customProviders.test")}
        </EditorButton>
        <EditorButton
          density="compact"
          variant="text"
          size="small"
          onClick={handleToggle}
        >
          {server.enabled ? translate("screens4_3.externalMcp.disable") : translate("screens4_3.externalMcp.enable")}
        </EditorButton>
        <EditorButton
          density="compact"
          variant="outlined"
          size="small"
          onClick={handleEdit}
        >
          {translate("screens4_3.common.edit")}
        </EditorButton>
        <EditorButton
          density="compact"
          variant="text"
          size="small"
          color="error"
          startIcon={<DeleteIcon />}
          onClick={handleDelete}
        >
          {translate("screens4_3.common.remove")}
        </EditorButton>
      </FlexRow>
    </Card>
  );
});

/**
 * External MCP servers whose tools join the agent's toolbelt — Blender,
 * Hugging Face, a local script. A stdio server is a command this machine
 * runs; an HTTP server is a URL.
 */
export const ExternalMcpServersSection = memo(
  function ExternalMcpServersSection() {
    const { t } = useTranslation();
    const theme = useTheme();
    const queryClient = useQueryClient();
    const addNotification = useNotificationStore(
      (state) => state.addNotification
    );

    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
    const [pendingDelete, setPendingDelete] = useState<McpServerConfig | null>(
      null
    );
    const [probingId, setProbingId] = useState<string | null>(null);
    const [probes, setProbes] = useState<Record<string, ProbeResult>>({});

    const { data } = useQuery({
      queryKey: QUERY_KEY,
      queryFn: () => trpcClient.externalMcp.list.query(),
      refetchOnWindowFocus: false
    });

    const saveMutation = useMutation({
      mutationFn: (config: McpServerConfig) =>
        trpcClient.externalMcp.save.mutate(config),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: QUERY_KEY });
        setDialogOpen(false);
      },
      onError: (err) => {
        addNotification({
          type: "error",
          alert: true,
          content: t("screens4_3.externalMcp.saveError", { error: err instanceof Error ? err.message : String(err) })
        });
      }
    });

    const deleteMutation = useMutation({
      mutationFn: (id: string) => trpcClient.externalMcp.delete.mutate({ id }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: QUERY_KEY });
        setPendingDelete(null);
      }
    });

    const handleProbe = useCallback(
      async (server: McpServerConfig) => {
        setProbingId(server.id);
        try {
          const result = await trpcClient.externalMcp.probe.mutate(server);
          setProbes((prev) => ({ ...prev, [server.id]: result }));
        } catch (err) {
          setProbes((prev) => ({
            ...prev,
            [server.id]: {
              id: server.id,
              ok: false,
              tools: [],
              error: err instanceof Error ? err.message : String(err)
            }
          }));
        } finally {
          setProbingId(null);
        }
      },
      []
    );

    const handleToggle = useCallback(
      (server: McpServerConfig) => {
        saveMutation.mutate({ ...server, enabled: !server.enabled });
      },
      [saveMutation]
    );

    const handleAdd = useCallback(() => {
      setEditingId(null);
      setDraft(EMPTY_DRAFT);
      setDialogOpen(true);
    }, []);

    const handleEdit = useCallback((server: McpServerConfig) => {
      setEditingId(server.id);
      setDraft(draftFrom(server));
      setDialogOpen(true);
    }, []);

    const handleClose = useCallback(() => setDialogOpen(false), []);

    const field = useCallback(
      (key: keyof DraftState) => (e: ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setDraft((prev) => ({ ...prev, [key]: value }));
      },
      []
    );

    const handleNameChange = useCallback(
      (e: ChangeEvent<HTMLInputElement>) => {
        const name = e.target.value;
        setDraft((prev) => ({
          ...prev,
          name,
          // The id follows the name until the user types one by hand.
          id: editingId || prev.id !== slugify(prev.name) ? prev.id : slugify(name)
        }));
      },
      [editingId]
    );

    const handleTypeChange = useCallback((value: string) => {
      setDraft((prev) => ({ ...prev, type: value === "http" ? "http" : "stdio" }));
    }, []);

    const handleEnabledChange = useCallback((enabled: boolean) => {
      setDraft((prev) => ({ ...prev, enabled }));
    }, []);

    const servers = data?.servers ?? [];
    const stdioEnabled = data?.stdio_enabled ?? true;
    const draftIdError = idError(draft.id);
    const duplicateId =
      !editingId && servers.some((s) => s.id === draft.id);
    const transportError =
      draft.type === "http"
        ? urlError(draft.url)
        : !stdioEnabled
          ? t("screens4_3.externalMcp.stdioUnavailable")
          : draft.command.trim()
            ? null
            : t("screens4_3.externalMcp.commandRequired");
    const translatedIdError = draftIdError ? t(`screens4_3.externalMcp.idErrors.${draftIdError}`) : undefined;
    const translatedUrlError = transportError && draft.type === "http"
      ? t(`screens4_3.externalMcp.urlErrors.${transportError}`)
      : undefined;
    const transportOptions = [
      { value: "stdio", label: t("screens4_3.externalMcp.commandStdio") },
      { value: "http", label: t("screens4_3.externalMcp.httpUrl") }
    ];

    const handleSave = useCallback(() => {
      saveMutation.mutate(configFrom(draft));
    }, [draft, saveMutation]);

    const confirmDelete = useCallback(() => {
      if (pendingDelete) deleteMutation.mutate(pendingDelete.id);
    }, [deleteMutation, pendingDelete]);

    const handleCancelDelete = useCallback(() => setPendingDelete(null), []);

    return (
      <div className="settings-section" style={{ marginTop: theme.spacing(SPACING.xl) }}>
        <FlexRow
          align="center"
          justify="space-between"
          sx={{ marginBottom: theme.spacing(3) }}
        >
          <FlexColumn gap={0.5}>
            <Text size="big">{t("screens4_3.externalMcp.heading")}</Text>
            <Caption sx={{ opacity: 0.55 }}>
              {t("screens4_3.externalMcp.description")}
            </Caption>
          </FlexColumn>
          <EditorButton
            density="compact"
            variant="outlined"
            size="small"
            startIcon={<AddIcon />}
            onClick={handleAdd}
          >
            {t("screens4_3.externalMcp.addServer")}
          </EditorButton>
        </FlexRow>

        {servers.length === 0 ? (
          <EmptyState
            variant="no-results"
            title={t("screens4_3.externalMcp.emptyTitle")}
            description={t("screens4_3.externalMcp.emptyDescription")}
          />
        ) : (
          <FlexColumn sx={{ gap: theme.spacing(2) }}>
            {servers.map((server) => (
              <ServerRow
                key={server.id}
                server={server}
                onEdit={handleEdit}
                onDelete={setPendingDelete}
                onProbe={handleProbe}
                onToggle={handleToggle}
                probing={probingId === server.id}
                probe={probes[server.id] ?? null}
              />
            ))}
          </FlexColumn>
        )}

        <Dialog
          open={dialogOpen}
          onClose={handleClose}
          fullWidth
          title={editingId ? t("screens4_3.externalMcp.editTitle") : t("screens4_3.externalMcp.addTitle")}
          onConfirm={handleSave}
          confirmText={editingId ? t("screens4_3.common.save") : t("screens4_3.common.add")}
          confirmDisabled={
            Boolean(draftIdError) || Boolean(transportError) || duplicateId
          }
        >
          <FlexColumn gap={SPACING.lg}>
            <TextInput
              label={t("screens4_3.common.name")}
              value={draft.name}
              onChange={handleNameChange}
              fullWidth
              placeholder="Blender"
              autoFocus
              variant="outlined"
              size="small"
            />
            <TextInput
              label={t("screens4_3.externalMcp.id")}
              value={draft.id}
              onChange={field("id")}
              fullWidth
              disabled={Boolean(editingId)}
              placeholder="blender"
              variant="outlined"
              size="small"
              errorMessage={
                duplicateId
                  ? t("screens4_3.externalMcp.duplicateId")
                  : translatedIdError
              }
              helperText={t("screens4_3.externalMcp.toolNameHelp", { toolName: `${MCP_TOOL_PREFIX}${draft.id || "id"}_<tool>` })}
            />
            <SelectField
              label={t("screens4_3.externalMcp.connection")}
              value={draft.type}
              onChange={handleTypeChange}
              options={transportOptions}
              size="small"
              variant="outlined"
              description={
                stdioEnabled
                  ? undefined
                  : t("screens4_3.externalMcp.httpOnlyDeployment")
              }
            />
            {draft.type === "stdio" ? (
              <>
                <TextInput
                  label={t("screens4_3.externalMcp.command")}
                  value={draft.command}
                  onChange={field("command")}
                  fullWidth
                  placeholder="uvx"
                  variant="outlined"
                  size="small"
                  errorMessage={transportError ?? undefined}
                />
                <TextInput
                  label={t("screens4_3.externalMcp.arguments")}
                  value={draft.args}
                  onChange={field("args")}
                  fullWidth
                  multiline
                  rows={2}
                  placeholder="blender-mcp"
                  variant="outlined"
                  size="small"
                  helperText={t("screens4_3.externalMcp.argumentsHelp")}
                />
                <TextInput
                  label={t("screens4_3.externalMcp.environment")}
                  value={draft.env}
                  onChange={field("env")}
                  fullWidth
                  multiline
                  rows={3}
                  placeholder={"HF_TOKEN=${HF_TOKEN}\nDEBUG=1"}
                  variant="outlined"
                  size="small"
                  helperText={t("screens4_3.externalMcp.secretValuesHelp")}
                />
                <TextInput
                  label={t("screens4_3.externalMcp.workingDirectory")}
                  value={draft.cwd}
                  onChange={field("cwd")}
                  fullWidth
                  placeholder={t("screens4_3.common.optional")}
                  variant="outlined"
                  size="small"
                />
              </>
            ) : (
              <>
                <TextInput
                  label={t("screens4_3.externalMcp.url")}
                  value={draft.url}
                  onChange={field("url")}
                  fullWidth
                  placeholder="https://huggingface.co/mcp"
                  variant="outlined"
                  size="small"
                  errorMessage={translatedUrlError}
                  helperText={t("screens4_3.externalMcp.urlHelp")}
                />
                <TextInput
                  label={t("screens4_3.externalMcp.headers")}
                  value={draft.headers}
                  onChange={field("headers")}
                  fullWidth
                  multiline
                  rows={3}
                  placeholder={"Authorization=Bearer ${HF_TOKEN}"}
                  variant="outlined"
                  size="small"
                  helperText={t("screens4_3.externalMcp.secretValuesHelp")}
                />
              </>
            )}
            <LabeledSwitch
              label={t("screens4_3.externalMcp.enabled")}
              checked={draft.enabled}
              onChange={handleEnabledChange}
              size="small"
            />
          </FlexColumn>
        </Dialog>

        <ConfirmDialog
          open={Boolean(pendingDelete)}
          title={t("screens4_3.externalMcp.removeTitle")}
          content={t("screens4_3.externalMcp.removeConfirm", { name: pendingDelete?.name ?? "" })}
          confirmText={t("screens4_3.common.remove")}
          cancelText={t("screens4_3.common.cancel")}
          destructive
          onConfirm={confirmDelete}
          onClose={handleCancelDelete}
        />
      </div>
    );
  }
);

export default ExternalMcpServersSection;
