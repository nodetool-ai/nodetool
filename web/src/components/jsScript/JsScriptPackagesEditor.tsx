/**
 * The sandbox packages a JS script's body may import — the same catalog
 * (`packs.sandboxModules`) as the Code node's `packages` property, writing
 * the same declaration stamped with the pack version and content digest it
 * was chosen against.
 *
 * Choosing a package is a consent decision, so the panel repeats what it means
 * in the trust model's own words (SANDBOX_CONSENT_TEXT, shared with the node
 * property so the two cannot drift).
 */
import { memo, useCallback, useId, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SandboxModuleDeclaration } from "@nodetool-ai/protocol";

import {
  AlertBanner,
  Autocomplete,
  Chip,
  FlexColumn,
  FlexRow,
  Label,
  Text,
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

interface PackageOption {
  specifier: string;
  packName: string;
  packVersion?: string;
  kind: SandboxModuleEntry["kind"] | "unavailable";
  description?: string;
  contentDigest?: string;
  unavailable?: boolean;
}

function stampDeclaration(entry: SandboxModuleEntry): SandboxModuleDeclaration {
  return {
    specifier: entry.specifier,
    ...(entry.packVersion === undefined
      ? {}
      : { resolvedPackVersion: entry.packVersion }),
    ...(entry.contentDigest === undefined
      ? {}
      : { contentDigest: entry.contentDigest })
  };
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
  const fieldId = useId();
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

  const missingSet = useMemo(() => new Set(missing), [missing]);

  const selectedOptions = useMemo<PackageOption[]>(() => {
    const bySpecifier = new Map(
      modules.map((entry) => [entry.specifier, entry] as const)
    );
    return packages.map((declaration) => {
      const installed = bySpecifier.get(declaration.specifier);
      if (installed) {
        return installed;
      }
      return {
        specifier: declaration.specifier,
        packName: declaration.specifier,
        kind: missingSet.has(declaration.specifier)
          ? "unavailable"
          : "js",
        unavailable: missingSet.has(declaration.specifier)
      };
    });
  }, [missingSet, modules, packages]);

  const handleChange = useCallback(
    (_event: unknown, next: PackageOption[]) => {
      const previous = new Map(
        packages.map((declaration) => [declaration.specifier, declaration])
      );
      const catalog = new Map(
        modules.map((entry) => [entry.specifier, entry])
      );
      onChange(
        next.map((option) => {
          const existing = previous.get(option.specifier);
          if (existing) {
            return existing;
          }
          const installed = catalog.get(option.specifier);
          if (installed) {
            return stampDeclaration(installed);
          }
          return { specifier: option.specifier };
        })
      );
    },
    [modules, onChange, packages]
  );

  const filterOptions = useCallback(
    (options: PackageOption[], state: { inputValue: string }) => {
      const query = state.inputValue.trim().toLowerCase();
      if (query === "") {
        return options;
      }
      return options.filter((option) => {
        if (option.specifier.toLowerCase().includes(query)) {
          return true;
        }
        if (option.packName.toLowerCase().includes(query)) {
          return true;
        }
        return option.description?.toLowerCase().includes(query) ?? false;
      });
    },
    []
  );

  const catalogEmpty =
    !modulesQuery.isLoading && modules.length === 0 && missing.length === 0;

  return (
    <FlexColumn gap={SPACING.sm}>
      <Label htmlFor={fieldId}>Packages</Label>
      <Text size="small" color="secondary">
        {SANDBOX_CONSENT_TEXT}
      </Text>

      {modulesQuery.isError && (
        <AlertBanner severity="error" compact>
          Installed sandbox packages could not be read.
        </AlertBanner>
      )}
      {catalogEmpty && (
        <Text size="small" color="secondary">
          No sandbox packages are installed.
        </Text>
      )}

      <Autocomplete<PackageOption, true>
        id={fieldId}
        multiple
        compact
        disableCloseOnSelect
        filterSelectedOptions
        disabled={readOnly || modulesQuery.isError || catalogEmpty}
        loading={modulesQuery.isLoading}
        options={modules}
        value={selectedOptions}
        placeholder="Add a package"
        noOptionsText="No matching packages"
        getOptionLabel={(option) => option.specifier}
        isOptionEqualToValue={(option, value) =>
          option.specifier === value.specifier
        }
        filterOptions={filterOptions}
        onChange={handleChange}
        renderTags={(value, getTagProps) =>
          value.map((option, index) => {
            const { key, ...tagProps } = getTagProps({ index });
            return (
              <Chip
                {...tagProps}
                key={key}
                label={option.specifier}
                compact
                color={option.unavailable ? "warning" : "default"}
              />
            );
          })
        }
        renderOption={(props, option) => {
          const { key, ...rest } = props;
          return (
            <li key={key} {...rest}>
              <FlexColumn
                gap={SPACING.micro}
                sx={{ minWidth: 0, width: "100%" }}
              >
                <FlexRow gap={SPACING.sm} align="center">
                  <Text size="small" truncate sx={{ flex: 1, minWidth: 0 }}>
                    {option.specifier}
                  </Text>
                  <Chip label={option.kind} compact />
                </FlexRow>
                {option.description ? (
                  <Text size="smaller" color="secondary">
                    {option.description}
                  </Text>
                ) : null}
              </FlexColumn>
            </li>
          );
        }}
        sx={{ width: "100%" }}
      />

      {missing.length > 0 && (
        <AlertBanner severity="warning" compact>
          Saved with this script, but no installed pack declares them. The
          script fails until you reinstall the pack or remove the chip.
        </AlertBanner>
      )}
    </FlexColumn>
  );
};

export default memo(JsScriptPackagesEditor);
