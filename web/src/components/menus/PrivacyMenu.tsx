import React, { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { AnalyticsClientType } from "@nodetool-ai/analytics";
import { useProductAnalytics } from "../../hooks/useProductAnalytics";
import { resolveWebClientType } from "../../lib/analytics";
import {
  Box,
  Caption,
  CodeBlock,
  EditorButton,
  FlexColumn,
  GAP,
  LabeledSwitch,
  SPACING,
  Text
} from "../ui_primitives";

const BulletList: React.FC<{ items: readonly string[] }> = ({ items }) => (
  <Box component="ul" sx={{ margin: 0, paddingLeft: SPACING.xl }}>
    {items.map((item) => (
      <Box component="li" key={item} sx={{ marginBottom: SPACING.xs }}>
        <Text size="small">{item}</Text>
      </Box>
    ))}
  </Box>
);

/** Settings → Privacy: analytics consent and the exact events sent. */
const PrivacyMenu: React.FC = () => {
  const { t } = useTranslation();
  const { client, consent, recentEvents } = useProductAnalytics();
  const enabled = consent?.productAnalytics === "granted";

  const handleToggle = useCallback(
    (checked: boolean) => {
      void client?.setConsent("productAnalytics", checked ? "granted" : "denied");
    },
    [client]
  );

  const handleResetId = useCallback(() => {
    void client?.resetIdentity();
  }, [client]);

  return (
    <Box>
      <Text size="big" id="product-analytics">
        {t("i18n-cont-settings-01.privacy.title")}
      </Text>
      <div className="settings-section">
        {client ? (
          <FlexColumn gap={GAP.comfortable}>
            <LabeledSwitch
              id="product-analytics-switch"
              label={t("i18n-cont-settings-01.privacy.shareAnalytics")}
              description={t("i18n-cont-settings-01.privacy.shareAnalyticsDescription", {
                client: t(`i18n-cont-settings-01.privacy.clients.${resolveWebClientType()}` as `i18n-cont-settings-01.privacy.clients.${AnalyticsClientType}`)
              })}
              checked={enabled}
              onChange={handleToggle}
            />
            <Caption>
            {t("i18n-cont-settings-01.privacy.disableDescription")}
            </Caption>
          </FlexColumn>
        ) : (
          <Caption>
            {t("i18n-cont-settings-01.privacy.unavailable")}
          </Caption>
        )}
      </div>

      <Text size="big" id="what-is-collected">
        {t("i18n-cont-settings-01.privacy.collectedTitle")}
      </Text>
      <div className="settings-section">
        <FlexColumn gap={GAP.normal}>
          <Text size="small" weight={500}>
            {t("i18n-cont-settings-01.privacy.whenEnabled")}
          </Text>
          <BulletList items={t("screens4_5.privacy.collectedItems", { returnObjects: true }) as string[]} />
          <Text size="small" weight={500}>
            {t("i18n-cont-settings-01.privacy.never")}
          </Text>
          <BulletList items={t("screens4_5.privacy.neverCollectedItems", { returnObjects: true }) as string[]} />
          <Caption>
            {t("i18n-cont-settings-01.privacy.retention")}
          </Caption>
        </FlexColumn>
      </div>

      <Text size="big" id="diagnostics">
        {t("i18n-cont-settings-01.privacy.diagnosticsTitle")}
      </Text>
      <div className="settings-section">
        <Text size="small">
          {t("i18n-cont-settings-01.privacy.diagnosticsDescription")}
        </Text>
      </div>

      <Text size="big" id="recent-events">
        {t("i18n-cont-settings-01.privacy.recentEventsTitle")}
      </Text>
      <div className="settings-section">
        <FlexColumn gap={GAP.normal}>
          {recentEvents.length > 0 ? (
            <CodeBlock language="json" copyable maxHeight="24rem">
              {JSON.stringify(recentEvents, null, 2)}
            </CodeBlock>
          ) : (
            <Caption>
              {enabled
                ? t("i18n-cont-settings-01.privacy.noRecentEvents")
                : t("i18n-cont-settings-01.privacy.analyticsOff")}
            </Caption>
          )}
          {enabled && (
            <Box>
              <EditorButton size="small" variant="outlined" onClick={handleResetId}>
                {t("i18n-cont-settings-01.privacy.resetAnonymousId")}
              </EditorButton>
            </Box>
          )}
        </FlexColumn>
      </div>
    </Box>
  );
};

export default memo(PrivacyMenu);
