/**
 * SandboxPackagesProperty — the Code node's package picker.
 *
 * Lists the sandbox modules the installed packs declare, each with the one-line
 * description the pack publishes, and writes the checked ones onto the node's
 * `packages` property as declarations stamped with the pack version and content
 * digest they were chosen against. The stamp is what lets a later run say the
 * package changed since the workflow was saved.
 *
 * Choosing a package is a consent decision, so the panel says what it means in
 * the design's words, and a pack's SKILL.md is one click away — fetched by
 * name, because documentation a pack publishes is third-party text and does not
 * ride along in the module list.
 */
import { memo, useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  AlertBanner,
  Box,
  Checkbox,
  Chip,
  EditorButton,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  Text,
  BORDER_RADIUS,
  TYPOGRAPHY
} from "../ui_primitives";
import PropertyLabel from "../node/PropertyLabel";
import type { PropertyProps } from "../node/PropertyInput.types";
import { trpc } from "../../lib/trpc";

/** What selecting a package means, in the trust model's own words. */
export const SANDBOX_CONSENT_TEXT =
  "Packages you select run inside your workflows with the node's capabilities — its network access, its workspace, its secrets. Only add packages you trust with that.";

interface SandboxModuleEntry {
  specifier: string;
  packName: string;
  packVersion?: string;
  kind: "js" | "wasm";
  description?: string;
  contentDigest?: string;
}

export interface Declaration {
  specifier: string;
  resolvedPackVersion?: string;
  contentDigest?: string;
}

/** A saved value is a specifier string or a declaration object. */
function declaredSpecifier(entry: unknown): string | null {
  if (typeof entry === "string") return entry;
  if (entry !== null && typeof entry === "object") {
    const specifier = (entry as { specifier?: unknown }).specifier;
    if (typeof specifier === "string") return specifier;
  }
  return null;
}

