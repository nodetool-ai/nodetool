/** @jsxImportSource @emotion/react */
import React, { memo, useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import Actions from "./Actions";
import { outputStyles } from "./styles";
import { getSpacingPx, SPACING } from "../../ui_primitives";

export const BooleanRenderer: React.FC<{
  value: boolean;
}> = ({ value }) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => outputStyles(theme), [theme]);
  const boolStr = String(value).toUpperCase();
  return (
    <div className="output value" css={cssStyles}>
      <Actions copyValue={boolStr} />
      <p style={{ padding: getSpacingPx(SPACING.xl), color: "inherit" }}>{boolStr}</p>
    </div>
  );
};

export default memo(BooleanRenderer);
