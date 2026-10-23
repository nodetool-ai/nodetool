import { memo, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";

import {
  Caption,
  EditorButton,
  FlexColumn,
  SearchInput,
  BORDER_RADIUS,
  SPACING
} from "../ui_primitives";
import ProviderOnboardingCard from "./ProviderOnboardingCard";
import {
  matchesProviderQuery,
  type OnboardingProvider
} from "./providerOnboardingCatalog";

interface ProviderDirectoryProps {
  providers: OnboardingProvider[];
  /** Secret keys that already hold a credential. */
  configuredKeys: ReadonlySet<string>;
  /** Closes the dialog and opens Settings on its providers section. */
  onOpenSettings: () => void;
  /** Shown above the list, e.g. that not every entry offers a capability. */
  note?: string;
}

/**
 * The providers a dialog does not feature, behind one "More providers"
 * button with a search, so any of them can be connected in place. Collapsed
 * by default: a newcomer sees a short list first.
 */
const ProviderDirectory: React.FC<ProviderDirectoryProps> = ({
  providers,
  configuredKeys,
  onOpenSettings,
  note
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const matches = useMemo(
    () => providers.filter((provider) => matchesProviderQuery(provider, query)),
    [providers, query]
  );

  if (providers.length === 0) {
    return null;
  }

  if (!open) {
    return (
      <EditorButton
        variant="outlined"
        fullWidth
        endIcon={<ExpandMoreRoundedIcon />}
        onClick={() => setOpen(true)}
      >
        {t("batch2_7.providerOnboarding.moreProviders", { count: providers.length })}
      </EditorButton>
    );
  }

  return (
    <FlexColumn gap={SPACING.md}>
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder={t("batch2_7.providerOnboarding.searchProviders")}
        ariaLabel={t("batch2_7.providerOnboarding.searchProviders")}
        autoFocus
        fullWidth
      />
      {note && <Caption size="small">{note}</Caption>}
      {matches.length > 0 ? (
        <FlexColumn
          sx={{
            border: `1px solid ${theme.vars.palette.divider}`,
            borderRadius: BORDER_RADIUS.lg,
            overflow: "hidden"
          }}
        >
          {matches.map((provider) => (
            <ProviderOnboardingCard
              key={provider.secretKey}
              provider={provider}
              configured={configuredKeys.has(provider.secretKey)}
              onOpenSettings={onOpenSettings}
            />
          ))}
        </FlexColumn>
      ) : (
        <FlexColumn gap={SPACING.xs} align="flex-start" role="status">
          <Caption>
            {t("batch2_7.providerOnboarding.noProviderMatch", {
              query: query.trim(),
              count: providers.length
            })}
          </Caption>
          <EditorButton density="compact" variant="text" size="small" onClick={onOpenSettings}>
            {t("batch2_7.providerOnboarding.allProviders")}
          </EditorButton>
        </FlexColumn>
      )}
    </FlexColumn>
  );
};

export default memo(ProviderDirectory);
