/** @jsxImportSource @emotion/react */
/**
 * Settings → Packages tab.
 *
 * Lists every discovered node pack with its load status and trust toggle.
 * Trust changes write `~/.config/nodetool/packs.json` and trigger a soft
 * reload. Install / uninstall are Electron-only and require a server restart.
 */

import { memo, useCallback, useEffect, useState } from "react";

import { AlertBanner } from "../ui_primitives/AlertBanner";
import { Chip } from "../ui_primitives/Chip";
import { EditorButton } from "../editor_ui/EditorButton";
import { FlexColumn } from "../ui_primitives/FlexColumn";
import { FlexRow } from "../ui_primitives/FlexRow";
import { LabeledSwitch } from "../ui_primitives/LabeledSwitch";
import { Text } from "../ui_primitives/Text";
import { TextInput } from "../ui_primitives/TextInput";
import { isElectron } from "../../lib/env";
import usePacksStore, {
  type PackInfo,
  type SkipReason
} from "../../stores/PacksStore";

// ── Helpers ───────────────────────────────────────────────────────────────

function statusColor(
  pack: PackInfo
): "success" | "warning" | "error" | "default" {
  if (pack.status === "loaded") {
    return pack.skippedNodes.length > 0 ? "warning" : "success";
  }
  if (pack.status === "skipped") return "warning";
  return "error";
}

function statusLabel(pack: PackInfo): string {
  if (pack.status === "loaded") {
    const n = pack.registered.length;
    return `loaded (${n} node${n === 1 ? "" : "s"})`;
  }
  return pack.status;
}

const SKIP_REASON_LABEL: Record<SkipReason, string> = {
  "not-allowed": "not on allowlist",
  "api-version": "incompatible pack API version",
  "reserved-namespace": "reserved namespace",
  collision: "node type already registered",
  "no-node-type": "no nodeType defined"
};

// ── Sub-components ────────────────────────────────────────────────────────

interface PackRowProps {
  pack: PackInfo;
  trusted: boolean;
  onTrustChange: (trusted: boolean) => void;
}

const PackRow = memo(function PackRow({
  pack,
  trusted,
  onTrustChange
}: PackRowProps) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails =
    pack.registered.length > 0 ||
    pack.skippedNodes.length > 0 ||
    Boolean(pack.error);

  return (
    <FlexColumn
      gap={0.5}
      sx={{
        p: 1.5,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1
      }}
    >
      <FlexRow gap={1.5} align="center" justify="space-between" sx={{ flexWrap: "wrap" }}>
        <FlexRow gap={1} align="center" sx={{ minWidth: 0, flex: 1 }}>
          <Text size="normal" weight={600} truncate>
            {pack.name}
          </Text>
          {pack.version && (
            <Text size="small" color="secondary">
              v{pack.version}
            </Text>
          )}
          <Chip
            label={statusLabel(pack)}
            color={statusColor(pack)}
            compact
          />
        </FlexRow>
        <FlexRow gap={1.5} align="center">
          <LabeledSwitch
            label="Trusted"
            checked={trusted}
            onChange={onTrustChange}
          />
          {hasDetails && (
            <EditorButton
              density="compact"
              variant="outlined"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            >
              {expanded ? "Hide" : "Details"}
            </EditorButton>
          )}
        </FlexRow>
      </FlexRow>

      {pack.reason && (
        <Text size="small" color="secondary">
          {pack.reason}
        </Text>
      )}

      {expanded && (
        <FlexColumn gap={1} sx={{ mt: 1 }}>
          {pack.error && (
            <AlertBanner severity="error" compact>
              {pack.error}
            </AlertBanner>
          )}
          {pack.registered.length > 0 && (
            <FlexColumn gap={0.25}>
              <Text size="small" weight={600}>
                Registered ({pack.registered.length})
              </Text>
              {pack.registered.map((t) => (
                <Text key={t} size="small" family="secondary">
                  {t}
                </Text>
              ))}
            </FlexColumn>
          )}
          {pack.skippedNodes.length > 0 && (
            <FlexColumn gap={0.25}>
              <Text size="small" weight={600}>
                Skipped ({pack.skippedNodes.length})
              </Text>
              {pack.skippedNodes.map((s) => (
                <Text key={s.nodeType} size="small" family="secondary">
                  {s.nodeType} - {SKIP_REASON_LABEL[s.reason]}
                </Text>
              ))}
            </FlexColumn>
          )}
        </FlexColumn>
      )}
    </FlexColumn>
  );
});

// ── Install / restart sub-section (Electron only) ─────────────────────────

