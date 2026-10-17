import React, { memo } from "react";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import { PageLayout, ICON_SIZE } from "../ui_primitives";
import PackageManager from "./PackageManager";

/**
 * Full-screen Package Manager page: the unified installer (runtimes and node
 * packs) wrapped in the shared manager chrome (header + back button).
 */
const PackagesPage: React.FC = () => (
  <PageLayout
    icon={<Inventory2OutlinedIcon sx={{ fontSize: ICON_SIZE.lg }} />}
    title="Package manager"
    subtitle="Install runtimes and node packs in one place."
    docsTopic="nodePacks"
    padded={false}
  >
    <PackageManager />
  </PageLayout>
);

PackagesPage.displayName = "PackagesPage";

export default memo(PackagesPage);
