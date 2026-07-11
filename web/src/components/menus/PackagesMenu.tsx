/** @jsxImportSource @emotion/react */
/**
 * Settings → Packages tab.
 *
 * Lists every discovered node pack with its load status and trust toggle.
 * Trust changes write `~/.config/nodetool/packs.json` and trigger a soft
 * reload. Install / uninstall are Electron-only and require a server restart.
 */

import { memo, useCallback, useEffect, useState } from "react";

import {
  AlertBanner,
  Chip,
  EditorButton,
  FlexColumn,
  FlexRow,
  LabeledSwitch,
  Text,
  TextInput,
  BORDER_RADIUS,
  MOTION
} from "../ui_primitives";
import { isElectron } from "../../lib/env";
import usePacksStore, {
  type PackInfo,
  type SkipReason
} from "../../stores/PacksStore";
import { useShallow } from "zustand/react/shallow";

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
      sx={(theme) => ({
        px: 2.25,
        py: 1.75,
        borderRadius: BORDER_RADIUS.xl,
        border: `1px solid ${theme.vars.palette.divider}`,
        backgroundColor: theme.vars.palette.background.paper,
        transition: `border-color ${MOTION.fast}`,
        "&:hover": { borderColor: theme.vars.palette.action.focus }
      })}
    >
      <FlexRow gap={3} align="center" sx={{ flexWrap: "wrap" }}>
        <FlexColumn gap={0.5} sx={{ minWidth: 0, flex: 1 }}>
          <FlexRow gap={1} align="center" sx={{ flexWrap: "wrap" }}>
            <Text size="normal" weight={600} truncate>
              {pack.name}
            </Text>
            {pack.version && (
              <Text size="small" color="secondary" family="secondary">
                v{pack.version}
              </Text>
            )}
            <Chip label={statusLabel(pack)} color={statusColor(pack)} compact />
          </FlexRow>
          {pack.reason && (
            <Text size="small" color="secondary">
              {pack.reason}
            </Text>
          )}
        </FlexColumn>
        <FlexRow gap={1.5} align="center" sx={{ flexShrink: 0 }}>
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

      {expanded && (
        <FlexColumn gap={1} sx={{ mt: 1 }}>
          {pack.error && (
            <AlertBanner severity="error" compact>
              {pack.error}
            </AlertBanner>
          )}
          {pack.registered.length > 0 && (
            <FlexColumn gap={0.5}>
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
            <FlexColumn gap={0.5}>
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
  } = usePacksStore(
    useShallow((state) => ({
      packs: state.packs,
      trust: state.trust,
      isLoading: state.isLoading,
      error: state.error,
      fetch: state.fetch,
      setTrusted: state.setTrusted,
      setAllowUnlisted: state.setAllowUnlisted,
      reload: state.reload
    }))
  );

  useEffect(() => {
    void fetch();
  }, [fetch]);

  const trustedSet = new Set(trust.allowlist);
  const isTrusted = (name: string) =>
    trust.allowlist.includes("*") || trustedSet.has(name);

  return (
    <FlexColumn gap={3.5} sx={{ maxWidth: 880 }}>
      <FlexColumn gap={1.75}>
        <Text size="normal" weight={600}>
          Trust defaults
        </Text>
        <FlexRow
          gap={3}
          align="center"
          sx={(theme) => ({
            px: 2.25,
            py: 2,
            borderRadius: BORDER_RADIUS.xl,
            border: `1px solid rgba(${theme.vars.palette.warning.mainChannel} / 0.18)`,
            backgroundColor: `rgba(${theme.vars.palette.warning.mainChannel} / 0.04)`
          })}
        >
          <FlexColumn gap={0.5} sx={{ flex: 1, minWidth: 0 }}>
            <Text size="normal" weight={500}>
              Load packs that are not on the allowlist
            </Text>
            <Text size="small" color="secondary">
              Off in production by default. When off, only packs you&apos;ve
              explicitly trusted will load.
            </Text>
          </FlexColumn>
          <LabeledSwitch
            label=""
            checked={trust.allowUnlisted}
            onChange={(v) => void setAllowUnlisted(v)}
          />
        </FlexRow>
      </FlexColumn>

      {isElectron && <InstallPanel onInstalled={() => void reload()} />}

      <FlexColumn gap={1.75}>
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

        {!isLoading && packs.length === 0 ? (
          <FlexRow
            sx={(theme) => ({
              px: 2.75,
              py: 2.75,
              borderRadius: BORDER_RADIUS.xl,
              border: `1px dashed ${theme.vars.palette.divider}`,
              backgroundColor: theme.vars.palette.background.default
            })}
          >
            <Text size="small" color="secondary">
              No node packs discovered. Install one with{" "}
              <code>npm install &lt;pack&gt;</code>
              {isElectron ? " or via the field above." : "."}
            </Text>
          </FlexRow>
        ) : (
          <FlexColumn gap={1.25}>
            {packs.map((pack) => (
              <PackRow
                key={pack.name}
                pack={pack}
                trusted={isTrusted(pack.name)}
                onTrustChange={(trusted) => void setTrusted(pack.name, trusted)}
              />
            ))}
          </FlexColumn>
        )}
      </FlexColumn>
    </FlexColumn>
  );
}

export default memo(PackagesMenu);
