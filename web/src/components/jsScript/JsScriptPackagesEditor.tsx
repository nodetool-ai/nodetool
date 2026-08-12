/**
 * The sandbox packages a JS script's body may import — the same choice the
 * Code node's `packages` property offers, over the same catalog
 * (`packs.sandboxModules`), writing the same declaration stamped with the pack
 * version and content digest it was chosen against.
 *
 * Choosing a package is a consent decision, so the panel repeats what it means
 * in the trust model's own words (SANDBOX_CONSENT_TEXT, shared with the node
 * property so the two cannot drift).
 */
import { memo, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SandboxModuleDeclaration } from "@nodetool-ai/protocol";

import {
  AlertBanner,
  Box,
  Checkbox,
  Chip,
  FlexColumn,
  FlexRow,
  Label,
  LoadingSpinner,
  Text,
  BORDER_RADIUS,
  SPACING
} from "../ui_primitives";
import { trpc } from "../../lib/trpc";
import { SANDBOX_CONSENT_TEXT } from "../properties/SandboxPackagesProperty";

interface SandboxModuleEntry {
  specifier: string;
  packName: string;
  packVersion?: string;
  kind: "js" | "wasm" | "host";
  description?: string;
  contentDigest?: string;
}

export interface JsScriptPackagesEditorProps {
  packages: readonly SandboxModuleDeclaration[];
  readOnly?: boolean;
  onChange: (packages: SandboxModuleDeclaration[]) => void;
}

const JsScriptPackagesEditor = ({
  packages,
  readOnly = false,
  onChange
}: JsScriptPackagesEditorProps) => {
  const modulesQuery = useQuery({
    queryKey: ["packs", "sandboxModules"],
    queryFn: async () =>
      (await trpc.packs.sandboxModules.query()) as {
        modules: SandboxModuleEntry[];
      }
  });

  const modules = useMemo(
    () => modulesQuery.data?.modules ?? [],
    [modulesQuery.data]
  );

  const selected = useMemo(
    () => new Set(packages.map((declaration) => declaration.specifier)),
    [packages]
  );

  /**
   * Declarations no installed module answers — the pack was removed, or its
   * discovery failed. They stay in the document and the run fails on them, so
   * the picker has to show them: an entry nobody can see is one nobody can
   * remove.
   */
  const missing = useMemo(() => {
    if (!modulesQuery.isSuccess) return [];
    const installed = new Set(modules.map((entry) => entry.specifier));
    return packages
      .map((declaration) => declaration.specifier)
      .filter((specifier) => !installed.has(specifier));
  }, [modules, modulesQuery.isSuccess, packages]);

  const toggle = useCallback(
    (entry: SandboxModuleEntry, checked: boolean) => {
      const kept = packages.filter(
        (declaration) => declaration.specifier !== entry.specifier
      );
      if (!checked) {
        onChange(kept);
        return;
      }
      onChange([
        ...kept,
        {
          specifier: entry.specifier,
          ...(entry.packVersion === undefined
            ? {}
            : { resolvedPackVersion: entry.packVersion }),
          ...(entry.contentDigest === undefined
            ? {}
            : { contentDigest: entry.contentDigest })
        }
      ]);
    },
    [onChange, packages]
  );

  const removeMissing = useCallback(
    (specifier: string) => {
      onChange(
        packages.filter((declaration) => declaration.specifier !== specifier)
      );
    },
    [onChange, packages]
  );

  return (
    <FlexColumn gap={SPACING.sm}>
      <Label>Packages</Label>
      <Text size="small" color="secondary">
        {SANDBOX_CONSENT_TEXT}
      </Text>

      {modulesQuery.isLoading && <LoadingSpinner size={16} />}
      {modulesQuery.isError && (
        <AlertBanner severity="error" compact>
          Installed sandbox packages could not be read.
        </AlertBanner>
      )}
      {!modulesQuery.isLoading &&
        modules.length === 0 &&
        missing.length === 0 && (
          <Text size="small" color="secondary">
            No sandbox packages are installed.
          </Text>
        )}

      {modules.map((entry) => (
        <FlexRow key={entry.specifier} gap={SPACING.sm} align="center">
          <Checkbox
            checked={selected.has(entry.specifier)}
            disabled={readOnly}
            inputProps={{ "aria-label": entry.specifier }}
            onChange={(_event, next) => toggle(entry, next)}
          />
          <Text size="small" truncate sx={{ flex: 1, minWidth: 0 }}>
            {entry.specifier}
          </Text>
          <Chip label={entry.kind} compact />
        </FlexRow>
      ))}

      {missing.map((specifier) => (
        <FlexRow
          key={`missing-${specifier}`}
          gap={SPACING.sm}
          align="center"
          sx={(theme) => ({
            px: 1,
            borderRadius: BORDER_RADIUS.md,
            border: `1px solid ${theme.vars.palette.warning.main}`
          })}
        >
          <Checkbox
            checked
            disabled={readOnly}
            inputProps={{ "aria-label": specifier }}
            onChange={() => removeMissing(specifier)}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Text size="small" truncate>
              {specifier}
            </Text>
          </Box>
          <Chip label="unavailable" color="warning" compact />
        </FlexRow>
      ))}
    </FlexColumn>
  );
};

export default memo(JsScriptPackagesEditor);
