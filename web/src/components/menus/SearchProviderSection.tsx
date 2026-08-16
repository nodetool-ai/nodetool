/** @jsxImportSource @emotion/react */
import type React from "react";
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
  InputLabel,
  type SelectChangeEvent
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

interface SearchProviderSectionProps {
  settingValues: Record<string, string>;
  onChange: (envVar: string, value: string) => void;
}

const SearchProviderSection = memo(function SearchProviderSection({
  settingValues,
  onChange
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
    (e: SelectChangeEvent<string>) => {
      onChange("SERP_PROVIDER", e.target.value);
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

        <Text className="description">{config?.description}</Text>
      </div>

      {config && (
        <div
          style={{
            marginTop: "1.5em",
            padding: "1em",
            backgroundColor: theme.vars.palette.c_overlay_subtle,
            borderLeft: `4px solid ${theme.palette.primary.main}`,
            borderRadius: BORDER_RADIUS.sm
          }}
        >
          <Stack spacing={1.5}>
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
