/** @jsxImportSource @emotion/react */
import { useMemo, useCallback, memo } from "react";
import {
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Box,
  Stack,
  Chip
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import { TextInput, Text } from "../ui_primitives";
import ExternalLink from "../common/ExternalLink";
import type { SettingWithValue } from "../../stores/RemoteSettingStore";
import { useTheme } from "@mui/material/styles";

// Provider configurations
interface ProviderConfig {
  id: string;
  label: string;
  description: string;
  credentialFields: string[];
  getApiKeyUrl: string;
  getApiKeyLabel: string;
}

const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  serpapi: {
    id: "serpapi",
    label: "SerpAPI",
    description:
      "Fast and reliable search API with Google, Bing, and other engines",
    credentialFields: ["SERPAPI_API_KEY"],
    getApiKeyUrl: "https://serpapi.com/manage-api-key",
    getApiKeyLabel: "Get SerpAPI Key"
  },
  dataforseo: {
    id: "dataforseo",
    label: "DataForSEO",
    description: "Professional SEO and search intelligence platform",
    credentialFields: ["DATA_FOR_SEO_LOGIN", "DATA_FOR_SEO_PASSWORD"],
    getApiKeyUrl: "https://app.dataforseo.com/register",
    getApiKeyLabel: "Get DataForSEO Credentials"
  },
  brave: {
    id: "brave",
    label: "Brave Search",
    description: "Privacy-focused search engine with fast, accurate results",
    credentialFields: ["BRAVE_API_KEY"],
    getApiKeyUrl: "https://api-dashboard.search.brave.com/",
    getApiKeyLabel: "Get Brave API Key"
  },
  apify: {
    id: "apify",
    label: "Apify",
    description: "Reliable Google search scraping via Apify actors",
    credentialFields: ["APIFY_API_KEY"],
    getApiKeyUrl: "https://console.apify.com/account/integrations",
    getApiKeyLabel: "Get Apify API Key"
  }
};

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
  const selectedProvider = settingValues["SERP_PROVIDER"] || "serpapi";
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
      <Text size="bigger" id="search-provider">
        Search Provider
      </Text>

      {/* Provider Selector */}
      <div className="settings-item large">
        <FormControl variant="standard" fullWidth sx={{ marginBottom: "1.5em" }}>
          <InputLabel id="provider-select-label">
            Search Provider
          </InputLabel>
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
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: "0.5em",
            marginBottom: "1em",
            padding: "0.75em",
            backgroundColor:
              hasAllCredentials ?
                theme.palette.success.light :
                theme.palette.warning.light,
            borderRadius: "4px"
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
        </Box>

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
            borderRadius: "4px"
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
                    label={field.replace(/_/g, " ")}
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