const InstallPanel = memo(function InstallPanel({
  onInstalled
}: {
  onInstalled: () => void;
}) {
  const [spec, setSpec] = useState("");
  const [status, setStatus] = useState<
    { kind: "idle" }
    | { kind: "installing" }
    | { kind: "ok"; message: string }
    | { kind: "err"; message: string }
  >({ kind: "idle" });

  const handleInstall = useCallback(async () => {
    const trimmed = spec.trim();
    if (!trimmed) return;
    setStatus({ kind: "installing" });
    try {
      const api = window.api as
        | undefined
        | {
            nodePacks?: {
              install: (
                s: string
              ) => Promise<{ success: boolean; message: string }>;
            };
          };
      if (!api?.nodePacks?.install) {
        setStatus({
          kind: "err",
          message: "Node pack install is not available in this build."
        });
        return;
      }
      const result = await api.nodePacks.install(trimmed);
      if (result.success) {
        setStatus({ kind: "ok", message: result.message });
        setSpec("");
        onInstalled();
      } else {
        setStatus({ kind: "err", message: result.message });
      }
    } catch (err: unknown) {
      setStatus({
        kind: "err",
        message: err instanceof Error ? err.message : String(err)
      });
    }
  }, [spec, onInstalled]);

  return (
    <FlexColumn gap={1}>
      <Text size="normal" weight={600}>
        Install a pack
      </Text>
      <Text size="small" color="secondary">
        Paste an npm package name, e.g. <code>@acme/cool-nodes</code> or{" "}
        <code>cool-nodes@1.2.3</code>. The server must be restarted to load the
        new pack.
      </Text>
      <FlexRow gap={1} align="center">
        <TextInput
          value={spec}
          onChange={(e) => setSpec(e.target.value)}
          placeholder="@scope/package or package@version"
          fullWidth
          disabled={status.kind === "installing"}
        />
        <EditorButton
          variant="contained"
          onClick={handleInstall}
          disabled={!spec.trim() || status.kind === "installing"}
        >
          {status.kind === "installing" ? "Installing…" : "Install"}
        </EditorButton>
      </FlexRow>
      {status.kind === "ok" && (
        <AlertBanner severity="success" compact>
          {status.message}
        </AlertBanner>
      )}
      {status.kind === "err" && (
        <AlertBanner severity="error" compact>
          {status.message}
        </AlertBanner>
      )}
    </FlexColumn>
  );
});

// ── Main tab content ──────────────────────────────────────────────────────

function PackagesMenu() {
  const {
    packs,
    trust,
    isLoading,
    error,
    fetch,
    setTrusted,
    setAllowUnlisted,
    reload
  } = usePacksStore();

  useEffect(() => {
    void fetch();
  }, [fetch]);

  const trustedSet = new Set(trust.allowlist);
  const isTrusted = (name: string) =>
    trust.allowlist.includes("*") || trustedSet.has(name);

  return (
    <FlexColumn gap={2} sx={{ p: 2, maxWidth: 900 }}>
      <FlexColumn gap={0.5}>
        <Text size="big" weight={600}>
          Node Packs
        </Text>
        <Text size="small" color="secondary">
          Third-party packs run in-process as the server user. Only trust packs
          you know.
        </Text>
      </FlexColumn>

      <FlexColumn
        gap={1}
        sx={{ p: 2, border: "1px solid", borderColor: "divider", borderRadius: 1 }}
      >
        <Text size="normal" weight={600}>
          Trust defaults
        </Text>
        <LabeledSwitch
          label="Load packs that are not on the allowlist"
          checked={trust.allowUnlisted}
          onChange={(v) => void setAllowUnlisted(v)}
          description="Off in production by default. When off, only packs you've explicitly trusted will load."
        />
      </FlexColumn>

      {isElectron && <InstallPanel onInstalled={() => void reload()} />}

      <FlexRow gap={1} align="center" justify="space-between">
        <Text size="normal" weight={600}>
          Discovered packs ({packs.length})
        </Text>
        <EditorButton
          variant="outlined"
          density="compact"
          onClick={() => void reload()}
          disabled={isLoading}
        >
          {isLoading ? "Reloading…" : "Reload"}
        </EditorButton>
      </FlexRow>

      {error && (
        <AlertBanner severity="error" compact>
          {error}
        </AlertBanner>
      )}

      {!isLoading && packs.length === 0 && (
        <Text size="small" color="secondary">
          No node packs discovered. Install one with{" "}
          <code>npm install &lt;pack&gt;</code>
          {isElectron ? " or via the field above." : "."}
        </Text>
      )}

      <FlexColumn gap={1}>
        {packs.map((pack) => (
          <PackRow
            key={pack.name}
            pack={pack}
            trusted={isTrusted(pack.name)}
            onTrustChange={(trusted) => void setTrusted(pack.name, trusted)}
          />
        ))}
      </FlexColumn>
    </FlexColumn>
  );
}

export default memo(PackagesMenu);
