/** @jsxImportSource @emotion/react */
import { useMemo, useCallback, memo } from "react";

import {
  FlexRow,
  Box,
  Chip,
  Stack,
  BORDER_RADIUS,
  Select,
  MenuItem,
  FormControl,
  InputLabel
} from "../ui_primitives";
import { formatSettingLabel } from "./settingsLabel";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import { TextInput, Text } from "../ui_primitives";
import ExternalLink from "../common/ExternalLink";
import type { SettingWithValue } from "../../stores/RemoteSettingStore";
import { useTheme } from "@mui/material/styles";
import {
  SEARCH_PROVIDER_CONFIGS as PROVIDER_CONFIGS,
  DEFAULT_SERP_PROVIDER,
  type SerpProviderId
} from "../../utils/searchProviders";

interface SearchProviderSectionProps {
  allSettings: SettingWithValue[];
  settingValues: Record<string, string>;
  onChange: (envVar: string, value: string) => void;
}

const SearchProviderSection = memo(function SearchProviderSection({
  allSettings,
  settingValues,
  onChange
}: SearchProviderSectionProps) {
  const theme = useTheme();
  const selectedProvider = (settingValues["SERP_PROVIDER"] ||
    DEFAULT_SERP_PROVIDER) as SerpProviderId;
  const config = PROVIDER_CONFIGS[selectedProvider];

  // Get credential fields for all providers
  const credentialSettings = useMemo(() => {
    const result: Record<string, SettingWithValue> = {};
    allSettings.forEach((setting) => {
      const allCredentialFields = Object.values(PROVIDER_CONFIGS).flatMap(
        (p) => p.credentialFields
      );
      if (allCredentialFields.includes(setting.env_var)) {
        result[setting.env_var] = setting;
      }
    });
    return result;
  }, [allSettings]);

  // Check if current provider has all required credentials
  const hasAllCredentials = useMemo(() => {
    if (!config) return false;
    return config.credentialFields.every(
      (field) => settingValues[field] && settingValues[field].trim().length > 0
    );
  }, [config, settingValues]);

  const handleProviderChange = useCallback(
    (e: unknown) => {
      const target = e as { target: { value: string } };
      onChange("SERP_PROVIDER", target.target.value);
    },
    [onChange]
  );

  const handleCredentialChange = useCallback(
    (field: string, value: string) => {
      onChange(field, value);
    },
    [onChange]
  );

  return (
    <div className="settings-section">
      <Text size="big" id="search-provider" className="settings-heading">
        Search Provider
      </Text>

      {/* Provider Selector */}
      <div className="settings-item large">
        <FormControl variant="standard" fullWidth sx={{ marginBottom: "1.5em" }}>
          <InputLabel id="provider-select-label">Provider</InputLabel>
          <Select
            labelId="provider-select-label"
            id="provider-select"
            value={selectedProvider}
            onChange={handleProviderChange}
          >
            {Object.entries(PROVIDER_CONFIGS).map(([key, cfg]) => (
              <MenuItem key={key} value={key}>
                {cfg.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Provider Status */}
        <FlexRow
          align="center"
          sx={{
            gap: "0.5em",
            marginBottom: "1em",
            padding: "0.75em",
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
            sx={{
              color: hasAllCredentials ?
                theme.palette.success.dark :
                theme.palette.warning.dark,
              margin: 0,
              fontSize: "0.9em"
            }}
          >
            {hasAllCredentials
              ? "✓ Credentials configured"
              : "✗ Missing credentials"}
          </Text>
        </FlexRow>

        {/* Provider Description */}
        <Text className="description">{config?.description}</Text>
      </div>

      {/* Credentials Section */}
      {config && (
        <div
          style={{
            marginTop: "1.5em",
            padding: "1em",
            backgroundColor: theme.palette.mode === "dark" ?
              "rgba(255,255,255,0.05)" :
              "rgba(0,0,0,0.02)",
            borderLeft: `4px solid ${theme.palette.primary.main}`,
            borderRadius: BORDER_RADIUS.sm
          }}
        >
          <Stack spacing={1.5}>
            {config.credentialFields.map((field) => {
              const setting = credentialSettings[field];
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
                    onChange={(e: unknown) => {
                      const target = e as { target: { value: string } };
                      handleCredentialChange(field, target.target.value);
                    }}
                    variant="standard"
                    size="small"
                    onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
                    sx={{
                      "& .MuiInput-root": {
                        color: isFilled ? theme.palette.success.main : undefined
                      }
                    }}
                  />
                  {isFilled && (
                    <Chip
                      icon={<CheckCircleIcon />}
                      label="Configured"
                      size="small"
                      sx={{
                        marginTop: "0.5em",
                        height: "24px",
                        backgroundColor: theme.palette.success.light,
                        color: theme.palette.success.dark
                      }}
                    />
                  )}
                </Box>
              );
            })}

            {/* Get Credentials Link */}
            <Box sx={{ marginTop: "1em" }}>
              <ExternalLink
                href={config.getApiKeyUrl}
                tooltipText={`Visit ${config.label} to get your credentials`}
              >
                {config.getApiKeyLabel}
              </ExternalLink>
            </Box>
          </Stack>
        </div>
      )}
    </div>
  );
});

SearchProviderSection.displayName = "SearchProviderSection";

export default SearchProviderSection;