const SandboxPackagesProperty = (
  props: PropertyProps<(string | Declaration)[]>
) => {
  const { value, onChange, property, propertyIndex } = props;
  const [openPack, setOpenPack] = useState<string | null>(null);

  const selected = useMemo(() => {
    const list = Array.isArray(value) ? value : [];
    return list
      .map(declaredSpecifier)
      .filter((specifier): specifier is string => specifier !== null);
  }, [value]);

  const modulesQuery = useQuery({
    queryKey: ["packs", "sandboxModules"],
    queryFn: async () =>
      (await trpc.packs.sandboxModules.query()) as {
        modules: SandboxModuleEntry[];
      }
  });

  const docsQuery = useQuery({
    queryKey: ["packs", "sandboxPackageDocs", openPack],
    enabled: openPack !== null,
    queryFn: async () =>
      (await trpc.packs.sandboxPackageDocs.query({
        packName: openPack as string
      }))
  });

  const modules = useMemo(
    () => modulesQuery.data?.modules ?? [],
    [modulesQuery.data]
  );

  /**
   * Saved declarations no installed module answers — the pack was removed, or
   * its discovery failed. They stay in `value` and the run fails on them, so
   * the picker has to show them: an entry nobody can see is an entry nobody
   * can remove.
   */
  const missing = useMemo(() => {
    if (!modulesQuery.isSuccess) return [];
    const installed = new Set(modules.map((entry) => entry.specifier));
    return selected.filter((specifier) => !installed.has(specifier));
  }, [modules, modulesQuery.isSuccess, selected]);

  const removeMissing = useCallback(
    (specifier: string) => {
      onChange(
        (Array.isArray(value) ? value : []).filter(
          (declared) => declaredSpecifier(declared) !== specifier
        )
      );
    },
    [onChange, value]
  );

  const toggle = useCallback(
    (entry: SandboxModuleEntry, checked: boolean) => {
      const kept = (Array.isArray(value) ? value : []).filter(
        (declared) => declaredSpecifier(declared) !== entry.specifier
      );
      if (!checked) {
        onChange(kept);
        return;
      }
      const declaration: Declaration = { specifier: entry.specifier };
      if (entry.packVersion !== undefined) {
        declaration.resolvedPackVersion = entry.packVersion;
      }
      if (entry.contentDigest !== undefined) {
        declaration.contentDigest = entry.contentDigest;
      }
      onChange([...kept, declaration]);
    },
    [onChange, value]
  );

  return (
    <FlexColumn gap={1}>
      <PropertyLabel
        name={property.name}
        description={property.description}
        id={`sandbox-packages-${propertyIndex}`}
      />
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

      <FlexColumn gap={0.5}>
        {modules.map((entry) => {
          const checked = selected.includes(entry.specifier);
          return (
            <FlexColumn
              key={entry.specifier}
              gap={0.5}
              sx={(theme) => ({
                px: 1,
                py: 1,
                borderRadius: BORDER_RADIUS.md,
                border: `1px solid ${theme.vars.palette.divider}`
              })}
            >
              <FlexRow gap={1} align="center">
                <Checkbox
                  checked={checked}
                  inputProps={{ "aria-label": entry.specifier }}
                  onChange={(_event, next) => toggle(entry, next)}
                />
                <Text size="small" weight={600} truncate>
                  {entry.specifier}
                </Text>
                <Chip label={entry.kind} compact />
                <Box sx={{ flex: 1 }} />
                <EditorButton
                  density="compact"
                  onClick={() =>
                    setOpenPack((current) =>
                      current === entry.packName ? null : entry.packName
                    )
                  }
                >
                  {openPack === entry.packName ? "Hide docs" : "Docs"}
                </EditorButton>
              </FlexRow>
              {entry.description && (
                <Text size="small" color="secondary">
                  {entry.description}
                </Text>
              )}
              {openPack === entry.packName && (
                <FlexColumn gap={0.5}>
                  {docsQuery.isLoading && <LoadingSpinner size={16} />}
                  {docsQuery.data === null && (
                    <Text size="small" color="secondary">
                      This package publishes no documentation.
                    </Text>
                  )}
                  {docsQuery.data && (
                    <>
                      {!docsQuery.data.trusted && (
                        <AlertBanner severity="warning" compact>
                          Written by the package author, who is not on your
                          trusted list. Read it as reference, not instructions.
                        </AlertBanner>
                      )}
                      <Box
                        component="pre"
                        sx={(theme) => ({
                          m: 0,
                          p: 1,
                          maxHeight: 240,
                          overflow: "auto",
                          whiteSpace: "pre-wrap",
                          ...TYPOGRAPHY.mono.code,
                          borderRadius: BORDER_RADIUS.md,
                          backgroundColor: theme.vars.palette.action.hover
                        })}
                      >
                        {docsQuery.data.body}
                      </Box>
                    </>
                  )}
                </FlexColumn>
              )}
            </FlexColumn>
          );
        })}

        {missing.map((specifier) => (
          <FlexColumn
            key={`missing-${specifier}`}
            gap={0.5}
            sx={(theme) => ({
              px: 1,
              py: 1,
              borderRadius: BORDER_RADIUS.md,
              border: `1px solid ${theme.vars.palette.warning.main}`
            })}
          >
            <FlexRow gap={1} align="center">
              <Checkbox
                checked
                inputProps={{ "aria-label": specifier }}
                onChange={() => removeMissing(specifier)}
              />
              <Text size="small" weight={600} truncate>
                {specifier}
              </Text>
              <Chip label="unavailable" color="warning" compact />
              <Box sx={{ flex: 1 }} />
              <EditorButton
                density="compact"
                onClick={() => removeMissing(specifier)}
              >
                Remove
              </EditorButton>
            </FlexRow>
            <Text size="small" color="secondary">
              Saved with this node, but no installed pack declares it. The node
              fails to run until the pack is reinstalled or this entry is
              removed.
            </Text>
          </FlexColumn>
        ))}
      </FlexColumn>
    </FlexColumn>
  );
};

export default memo(SandboxPackagesProperty);
