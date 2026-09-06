/** @jsxImportSource @emotion/react */
import { memo, useCallback, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
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
  Checkbox,
  Chip,
  ConfirmDialog,
  Dialog,
  EditorButton,
  EmptyState,
  FlexColumn,
  FlexRow,
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

const TRANSPORT_OPTIONS = [
  { value: "stdio", label: "Command (stdio)" },
  { value: "http", label: "HTTP URL" }
] as const;

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

function idError(id: string): string | null {
  if (!id) return "Enter an id.";
  if (!MCP_SERVER_ID_PATTERN.test(id)) {
    return "Lowercase letters, digits and _ only, up to 32 characters.";
  }
  return null;
}

function urlError(url: string): string | null {
  if (!url.trim()) return "Enter a URL.";
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "Use an http or https URL.";
    }
    return null;
  } catch {
    return "That is not a valid URL.";
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
              <Chip label="Disabled" compact variant="outlined" />
            )}
          </FlexRow>
          <Caption sx={{ opacity: 0.55, wordBreak: "break-all" }}>
            {summary}
          </Caption>
          <Caption size="smaller" sx={{ opacity: 0.45 }}>
            Tools appear as {`${MCP_TOOL_PREFIX}${server.id}_<tool>`}
          </Caption>
          {probe && (
            <Caption
              size="smaller"
              color={probe.ok ? "success" : "error"}
              sx={{ lineHeight: 1.5 }}
            >
              {probe.ok
                ? probe.tools.length === 0
                  ? "Connected. The server offers no tools."
                  : `${probe.tools.length} tool${probe.tools.length === 1 ? "" : "s"}: ${probe.tools
                      .map((tool) => tool.name)
                      .join(", ")}`
                : (probe.error ?? "Could not connect.")}
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
          {probing ? "Connecting…" : "Test"}
        </EditorButton>
        <EditorButton
          density="compact"
          variant="text"
          size="small"
          onClick={handleToggle}
        >
          {server.enabled ? "Disable" : "Enable"}
        </EditorButton>
        <EditorButton
          density="compact"
          variant="outlined"
          size="small"
          onClick={handleEdit}
        >
          Edit
        </EditorButton>
        <EditorButton
          density="compact"
          variant="text"
          size="small"
          color="error"
          startIcon={<DeleteIcon sx={{ fontSize: 14 }} />}
          onClick={handleDelete}
        >
          Remove
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
          content: `Could not save the server: ${err instanceof Error ? err.message : String(err)}`
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

    const handleEnabledChange = useCallback(
      (e: ChangeEvent<HTMLInputElement>) => {
        const enabled = e.target.checked;
        setDraft((prev) => ({ ...prev, enabled }));
      },
      []
    );

    const servers = data?.servers ?? [];
    const stdioEnabled = data?.stdio_enabled ?? true;
    const draftIdError = idError(draft.id);
    const duplicateId =
      !editingId && servers.some((s) => s.id === draft.id);
    const transportError =
      draft.type === "http"
        ? urlError(draft.url)
        : !stdioEnabled
          ? "Stdio servers are not available on this deployment."
          : draft.command.trim()
            ? null
            : "Enter a command.";

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
            <Text size="big">External servers</Text>
            <Caption sx={{ opacity: 0.55 }}>
              Give the agent the tools of any MCP server: Blender, Hugging
              Face, or a script of your own. Works with every model provider.
            </Caption>
          </FlexColumn>
          <EditorButton
            density="compact"
            variant="outlined"
            size="small"
            startIcon={<AddIcon sx={{ fontSize: 16 }} />}
            onClick={handleAdd}
          >
            Add server
          </EditorButton>
        </FlexRow>

        {servers.length === 0 ? (
          <EmptyState
            variant="no-results"
            title="No external servers"
            description="Add a command or a URL. Its tools join the agent's toolbelt on the next message."
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
          title={
            <Text size="big">
              {editingId ? "Edit MCP server" : "Add MCP server"}
            </Text>
          }
          onConfirm={handleSave}
          onCancel={handleClose}
          confirmText={editingId ? "Save" : "Add"}
          cancelText="Cancel"
          confirmDisabled={
            Boolean(draftIdError) || Boolean(transportError) || duplicateId
          }
        >
          <FlexColumn
            sx={{ marginTop: theme.spacing(4), gap: theme.spacing(3) }}
          >
            <TextInput
              label="Name"
              value={draft.name}
              onChange={handleNameChange}
              fullWidth
              placeholder="Blender"
              autoFocus
              variant="outlined"
              size="small"
            />
            <TextInput
              label="Id"
              value={draft.id}
              onChange={field("id")}
              fullWidth
              disabled={Boolean(editingId)}
              placeholder="blender"
              variant="outlined"
              size="small"
              errorMessage={
                duplicateId
                  ? "That id is already in use."
                  : (draftIdError ?? undefined)
              }
              helperText={`Tools are named ${MCP_TOOL_PREFIX}${draft.id || "id"}_<tool>`}
            />
            <SelectField
              label="Connection"
              value={draft.type}
              onChange={handleTypeChange}
              options={TRANSPORT_OPTIONS}
              size="small"
              variant="outlined"
              description={
                stdioEnabled
                  ? undefined
                  : "This deployment cannot run commands; only HTTP servers connect."
              }
            />
            {draft.type === "stdio" ? (
              <>
                <TextInput
                  label="Command"
                  value={draft.command}
                  onChange={field("command")}
                  fullWidth
                  placeholder="uvx"
                  variant="outlined"
                  size="small"
                  errorMessage={transportError ?? undefined}
                />
                <TextInput
                  label="Arguments"
                  value={draft.args}
                  onChange={field("args")}
                  fullWidth
                  multiline
                  rows={2}
                  placeholder="blender-mcp"
                  variant="outlined"
                  size="small"
                  helperText="One argument per line, so a path with a space stays one argument."
                />
                <TextInput
                  label="Environment"
                  value={draft.env}
                  onChange={field("env")}
                  fullWidth
                  multiline
                  rows={3}
                  placeholder={"HF_TOKEN=${HF_TOKEN}\nDEBUG=1"}
                  variant="outlined"
                  size="small"
                  helperText="One KEY=value per line. A literal value is stored encrypted; ${NAME} reads the secret NAME from your API keys."
                />
                <TextInput
                  label="Working directory"
                  value={draft.cwd}
                  onChange={field("cwd")}
                  fullWidth
                  placeholder="Optional"
                  variant="outlined"
                  size="small"
                />
              </>
            ) : (
              <>
                <TextInput
                  label="URL"
                  value={draft.url}
                  onChange={field("url")}
                  fullWidth
                  placeholder="https://huggingface.co/mcp"
                  variant="outlined"
                  size="small"
                  errorMessage={transportError ?? undefined}
                  helperText="Streamable HTTP, with SSE as the fallback."
                />
                <TextInput
                  label="Headers"
                  value={draft.headers}
                  onChange={field("headers")}
                  fullWidth
                  multiline
                  rows={3}
                  placeholder={"Authorization=Bearer ${HF_TOKEN}"}
                  variant="outlined"
                  size="small"
                  helperText="One Header=value per line. A literal value is stored encrypted; ${NAME} reads the secret NAME from your API keys."
                />
              </>
            )}
            <Checkbox
              label="Enabled"
              checked={draft.enabled}
              onChange={handleEnabledChange}
              size="small"
            />
          </FlexColumn>
        </Dialog>

        <ConfirmDialog
          open={Boolean(pendingDelete)}
          title="Remove server"
          content={`Remove ${pendingDelete?.name ?? ""}? Its tools leave the agent's toolbelt.`}
          confirmText="Remove"
          cancelText="Cancel"
          onConfirm={confirmDelete}
          onClose={handleCancelDelete}
        />
      </div>
    );
  }
);

export default ExternalMcpServersSection;
