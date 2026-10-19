/** @jsxImportSource @emotion/react */
import type React from "react";
import { useMemo, useCallback, memo } from "react";
import { useTranslation } from "react-i18next";

import {
  FlexRow,
  FlexColumn,
  Box,
  Chip,
  BORDER_RADIUS,
  SelectField,
  getSpacingPx,
  SPACING
} from "../ui_primitives";
import { formatSettingLabel } from "./settingsLabel";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import { TextInput, Text } from "../ui_primitives";
import ExternalLink from "../common/ExternalLink";
import { useTheme } from "@mui/material/styles";
import {
  SEARCH_PROVIDER_CONFIGS as PROVIDER_CONFIGS,
  DEFAULT_SERP_PROVIDER,
  type SerpProviderId
} from "../../utils/searchProviders";
import { matchesSearch } from "./settingsSearch";

interface SearchProviderSectionProps {
  settingValues: Record<string, string>;
  onChange: (envVar: string, value: string) => void;
  search?: string;
}

const SearchProviderSection = memo(function SearchProviderSection({
  settingValues,
  onChange,
  search = ""
}: SearchProviderSectionProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const selectedProvider = (settingValues["SERP_PROVIDER"] ||
    DEFAULT_SERP_PROVIDER) as SerpProviderId;
  const config = PROVIDER_CONFIGS[selectedProvider];
  const credentialFieldLabel = (field: string): string => {
    switch (field) {
      case "BRAVE_API_KEY":
        return t("screens4_6.searchProvider.credentialFields.braveApiKey");
      case "SERPAPI_API_KEY":
        return t("screens4_6.searchProvider.credentialFields.serpApiKey");
      case "DATA_FOR_SEO_LOGIN":
        return t("screens4_6.searchProvider.credentialFields.dataForSeoLogin");
      case "DATA_FOR_SEO_PASSWORD":
        return t("screens4_6.searchProvider.credentialFields.dataForSeoPassword");
      case "APIFY_API_TOKEN":
        return t("screens4_6.searchProvider.credentialFields.apifyApiToken");
      case "OPENAI_API_KEY":
        return t("screens4_6.searchProvider.credentialFields.openAiApiKey");
      case "GEMINI_API_KEY":
        return t("screens4_6.searchProvider.credentialFields.geminiApiKey");
      default:
        return formatSettingLabel(field);
    }
  };
  const providerDescription = (() => {
    switch (selectedProvider) {
      case "brave":
        return t("screens4_6.searchProvider.providers.brave.description");
      case "serpapi":
        return t("screens4_6.searchProvider.providers.serpapi.description");
      case "dataforseo":
        return t("screens4_6.searchProvider.providers.dataforseo.description");
      case "apify":
        return t("screens4_6.searchProvider.providers.apify.description");
      case "openai":
        return t("screens4_6.searchProvider.providers.openai.description");
      case "gemini":
        return t("screens4_6.searchProvider.providers.gemini.description");
    }
  })();
  const providerKeyLinkLabel = (() => {
    switch (selectedProvider) {
      case "brave":
        return t("screens4_6.searchProvider.providers.brave.keyLink");
      case "serpapi":
        return t("screens4_6.searchProvider.providers.serpapi.keyLink");
      case "dataforseo":
        return t("screens4_6.searchProvider.providers.dataforseo.keyLink");
      case "apify":
        return t("screens4_6.searchProvider.providers.apify.keyLink");
      case "openai":
        return t("screens4_6.searchProvider.providers.openai.keyLink");
      case "gemini":
        return t("screens4_6.searchProvider.providers.gemini.keyLink");
    }
  })();

  const hasAllCredentials = useMemo(() => {
    if (!config) return false;
    return config.credentialFields.every(
      (field) => settingValues[field] && settingValues[field].trim().length > 0
    );
  }, [config, settingValues]);
  const credentialTone = hasAllCredentials ? "success" : "warning";

  const handleProviderChange = useCallback(
    (value: string) => {
      onChange("SERP_PROVIDER", value);
    },
    [onChange]
  );

  const providerOptions = useMemo(
    () =>
      Object.entries(PROVIDER_CONFIGS).map(([key, cfg]) => ({
        value: key,
        label: cfg.label
      })),
    []
  );

  const handleCredentialChange = useCallback(
    (field: string, value: string) => {
      onChange(field, value);
    },
    [onChange]
  );

  if (
    !matchesSearch(
      "search provider serp brave serpapi dataforseo apify",
      search
    )
  ) {
    return null;
  }

  return (
    <div className="settings-section">
      <Text size="big" id="search-provider" className="settings-heading">
        {t("screens4_6.searchProvider.title")}
      </Text>

      <div className="settings-item large">
        <SelectField
          id="provider-select"
          label={t("screens4_6.searchProvider.providerLabel")}
          value={selectedProvider}
          onChange={handleProviderChange}
          options={providerOptions}
          description={providerDescription}
        />

        <FlexRow
          align="center"
          sx={{
            gap: getSpacingPx(SPACING.md),
            padding: getSpacingPx(SPACING.lg),
            // Tinted fill + main-colour text from theme.vars so the banner
            // follows the active light/dark scheme.
            backgroundColor: `rgb(${theme.vars.palette[credentialTone].mainChannel} / 0.12)`,
            borderRadius: BORDER_RADIUS.sm
          }}
        >
          {hasAllCredentials ? (
            <CheckCircleIcon
              sx={{ color: theme.vars.palette.success.main, fontSize: "1.2em" }}
            />
          ) : (
            <ErrorIcon
              sx={{ color: theme.vars.palette.warning.main, fontSize: "1.2em" }}
            />
          )}
          <Text
            size="small"
            sx={{
              color: theme.vars.palette[credentialTone].main,
              margin: 0
            }}
          >
            {hasAllCredentials
              ? t("screens4_6.searchProvider.credentialsConfigured")
              : t("screens4_6.searchProvider.credentialsMissing")}
          </Text>
        </FlexRow>
      </div>

      {config && (
        <FlexColumn gap={SPACING.lg} className="settings-item large">
        {config.credentialFields.map((field) => {
          const value = settingValues[field] || "";
          const isFilled = value.trim().length > 0;

          return (
            <Box key={field}>
              <TextInput
                type="password"
                autoComplete="off"
                id={`${field.toLowerCase()}-input`}
                label={t("screens4_6.searchProvider.credentialLabel", {
                  field: credentialFieldLabel(field)
                })}
                value={value}
                onChange={(
                  e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
                ) => {
                  handleCredentialChange(field, e.target.value);
                }}
                size="small"
                onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
              />
              {isFilled && (
                <Chip
                  icon={<CheckCircleIcon />}
                  label={t("screens4_6.searchProvider.configured")}
                  size="small"
                  color="success"
                  sx={{
                    marginTop: getSpacingPx(SPACING.md),
                    height: "24px"
                  }}
                />
              )}
            </Box>
          );
        })}

        <Box>
          <ExternalLink
            href={config.getApiKeyUrl}
            tooltipText={t("screens4_6.searchProvider.getCredentialsTooltip", {
              provider: config.label
            })}
          >
            {providerKeyLinkLabel}
          </ExternalLink>
        </Box>
        </FlexColumn>
      )}
    </div>
  );
});

SearchProviderSection.displayName = "SearchProviderSection";

export default SearchProviderSection;
