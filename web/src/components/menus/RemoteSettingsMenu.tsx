/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import SaveIcon from "@mui/icons-material/Save";
import { useMemo, useState, useCallback } from "react";
import { Button, TextField, Typography } from "@mui/material";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import useRemoteSettingsStore from "../../stores/RemoteSettingStore";
import { useNotificationStore } from "../../stores/NotificationStore";

const styles = (theme: any) =>
  css({
    display: "flex",
    flexDirection: "column",
    width: "100%",
    gap: ".5em",

    ".description": {
      display: "block",
      marginBottom: "1em"
    },
    ".description a": {
      color: theme.palette.c_hl1,
      marginLeft: ".5em"
    },
    ".description a:hover": {
      color: theme.palette.c_gray6
    },
    "& input": {
      fontSize: theme.fontSizeSmaller
    },
    ".secrets": {
      color: theme.palette.c_warning,
      fontSize: theme.fontSizeSmaller,
      padding: "0 0 0 .5em",
      marginBottom: "1em"
    },
    button: {
      backgroundColor: theme.palette.c_gray2,
      padding: ".5em 1em"
    },
    "button a": {
      color: theme.palette.c_gray6,
      textDecoration: "none"
    },
    ".text-and-button p": {
      margin: "0 0 0.5em 0",
      padding: "0"
    }
    // "& .MuiInputBase-root:not(.Mui-focused) input": {
    //   filter: "blur(2px)",
    //   transition: "filter 0.3s ease-in-out"
    // },
    // "& .MuiInputBase-root.Mui-focused input": {
    //   filter: "none"
    // }
  });

const RemoteSettings = () => {
  const queryClient = useQueryClient();
  const { updateSettings, fetchSettings } = useRemoteSettingsStore();
  const { addNotification } = useNotificationStore();

  const { data, isSuccess, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: fetchSettings
  });

  const [settings, setSettings] = useState({
    COMFY_FOLDER: "",
    OPENAI_API_KEY: "",
    ANTHROPIC_API_KEY: "",
    HF_TOKEN: "",
    REPLICATE_API_TOKEN: ""
  });

  const updateSettingsMutation = useMutation({
    mutationFn: ({ settings, secrets }: { settings: any; secrets: any }) =>
      updateSettings(settings, secrets),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    }
  });

  useMemo(() => {
    if (isSuccess) {
      setSettings({
        COMFY_FOLDER: data.settings.COMFY_FOLDER || "",
        OPENAI_API_KEY: data.secrets.OPENAI_API_KEY || "",
        ANTHROPIC_API_KEY: data.secrets.ANTHROPIC_API_KEY || "",
        HF_TOKEN: data.secrets.HF_TOKEN || "",
        REPLICATE_API_TOKEN: data.secrets.REPLICATE_API_TOKEN || ""
      });
    }
  }, [isSuccess, data]);

  const handleChange = useCallback((key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(() => {
    const { COMFY_FOLDER, ...secrets } = settings;
    updateSettingsMutation.mutate(
      { settings: { COMFY_FOLDER }, secrets },
      {
        onSuccess: () => {
          addNotification({
            content: "Your settings have been saved successfully",
            type: "success",
            alert: true
          });
        }
      }
    );
  }, [addNotification, settings, updateSettingsMutation]);

  return (
    <>
      {isLoading && <Typography>Loading API providers...</Typography>}
      {isSuccess ? (
        <div className="remote-settings" css={styles}>
          <Typography variant="h3">API Providers</Typography>

          <div className="settings-item">
            <TextField
              autoComplete="off"
              id="replicate-api-token-input"
              label="Replicate API token"
              value={settings.REPLICATE_API_TOKEN}
              onChange={(e) =>
                handleChange("REPLICATE_API_TOKEN", e.target.value)
              }
              variant="standard"
            />
            <div className="text-and-button">
              <Typography className="description">
                Replicate provides access to a diverse range of AI models and
                capabilities. By configuring your Replicate API token,
                you&apos;ll gain access to advanced models like flux.dev and
                flux.pro.
                <a
                  href="https://replicate.com/account/api-tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  &rarr; Replicate Settings
                </a>
              </Typography>
            </div>
          </div>

          <div className="settings-item">
            <TextField
              id="openai-api-key-input"
              label="OpenAI API key"
              autoComplete="off"
              value={settings.OPENAI_API_KEY}
              onChange={(e) => handleChange("OPENAI_API_KEY", e.target.value)}
              variant="standard"
            />
            <div className="text-and-button">
              <Typography className="description">
                Setting up an OpenAI API key enables you to use models like GPT,
                Whisper, DALL-E, and more.
                <a
                  href="https://platform.openai.com/account/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  &rarr; OpenAI Settings
                </a>
              </Typography>
            </div>
          </div>

          <div className="settings-item">
            <TextField
              id="anthropic-api-key-input"
              label="Enter your Anthropic API key"
              value={settings.ANTHROPIC_API_KEY}
              onChange={(e) =>
                handleChange("ANTHROPIC_API_KEY", e.target.value)
              }
              variant="standard"
            />

            <div className="text-and-button">
              <Typography className="description">
                By entering your Anthropic API token, you&apos;ll be able to use
                sophisticated models like Claude 3.5 Sonnet.
                <a
                  href="https://console.anthropic.com/account/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  &rarr; Anthropic Settings
                </a>
              </Typography>
            </div>
          </div>

          <div className="settings-item">
            <TextField
              id="hf-token-input"
              label="Enter your HuggingFace token"
              value={settings.HF_TOKEN}
              onChange={(e) => handleChange("HF_TOKEN", e.target.value)}
              variant="standard"
            />
            <div className="text-and-button">
              <Typography className="description">
                Enter your HuggingFace Access Token to use additional models
                that are not openly available.
                <a
                  href="https://huggingface.co/settings/tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  &rarr; HuggingFace Settings
                </a>
              </Typography>
            </div>
          </div>

          <div className="settings-item folder-path">
            <TextField
              id="comfy-folder-input"
              label="Comfy Folder"
              value={settings.COMFY_FOLDER}
              onChange={(e) => handleChange("COMFY_FOLDER", e.target.value)}
              variant="standard"
            />
            <Typography className="description">
              To use ComfyUI nodes, set the path to your ComfyUI installation
              folder: PATH/ComfyUI
            </Typography>
          </div>

          <Button
            variant="contained"
            color="primary"
            onClick={handleSave}
            sx={{ mt: 2, minHeight: "3em", borderRadius: "1em" }}
          >
            <SaveIcon sx={{ mr: 1 }} />
            Save API Keys
          </Button>

          <Typography className="secrets">
            Keep your keys and tokens secure and do not share them publicly
          </Typography>
        </div>
      ) : null}
    </>
  );
};

export default RemoteSettings;
