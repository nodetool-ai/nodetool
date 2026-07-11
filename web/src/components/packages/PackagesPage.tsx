import React, { memo } from "react";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import ManagerPageLayout from "../panels/ManagerPageLayout";
import PackageManager from "./PackageManager";

/**
 * Full-screen Package Manager page: the unified installer (runtimes and node
 * packs) wrapped in the shared manager chrome (header + back button).
 */
const PackagesPage: React.FC = () => (
  <ManagerPageLayout
    icon={<Inventory2OutlinedIcon sx={{ fontSize: 22 }} />}
    title="Package Manager"
    subtitle="Install runtimes and node packs in one place."
    padded={false}
  >
    <PackageManager />
  </ManagerPageLayout>
);

PackagesPage.displayName = "PackagesPage";

export default memo(PackagesPage);
