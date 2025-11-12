import React from "react";
import { Alert, AlertTitle, Box, Button, Chip } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useSettingsStore } from "../../../stores/SettingsStore";
import {
  useProviderApiKeyValidation,
  ProviderApiKeyStatus
} from "../../../hooks/useProviderApiKeyValidation";

interface ProviderApiKeyWarningBannerProps {
  providers: string[];
}

const ProviderApiKeyWarningBanner: React.FC<ProviderApiKeyWarningBannerProps> = ({
  providers
}) => {
  const theme = useTheme();
  const setMenuOpen = useSettingsStore((state) => state.setMenuOpen);
  const missingKeys = useProviderApiKeyValidation(providers);

  if (missingKeys.length === 0) {
    return null;
  }

  // Group providers by secret key to show which providers need each key
  const groupedBySecret = missingKeys.reduce(
    (
      acc: Record<
        string,
        { secretKey: string; secretDisplayName: string; providers: string[] }
      >,
      item: ProviderApiKeyStatus
    ) => {
      if (!acc[item.secretKey]) {
        acc[item.secretKey] = {
          secretKey: item.secretKey,
          secretDisplayName: item.secretDisplayName,
          providers: []
        };
      }
      acc[item.secretKey].providers.push(item.providerDisplayName);
      return acc;
    },
    {} as Record<
      string,
      { secretKey: string; secretDisplayName: string; providers: string[] }
    >
  );

  const groups = Object.values(groupedBySecret) as Array<{
    secretKey: string;
    secretDisplayName: string;
    providers: string[];
  }>;

  return (
    <Alert
      severity="warning"
      sx={{
        mb: 2,
        "& .MuiAlert-message": {
          width: "100%"
        }
      }}
      action={
        <Button
          size="small"
          variant="contained"
          color="warning"
          onClick={() => setMenuOpen(true, 1)}
          sx={{
            fontSize: theme.vars.fontSizeSmaller,
            fontWeight: 500
          }}
        >
          Open Settings
        </Button>
      }
    >
      <AlertTitle sx={{ fontSize: theme.vars.fontSizeNormal, mb: 1 }}>
        API Keys Required
      </AlertTitle>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <Box sx={{ fontSize: theme.vars.fontSizeSmaller }}>
          The following providers require API keys to use their models:
        </Box>
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 0.75
          }}
        >
          {groups.map((group) => (
            <Box
              key={group.secretKey}
              sx={{
                display: "flex",
                flexWrap: "wrap",
                gap: 0.5,
                alignItems: "center"
              }}
            >
              <Box
                sx={{
                  fontSize: theme.vars.fontSizeTiny,
                  fontWeight: 500,
                  color: theme.vars.palette.warning.dark,
                  mr: 0.5
                }}
              >
                {group.secretDisplayName}:
              </Box>
              {group.providers.map((providerName) => (
                <Chip
                  key={`${group.secretKey}-${providerName}`}
                  label={providerName}
                  size="small"
                  sx={{
                    fontSize: theme.vars.fontSizeTiny,
                    height: "22px",
                    backgroundColor: theme.vars.palette.warning.light,
                    color: theme.vars.palette.warning.contrastText
                  }}
                />
              ))}
            </Box>
          ))}
        </Box>
      </Box>
    </Alert>
  );
};

export default ProviderApiKeyWarningBanner;

