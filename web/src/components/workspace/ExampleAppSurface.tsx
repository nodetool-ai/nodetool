import React, { Suspense } from "react";

import { useInstallExampleApp } from "../../hooks/useInstallExampleApp";
import type { WorkspaceTab } from "../../stores/WorkspaceTabsStore";
import {
  Box,
  EditorButton,
  FlexColumn,
  LoadingSpinner,
  SaveStatus,
  SPACING
} from "../ui_primitives";
import WorkspaceDocumentBar from "./WorkspaceDocumentBar";

const ExampleAppUseView = React.lazy(
  () => import("../portal/ExampleAppUseView")
);

// The app sits in a centered column. Phones keep the narrow gutter so widgets
// keep their width. Wide screens get a page-like margin.
const COLUMN_SX = {
  minHeight: 0,
  width: "100%",
  maxWidth: 1200,
  marginX: "auto",
  paddingX: { xs: SPACING.lg, md: SPACING.xxxl }
} as const;

interface ExampleAppSurfaceProps {
  slug: string;
  title: string;
  /** The workspace tab, whose document bar tops the surface. */
  tab: WorkspaceTab;
}

/**
 * Runs a shipped example app in its own tab without installing it. The bar
 * says it is read only, and Edit app makes an editable copy and opens that
 * copy in a second tab.
 */
const ExampleAppSurface = ({ slug, title, tab }: ExampleAppSurfaceProps) => {
  const install = useInstallExampleApp();
  const installing = install.isPending;
  return (
    <>
      <WorkspaceDocumentBar
        tab={tab}
        status={<SaveStatus state="readOnly" />}
        actions={
          <EditorButton
            variant="contained"
            density="normal"
            loading={installing}
            onClick={() => install.mutate({ slug, name: title })}
          >
            {installing ? "Installing…" : "Edit app"}
          </EditorButton>
        }
      />
      <FlexColumn sx={{ ...COLUMN_SX, flex: 1, paddingTop: SPACING.sm }}>
        <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          <Suspense fallback={<LoadingSpinner text="Loading app" />}>
            <ExampleAppUseView slug={slug} />
          </Suspense>
        </Box>
      </FlexColumn>
    </>
  );
};

export default ExampleAppSurface;
