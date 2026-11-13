/**
 * Settings → Privacy → Product emails.
 *
 * Shows and changes the marketing-email consent stored on the Supabase
 * account. Off unless the person turned it on, here or at sign-in.
 */

import { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { User } from "@supabase/supabase-js";
import useAuth from "../../stores/useAuth";
import ErrorBanner from "../support/ErrorBanner";
import { FlexColumn, GAP, LabeledSwitch, Text } from "../ui_primitives";
import {
  hasMarketingConsent,
  saveMarketingConsent
} from "../../lib/marketingConsent";

const MarketingEmailSettings = () => {
  const { t } = useTranslation();
  const user = useAuth((state) => state.session?.user ?? null) as User | null;
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const enabled = hasMarketingConsent(user);

  const handleChange = useCallback(async (checked: boolean) => {
    setSaving(true);
    setFailure(null);
    try {
      // Supabase fires USER_UPDATED, which refreshes the session in useAuth.
      await saveMarketingConsent(checked, "settings");
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }, []);

  if (!user) {
    return null;
  }

  return (
    <div className="settings-section">
      <Text size="big" id="marketing-emails">
        {t("marketingEmails.title")}
      </Text>
      <FlexColumn gap={GAP.comfortable}>
        <LabeledSwitch
          id="marketing-emails-switch"
          label={t("marketingEmails.label")}
          description={t("marketingEmails.description")}
          checked={enabled}
          onChange={handleChange}
          disabled={saving}
        />
        {failure !== null && (
          <ErrorBanner
            report={{
              source: "operation-failure",
              summary: "Saving the product email setting failed",
              errorText: failure
            }}
            onDismiss={() => setFailure(null)}
          >
            {t("marketingEmails.saveFailed")}
          </ErrorBanner>
        )}
      </FlexColumn>
    </div>
  );
};

export default memo(MarketingEmailSettings);
