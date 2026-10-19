/** @jsxImportSource @emotion/react */
import React from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import { createStyles } from "./EmptyThreadList.styles";
import { EmptyState } from "../../ui_primitives";

export const EmptyThreadList: React.FC<{ isFiltered?: boolean }> = ({
  isFiltered = false
}) => {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <li css={createStyles(theme)}>
      <EmptyState
        variant="empty"
        title={t(isFiltered ? "i18n-next54.thread.noMatching" : "i18n-next54.thread.noConversations")}
        description={
          isFiltered
            ? t("i18n-next54.thread.tryDifferentSearch")
            : t("i18n-next54.thread.startConversation")
        }
        size="small"
      />
    </li>
  );
};
