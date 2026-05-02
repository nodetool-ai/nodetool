/** @jsxImportSource @emotion/react */
/**
 * Production deployment admin panel.
 *
 * Provides server status monitoring, secrets management, and
 * HuggingFace model cache management behind an ADMIN_TOKEN.
 *
 * Only rendered in production (isProduction === true).
 */
import { memo, useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@mui/material/styles";
import {
  Box,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow
} from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import MemoryIcon from "@mui/icons-material/Memory";
import StorageIcon from "@mui/icons-material/Storage";
import VpnKeyIcon from "@mui/icons-material/VpnKey";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
  FlexColumn,
  FlexRow,
  Text,
  Caption,
  TextInput,
  Divider,
  AlertBanner,
  LoadingSpinner,
  EditorButton
} from "../ui_primitives";
import { BASE_URL } from "../../stores/BASE_URL";

// ── Admin API ──────────────────────────────────────────────────────────

function adminFetch(
  path: string,
  token: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {})
    }
  });
}

async function adminGet<T>(path: string, token: string): Promise<T> {
  const res = await adminFetch(path, token);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(
      (err as { error?: string }).error ?? `HTTP ${res.status}`
    );
  }
  return res.json() as Promise<T>;
}

// ── Types ──────────────────────────────────────────────────────────────

interface ServerStatus {
  status: string;
  timestamp: string;
  uptime_seconds: number;
  uptime_human: string;
  node_version: string;
  platform: string;
  arch: string;
  environment: string;
  memory: {
    rss_human: string;
    heap_used_human: string;
    heap_total_human: string;
    heap_used_bytes: number;
    heap_total_bytes: number;
  };
  providers_configured: Array<{
    name: string;
    env_var: string;
    configured: boolean;
  }>;
}

interface DiskInfo {
  total_human?: string;
  used_human?: string;
  available_human?: string;
  use_percent?: number;
  error?: string;
}

interface SecretRecord {
  id: string;
  key: string;
  description: string;
  created_at: string;
  updated_at: string;
}

interface SecretsResponse {
  secrets: SecretRecord[];
}

interface CacheRepo {
  repo_id: string;
  repo_type: string;
  size_bytes: number;
  size_human: string;
}

interface CacheReposResponse {
  cache_dir: string;
  total_size_bytes: number;
  total_size_human: string;
  repos: CacheRepo[];
}

// ── Token gate ─────────────────────────────────────────────────────────

const SESSION_TOKEN_KEY = "nodetool_admin_token";

function loadSavedToken(): string {
  try {
    return sessionStorage.getItem(SESSION_TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveToken(token: string): void {
  try {
    if (token) {
      sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
    }
  } catch {
    // ignore
  }
}

// ── Sub-components ─────────────────────────────────────────────────────

function StatusBadge({ ok }: { ok: boolean }) {
  const theme = useTheme();
  return (
    <FlexRow sx={{ alignItems: "center", gap: 0.5 }}>
      {ok ? (
        <CheckCircleOutlineIcon
          sx={{ fontSize: 16, color: theme.vars.palette.success.main }}
        />
      ) : (
        <ErrorOutlineIcon
          sx={{ fontSize: 16, color: theme.vars.palette.error.main }}
        />
      )}
      <Caption sx={{ color: ok ? "success.main" : "error.main" }}>
        {ok ? "OK" : "Error"}
      </Caption>
    </FlexRow>
  );
}

function ProviderChip({
  name,
  configured
}: {
  name: string;
  configured: boolean;
}) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        px: 1,
        py: 0.4,
        borderRadius: 1,
        border: "1px solid",
        borderColor: configured
          ? theme.vars.palette.success.main
          : theme.vars.palette.divider,
        bgcolor: configured
          ? `${String(theme.vars.palette.success.main)}15`
          : "transparent",
        fontSize: "0.75rem",
        color: configured
          ? theme.vars.palette.success.main
          : theme.vars.palette.text.disabled
      }}
    >
      {configured ? (
        <CheckCircleOutlineIcon sx={{ fontSize: 12 }} />
      ) : (
        <ErrorOutlineIcon sx={{ fontSize: 12 }} />
      )}
      {name}
    </Box>
  );
}

