/** @jsxImportSource @emotion/react */
import type React from "react";
import { useMemo, useCallback, memo } from "react";

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
  const theme = useTheme();
  const selectedProvider = (settingValues["SERP_PROVIDER"] ||
    DEFAULT_SERP_PROVIDER) as SerpProviderId;
  const config = PROVIDER_CONFIGS[selectedProvider];

  const hasAllCredentials = useMemo(() => {
    if (!config) return false;
    return config.credentialFields.every(
      (field) => settingValues[field] && settingValues[field].trim().length > 0
    );
  }, [config, settingValues]);

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
        Search provider
      </Text>

      <div className="settings-item large">
        <SelectField
          id="provider-select"
          label="Provider"
          value={selectedProvider}
          onChange={handleProviderChange}
          options={providerOptions}
          description={config?.description}
        />

        <FlexRow
          align="center"
          sx={{
            gap: getSpacingPx(SPACING.md),
            padding: getSpacingPx(SPACING.lg),
            backgroundColor:
              hasAllCredentials ?
                theme.palette.success.light :
                theme.palette.warning.light,
            borderRadius: BORDER_RADIUS.sm
          }}
        >
          {hasAllCredentials ? (
            <CheckCircleIcon
              sx={{ color: theme.palette.success.dark, fontSize: "1.2em" }}
            />
          ) : (
            <ErrorIcon
              sx={{ color: theme.palette.warning.dark, fontSize: "1.2em" }}
            />
          )}
          <Text
            size="small"
            sx={{
              color: hasAllCredentials ?
                theme.palette.success.dark :
                theme.palette.warning.dark,
              margin: 0
            }}
          >
            {hasAllCredentials
              ? "✓ Credentials configured"
              : "✗ Missing credentials"}
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
                label={formatSettingLabel(field)}
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
                  label="Configured"
                  size="small"
                  sx={{
                    marginTop: getSpacingPx(SPACING.md),
                    height: "24px",
                    backgroundColor: theme.palette.success.light,
                    color: theme.palette.success.dark
                  }}
                />
              )}
            </Box>
          );
        })}

        <Box>
          <ExternalLink
            href={config.getApiKeyUrl}
            tooltipText={`Visit ${config.label} to get your credentials`}
          >
            {config.getApiKeyLabel}
          </ExternalLink>
        </Box>
        </FlexColumn>
      )}
    </div>
  );
});

SearchProviderSection.displayName = "SearchProviderSection";

export default SearchProviderSection;
