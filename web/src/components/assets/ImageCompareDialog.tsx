/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import { useTranslation } from "react-i18next";
import { CloseButton, Dialog, SPACING, getSpacingPx, Z_INDEX } from "../ui_primitives";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { ImageComparer } from "../widgets";
import { useAssetGridStore } from "../../stores/AssetGridStore";

const styles = (theme: Theme) =>
  css({
    ".compare-container": {
      width: "100%",
      height: "100%",
      position: "relative",
      backgroundColor: theme.vars.palette.background.default
    },
    ".actions": {
      zIndex: Z_INDEX.tooltip,
      position: "absolute",
      display: "flex",
      flexDirection: "row",
      gap: getSpacingPx(SPACING.xxl),
      top: "1em",
      right: "2em"
    }
  });

const ImageCompareDialog: React.FC = () => {
  const { t } = useTranslation(undefined, { keyPrefix: "i18n-next57" });
  const theme = useTheme();
  const compareAssets = useAssetGridStore((state) => state.compareAssets);
  const closeCompareView = useAssetGridStore((state) => state.closeCompareView);

  if (!compareAssets) {
    return null;
  }

  const [assetA, assetB] = compareAssets;
  const imageAUrl = assetA.get_url || "";
  const imageBUrl = assetB.get_url || "";

  if (!imageAUrl || !imageBUrl) {
    return null;
  }

  return (
    <Dialog
      css={styles(theme)}
      variant="fullscreen"
      open={compareAssets !== null}
      onClose={closeCompareView}
      aria-label={t("compare.compareImages")}
    >
      <div className="compare-container">
        <div className="actions">
          <CloseButton
            onClick={closeCompareView}
            tooltip={t("compare.close")}
            nodrag={false}
          />
        </div>
        <ImageComparer
          imageA={imageAUrl}
          imageB={imageBUrl}
          labelA={assetA.name || "A"}
          labelB={assetB.name || "B"}
          showLabels={true}
          showMetadata={true}
          initialMode="horizontal"
        />
      </div>
    </Dialog>
  );
};

export default ImageCompareDialog;

