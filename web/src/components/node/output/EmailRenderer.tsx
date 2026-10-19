/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import { MaybeMarkdown } from "./markdown";
import { outputStyles } from "./styles";

export type Email = {
  sender: string;
  to: string;
  cc?: string;
  subject: string;
  body: string;
};

export const EmailRenderer: React.FC<{ value: Email }> = ({ value }) => {
  const { t } = useTranslation("translation", { keyPrefix: "i18n-next106" });
  const theme = useTheme();
  return (
    <div css={outputStyles(theme)}>
      <div className="email-header">
        <p>
          <strong>{t("email.from")}:</strong> {value.sender}
        </p>
        <p>
          <strong>{t("email.to")}:</strong> {value.to}
        </p>
        {value.cc && (
          <p>
            <strong>{t("email.cc")}:</strong> {value.cc}
          </p>
        )}
        <p>
          <strong>{t("email.subject")}:</strong> {value.subject}
        </p>
      </div>
      <div className="email-body">
        <MaybeMarkdown text={value.body} />
      </div>
    </div>
  );
};

export default memo(EmailRenderer);
