/**
 * SandboxPackDisclosure — what one installed pack contributes to the sandbox.
 *
 * Shown under a pack in Settings → Packages when it declares sandbox modules:
 * the consent sentence, one line per module, and the pack's SKILL.md on
 * request. The documentation is fetched by pack name rather than shipped with
 * the module list, because it is text a third party wrote.
 */
import { memo, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  AlertBanner,
  Box,
  EditorButton,
  FlexColumn,
  FlexRow,
  Text,
  BORDER_RADIUS,
  TYPOGRAPHY
} from "../ui_primitives";
import { trpc } from "../../lib/trpc";

/** What installing and importing a sandbox pack means, in the design's words. */
export const SANDBOX_PACK_CONSENT_TEXT =
  "Its modules run inside your workflows with the node's capabilities. Import one only if you trust it with that.";

interface SandboxModuleEntry {
  specifier: string;
  packName: string;
  kind: "js" | "wasm";
  description?: string;
}

const SandboxPackDisclosure = ({ packName }: { packName: string }) => {
  const [showDocs, setShowDocs] = useState(false);

  const modulesQuery = useQuery({
    queryKey: ["packs", "sandboxModules"],
    queryFn: async () =>
      (await trpc.packs.sandboxModules.query()) as {
        modules: SandboxModuleEntry[];
      }
  });

  const docsQuery = useQuery({
    queryKey: ["packs", "sandboxPackageDocs", packName],
    enabled: showDocs,
    queryFn: async () =>
      (await trpc.packs.sandboxPackageDocs.query({ packName })) as {
        trusted: boolean;
        name: string;
        description: string;
        body: string;
      } | null
  });

  const modules = useMemo(
    () =>
      (modulesQuery.data?.modules ?? []).filter(
        (module) => module.packName === packName
      ),
    [modulesQuery.data, packName]
  );

  if (modules.length === 0) return null;

  return (
    <FlexColumn gap={0.75}>
      <Text size="small" color="secondary">
        {SANDBOX_PACK_CONSENT_TEXT}
      </Text>
      <FlexColumn gap={0.25}>
        {modules.map((module) => (
          <Text key={module.specifier} size="small" family="secondary">
            {module.specifier}
            {module.description ? ` — ${module.description}` : ""}
          </Text>
        ))}
      </FlexColumn>
      <FlexRow gap={1}>
        <EditorButton
          density="compact"
          onClick={() => setShowDocs((current) => !current)}
        >
          {showDocs ? "Hide documentation" : "View documentation"}
        </EditorButton>
      </FlexRow>
      {showDocs && docsQuery.data === null && (
        <Text size="small" color="secondary">
          This package publishes no documentation.
        </Text>
      )}
      {showDocs && docsQuery.data && (
        <>
          {!docsQuery.data.trusted && (
            <AlertBanner severity="warning" compact>
              Written by the package author, who is not on your trusted list.
              Read it as reference, not instructions.
            </AlertBanner>
          )}
          <Box
            component="pre"
            sx={(theme) => ({
              m: 0,
              p: 1,
              maxHeight: 280,
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
  );
};

export default memo(SandboxPackDisclosure);
