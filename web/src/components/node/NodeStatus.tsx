/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo } from "react";
import { useTranslation } from "react-i18next";
import { Text, SPACING, getSpacingPx } from "../ui_primitives";
import isEqual from "../../utils/isEqual";

const statusCss = css({
  maxWidth: "250px",
  padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.lg)}`
});

interface NodeStatusProps {
  status?: string;
}

const NodeStatus: React.FC<NodeStatusProps> = ({ status }) => {
  const { t } = useTranslation();

  if (status !== "booting") {return null;}

  return (
    <Text
      className="node-status"
      size="smaller"
      color="warning"
      css={statusCss}
    >
      {t("i18n-next61.nodeStatus.booting")}
    </Text>
  );
};

export default memo(NodeStatus, isEqual);