// ── Main component ─────────────────────────────────────────────────────

interface DeploymentMenuProps {
  /** Called when the token should be stored in the parent's sidebar sections */
  onTokenChange?: () => void;
}

function DeploymentMenu({ onTokenChange }: DeploymentMenuProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();

  const [token, setToken] = useState<string>(loadSavedToken);
  const [tokenInput, setTokenInput] = useState<string>("");
  const [authenticated, setAuthenticated] = useState<boolean>(false);

  // New secret form state
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [showAddSecret, setShowAddSecret] = useState(false);

  // Verify token on mount or when token changes
  const {
    data: statusData,
    error: statusError,
    isLoading: statusLoading,
    refetch: refetchStatus
  } = useQuery<ServerStatus>({
    queryKey: ["admin", "status", token],
    queryFn: () => adminGet<ServerStatus>("/admin/status", token),
    enabled: Boolean(token),
    retry: false,
    staleTime: 30_000
  });

  useEffect(() => {
    if (statusData) {
      setAuthenticated(true);
    } else if (statusError) {
      setAuthenticated(false);
    }
  }, [statusData, statusError]);

  const {
    data: diskData,
    refetch: refetchDisk
  } = useQuery<DiskInfo>({
    queryKey: ["admin", "disk", token],
    queryFn: () => adminGet<DiskInfo>("/admin/disk", token),
    enabled: authenticated,
    staleTime: 60_000
  });

  const {
    data: secretsData,
    isLoading: secretsLoading,
    refetch: refetchSecrets
  } = useQuery<SecretsResponse>({
    queryKey: ["admin", "secrets", token],
    queryFn: () => adminGet<SecretsResponse>("/admin/secrets", token),
    enabled: authenticated,
    staleTime: 30_000
  });

  const {
    data: cacheData,
    isLoading: cacheLoading,
    refetch: refetchCache
  } = useQuery<CacheReposResponse>({
    queryKey: ["admin", "cache", "repos", token],
    queryFn: () => adminGet<CacheReposResponse>("/admin/cache/repos", token),
    enabled: authenticated,
    staleTime: 60_000
  });

  const handleTokenSubmit = useCallback(() => {
    const trimmed = tokenInput.trim();
    setToken(trimmed);
    saveToken(trimmed);
    onTokenChange?.();
    void queryClient.invalidateQueries({ queryKey: ["admin"] });
  }, [tokenInput, queryClient, onTokenChange]);

  const handleLogout = useCallback(() => {
    setToken("");
    setTokenInput("");
    saveToken("");
    setAuthenticated(false);
    void queryClient.invalidateQueries({ queryKey: ["admin"] });
  }, [queryClient]);

  const upsertSecretMutation = useMutation({
    mutationFn: async (data: {
      key: string;
      value: string;
      description: string;
    }) => {
      const res = await adminFetch("/admin/secrets", token, {
        method: "POST",
        body: JSON.stringify(data)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(
          (err as { error?: string }).error ?? `HTTP ${res.status}`
        );
      }
      return res.json();
    },
    onSuccess: () => {
      void refetchSecrets();
      setNewKey("");
      setNewValue("");
      setNewDescription("");
      setShowAddSecret(false);
    }
  });

  const deleteSecretMutation = useMutation({
    mutationFn: async (key: string) => {
      const res = await adminFetch(
        `/admin/secrets/${encodeURIComponent(key)}`,
        token,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    onSuccess: () => {
      void refetchSecrets();
    }
  });

  const deleteCacheRepoMutation = useMutation({
    mutationFn: async (repoId: string) => {
      const res = await adminFetch(
        `/admin/cache/repos/${encodeURIComponent(repoId)}`,
        token,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    onSuccess: () => {
      void refetchCache();
    }
  });

  const sectionHeaderSx = {
    display: "flex",
    alignItems: "center",
    gap: 1,
    mb: 1.5,
    mt: 2.5,
    color: "text.secondary",
    "& svg": { fontSize: 18 }
  };

  // ── Token gate ────────────────────────────────────────────────────

  if (!token || !authenticated) {
    return (
      <FlexColumn sx={{ gap: 2, maxWidth: 480, pt: 1 }}>
        <Text size="big">Admin Access</Text>
        <Text sx={{ color: "text.secondary", fontSize: "0.875rem" }}>
          Enter the server&apos;s <code>ADMIN_TOKEN</code> to access the
          deployment dashboard.
        </Text>
        {statusError && (
          <AlertBanner severity="error">
            {String(statusError instanceof Error ? statusError.message : statusError)}
          </AlertBanner>
        )}
        <FlexRow sx={{ gap: 1, alignItems: "flex-end" }}>
          <TextInput
            label="Admin Token"
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleTokenSubmit();
            }}
            size="small"
            variant="outlined"
            sx={{ flex: 1 }}
          />
          <EditorButton
            variant="contained"
            onClick={handleTokenSubmit}
            disabled={!tokenInput.trim() || statusLoading}
          >
            {statusLoading ? "Checking…" : "Connect"}
          </EditorButton>
        </FlexRow>
        <Caption sx={{ color: "text.disabled" }}>
          Set the <code>ADMIN_TOKEN</code> environment variable on the server to
          enable admin access. The token is stored only for this browser session.
        </Caption>
      </FlexColumn>
    );
  }

  const memPercent =
    statusData
      ? Math.round(
          (statusData.memory.heap_used_bytes /
            statusData.memory.heap_total_bytes) *
            100
        )
      : 0;

  // ── Authenticated dashboard ───────────────────────────────────────

  return (
    <FlexColumn sx={{ gap: 0, pb: 4 }}>
      {/* Header */}
      <FlexRow sx={{ alignItems: "center", justifyContent: "space-between", mb: 1 }}>
        <FlexRow sx={{ alignItems: "center", gap: 1 }}>
          <StatusBadge ok={statusData?.status === "ok"} />
          <Caption sx={{ color: "text.disabled" }}>
            {statusData?.environment ?? "production"} ·{" "}
            {statusData?.uptime_human ?? "—"}
          </Caption>
        </FlexRow>
        <FlexRow sx={{ gap: 1 }}>
          <EditorButton
            size="small"
            startIcon={<RefreshIcon />}
            onClick={() => {
              void refetchStatus();
              void refetchDisk();
              void refetchSecrets();
              void refetchCache();
            }}
          >
            Refresh
          </EditorButton>
          <EditorButton size="small" onClick={handleLogout}>
            Disconnect
          </EditorButton>
        </FlexRow>
      </FlexRow>

      <Divider />

      {/* ── Server Status ─────────────────────────────────────────── */}
      <Box sx={sectionHeaderSx}>
        <MemoryIcon />
        <Text size="big">Server</Text>
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: 1.5,
          mb: 2
        }}
      >
        {[
          { label: "Node", value: statusData?.node_version ?? "—" },
          { label: "Platform", value: `${statusData?.platform ?? "—"} / ${statusData?.arch ?? "—"}` },
          { label: "Uptime", value: statusData?.uptime_human ?? "—" },
          { label: "RSS Memory", value: statusData?.memory.rss_human ?? "—" }
        ].map(({ label, value }) => (
          <Box
            key={label}
            sx={{
              p: 1.5,
              borderRadius: 1,
              bgcolor: theme.vars.palette.background.paper,
              border: "1px solid",
              borderColor: theme.vars.palette.divider
            }}
          >
            <Caption sx={{ color: "text.disabled", mb: 0.5 }}>{label}</Caption>
            <Text sx={{ fontFamily: "monospace", fontSize: "0.85rem" }}>
              {value}
            </Text>
          </Box>
        ))}
      </Box>

      {/* Heap usage bar */}
      <Box sx={{ mb: 0.5 }}>
        <FlexRow sx={{ justifyContent: "space-between", mb: 0.5 }}>
          <Caption>Heap usage</Caption>
          <Caption sx={{ color: "text.disabled" }}>
            {statusData?.memory.heap_used_human} /{" "}
            {statusData?.memory.heap_total_human} ({memPercent}%)
          </Caption>
        </FlexRow>
        <LinearProgress
          variant="determinate"
          value={memPercent}
          sx={{ height: 6, borderRadius: 3 }}
          color={memPercent > 85 ? "error" : memPercent > 65 ? "warning" : "primary"}
        />
      </Box>

      {/* Disk usage */}
      {diskData && !diskData.error && (
        <Box sx={{ mt: 1.5 }}>
          <FlexRow sx={{ justifyContent: "space-between", mb: 0.5 }}>
            <Caption>Disk usage</Caption>
            <Caption sx={{ color: "text.disabled" }}>
              {diskData.used_human} / {diskData.total_human} (
              {diskData.use_percent}%)
            </Caption>
          </FlexRow>
          <LinearProgress
            variant="determinate"
            value={diskData.use_percent ?? 0}
            sx={{ height: 6, borderRadius: 3 }}
            color={
              (diskData.use_percent ?? 0) > 90
                ? "error"
                : (diskData.use_percent ?? 0) > 75
                  ? "warning"
                  : "primary"
            }
          />
          <Caption sx={{ color: "text.disabled", mt: 0.5 }}>
            {diskData.available_human} available
          </Caption>
        </Box>
      )}

      <Divider sx={{ mt: 2 }} />

      {/* ── AI Providers ──────────────────────────────────────────── */}
      <Box sx={sectionHeaderSx}>
        <CloudDownloadIcon />
        <Text size="big">AI Providers</Text>
      </Box>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mb: 1 }}>
        {(statusData?.providers_configured ?? []).map((p) => (
          <ProviderChip key={p.name} name={p.name} configured={p.configured} />
        ))}
      </Box>

      <Divider sx={{ mt: 2 }} />

      {/* ── Secrets ───────────────────────────────────────────────── */}
      <Box sx={sectionHeaderSx}>
        <VpnKeyIcon />
        <Text size="big">Secrets</Text>
      </Box>

      <Caption sx={{ color: "text.secondary", mb: 1.5 }}>
        Manage per-user server secrets. Values are encrypted at rest and never
        displayed.
      </Caption>

      {secretsLoading && <LoadingSpinner size={20} />}

      {secretsData && secretsData.secrets.length > 0 && (
        <Box
          sx={{
            border: "1px solid",
            borderColor: theme.vars.palette.divider,
            borderRadius: 1,
            overflow: "hidden",
            mb: 1.5
          }}
        >
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Key</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>Updated</TableCell>
                <TableCell align="right" sx={{ width: 48 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {secretsData.secrets.map((s) => (
                <TableRow key={s.id} hover>
                  <TableCell>
                    <Text
                      sx={{ fontFamily: "monospace", fontSize: "0.8rem" }}
                    >
                      {s.key}
                    </Text>
                  </TableCell>
                  <TableCell>
                    <Caption sx={{ color: "text.secondary" }}>
                      {s.description || "—"}
                    </Caption>
                  </TableCell>
                  <TableCell>
                    <Caption sx={{ color: "text.disabled" }}>
                      {new Date(s.updated_at).toLocaleDateString()}
                    </Caption>
                  </TableCell>
                  <TableCell align="right">
                    <EditorButton
                      size="small"
                      color="error"
                      startIcon={<DeleteOutlineIcon sx={{ fontSize: 14 }} />}
                      onClick={() => deleteSecretMutation.mutate(s.key)}
                      disabled={deleteSecretMutation.isPending}
                      sx={{ minWidth: 0, px: 0.5 }}
                    >
                      {""}
                    </EditorButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      {secretsData && secretsData.secrets.length === 0 && (
        <Caption sx={{ color: "text.disabled", mb: 1.5 }}>
          No secrets stored.
        </Caption>
      )}

      {showAddSecret ? (
        <Box
          sx={{
            p: 2,
            border: "1px solid",
            borderColor: theme.vars.palette.divider,
            borderRadius: 1,
            mb: 1.5
          }}
        >
          <FlexColumn sx={{ gap: 1.5 }}>
            <Text sx={{ fontWeight: 500 }}>Add / Update Secret</Text>
            <TextInput
              label="Key"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              size="small"
              variant="outlined"
              placeholder="OPENAI_API_KEY"
            />
            <TextInput
              label="Value"
              type="password"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              size="small"
              variant="outlined"
            />
            <TextInput
              label="Description (optional)"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              size="small"
              variant="outlined"
            />
            {upsertSecretMutation.isError && (
              <AlertBanner severity="error">
                {String(upsertSecretMutation.error)}
              </AlertBanner>
            )}
            <FlexRow sx={{ gap: 1 }}>
              <EditorButton
                variant="contained"
                size="small"
                disabled={!newKey.trim() || !newValue || upsertSecretMutation.isPending}
                onClick={() =>
                  upsertSecretMutation.mutate({
                    key: newKey.trim(),
                    value: newValue,
                    description: newDescription
                  })
                }
              >
                {upsertSecretMutation.isPending ? "Saving…" : "Save"}
              </EditorButton>
              <EditorButton
                size="small"
                onClick={() => {
                  setShowAddSecret(false);
                  setNewKey("");
                  setNewValue("");
                  setNewDescription("");
                }}
              >
                Cancel
              </EditorButton>
            </FlexRow>
          </FlexColumn>
        </Box>
      ) : (
        <EditorButton
          size="small"
          variant="outlined"
          onClick={() => setShowAddSecret(true)}
          sx={{ alignSelf: "flex-start" }}
        >
          + Add Secret
        </EditorButton>
      )}

      <Divider sx={{ mt: 2 }} />

      {/* ── HF Model Cache ────────────────────────────────────────── */}
      <Box sx={sectionHeaderSx}>
        <StorageIcon />
        <Text size="big">
          Model Cache
          {cacheData && (
            <Caption
              component="span"
              sx={{ ml: 1, color: "text.disabled", fontWeight: 400 }}
            >
              {cacheData.total_size_human}
            </Caption>
          )}
        </Text>
      </Box>

      {cacheLoading && <LoadingSpinner size={20} />}

      {cacheData && cacheData.repos.length === 0 && (
        <Caption sx={{ color: "text.disabled" }}>
          No cached models found in{" "}
          <code style={{ fontSize: "0.8em" }}>{cacheData.cache_dir}</code>.
        </Caption>
      )}

      {cacheData && cacheData.repos.length > 0 && (
        <Box
          sx={{
            border: "1px solid",
            borderColor: theme.vars.palette.divider,
            borderRadius: 1,
            overflow: "hidden"
          }}
        >
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Model</TableCell>
                <TableCell>Type</TableCell>
                <TableCell align="right">Size</TableCell>
                <TableCell align="right" sx={{ width: 48 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {cacheData.repos.map((repo) => (
                <TableRow key={repo.repo_id} hover>
                  <TableCell>
                    <Text
                      sx={{ fontFamily: "monospace", fontSize: "0.8rem" }}
                    >
                      {repo.repo_id}
                    </Text>
                  </TableCell>
                  <TableCell>
                    <Caption sx={{ color: "text.secondary" }}>
                      {repo.repo_type}
                    </Caption>
                  </TableCell>
                  <TableCell align="right">
                    <Caption sx={{ fontFamily: "monospace" }}>
                      {repo.size_human}
                    </Caption>
                  </TableCell>
                  <TableCell align="right">
                    <EditorButton
                      size="small"
                      color="error"
                      startIcon={<DeleteOutlineIcon sx={{ fontSize: 14 }} />}
                      onClick={() =>
                        deleteCacheRepoMutation.mutate(repo.repo_id)
                      }
                      disabled={deleteCacheRepoMutation.isPending}
                      sx={{ minWidth: 0, px: 0.5 }}
                    >
                      {""}
                    </EditorButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      {cacheData && (
        <Caption sx={{ color: "text.disabled", mt: 1 }}>
          Cache directory:{" "}
          <code style={{ fontSize: "0.8em" }}>{cacheData.cache_dir}</code>
        </Caption>
      )}
    </FlexColumn>
  );
}

export default memo(DeploymentMenu);
