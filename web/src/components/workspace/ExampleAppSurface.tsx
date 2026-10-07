import React, { Suspense } from "react";

import { useInstallExampleApp } from "../../hooks/useInstallExampleApp";
import {
  Box,
  EditorButton,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  SPACING
} from "../ui_primitives";

const ExampleAppUseView = React.lazy(
  () => import("../portal/ExampleAppUseView")
);

// The toolbar and the app share one centered column. Phones keep the narrow
// gutter so widgets keep their width. Wide screens get a page-like margin.
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
}

/**
 * Runs a shipped example app in its own tab without installing it. Edit app
 * makes an editable copy and opens that copy in a second tab.
 */
const ExampleAppSurface = ({ slug, title }: ExampleAppSurfaceProps) => {
  const install = useInstallExampleApp();
  const installing = install.isPending;
  return (
    <FlexColumn fullHeight sx={COLUMN_SX}>
      <FlexRow justify="flex-end" sx={{ paddingY: SPACING.sm }}>
        <EditorButton
          density="compact"
          disabled={installing}
          onClick={() => install.mutate({ slug, name: title })}
        >
          {installing ? "Installing…" : "Edit app"}
        </EditorButton>
      </FlexRow>
      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <Suspense fallback={<LoadingSpinner text="Loading app" />}>
          <ExampleAppUseView slug={slug} />
        </Suspense>
      </Box>
    </FlexColumn>
  );
};

export default ExampleAppSurface;
