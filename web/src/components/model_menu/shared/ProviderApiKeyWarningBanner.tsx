import React from "react";
import { Button } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { AlertBanner, Chip, FlexColumn, FlexRow, Text } from "../../ui_primitives";
import { useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
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
    <AlertBanner
      severity="warning"
      title="API Keys Required"
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
          onClick={() => navigate("/settings?tab=1")}
          sx={{
            fontSize: theme.vars.fontSizeSmaller,
            fontWeight: 500
          }}
        >
          Open Settings
        </Button>
      }
    >
      <FlexColumn gap={1}>
        <Text sx={{ fontSize: theme.vars.fontSizeSmaller }}>
          The following providers require API keys to use their models:
        </Text>
        <FlexColumn gap={0.75}>
          {groups.map((group) => (
            <FlexRow
              key={group.secretKey}
              wrap
              gap={0.5}
              align="center"
            >
              <Text
                sx={{
                  fontSize: theme.vars.fontSizeTiny,
                  fontWeight: 500,
                  color: theme.vars.palette.warning.dark,
                  mr: 0.5
                }}
              >
                {group.secretDisplayName}:
              </Text>
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
            </FlexRow>
          ))}
        </FlexColumn>
      </FlexColumn>
    </AlertBanner>
  );
};

export default ProviderApiKeyWarningBanner;

