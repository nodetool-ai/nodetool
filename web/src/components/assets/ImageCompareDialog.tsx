/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import { Dialog } from "@mui/material";
import { CloseButton } from "../ui_primitives";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { ImageComparer } from "../widgets";
import { useAssetGridStore } from "../../stores/AssetGridStore";

import { useCombo } from "../../stores/KeyPressedStore";

const styles = (theme: Theme) =>
  css({
    "&": {
      margin: 0,
      height: "100%",
      width: "100%",
      top: 0,
      display: "block"
    },
    ".MuiModal-root": {
      zIndex: 15000
    },
    ".MuiPaper-root": {
      overflow: "hidden",
      height: "100%",
      backgroundColor: theme.vars.palette.grey[900],
      width: "100%",
      maxWidth: "100%",
      maxHeight: "100%",
      zIndex: 11000,
      margin: 0
    },
    ".compare-container": {
      width: "100%",
      height: "100%",
      position: "relative"
    },
    ".actions": {
      zIndex: 10000,
      position: "absolute",
      display: "flex",
      flexDirection: "row",
      gap: "1.5em",
      top: "1em",
      right: "2em"
    },
    ".actions .button": {
      width: "1.75em",
      height: "1.75em",
      backgroundColor: "rgba(153, 153, 153, 0.67)",
      color: theme.vars.palette.grey[900],
      borderRadius: "0.2em",
      padding: "0.3em"
    },
    ".actions button svg": {
      fontSize: "1.5em"
    },
    ".actions .button:hover": {
      backgroundColor: theme.vars.palette.grey[500]
    }
  });

const ImageCompareDialog: React.FC = () => {
  const theme = useTheme();
  const compareAssets = useAssetGridStore((state) => state.compareAssets);
  const closeCompareView = useAssetGridStore((state) => state.closeCompareView);

  // Only handle Escape when dialog is open
  useCombo(
    ["Escape"],
    React.useCallback(() => {
      if (compareAssets) {
        closeCompareView();
      }
    }, [compareAssets, closeCompareView])
  );

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
      maxWidth={false}
      fullWidth
      open={compareAssets !== null}
      onClose={closeCompareView}
    >
      <div className="compare-container">
        <div className="actions">
          <CloseButton
            className="button close"
            onClick={closeCompareView}
            tooltip="Close"
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

