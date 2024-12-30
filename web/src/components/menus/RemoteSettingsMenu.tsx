/** @jsxImportSource @emotion/react */
import { css, SerializedStyles } from "@emotion/react";
import SaveIcon from "@mui/icons-material/Save";
import WarningIcon from "@mui/icons-material/Warning";
import { useMemo, useState, useCallback } from "react";
import { Button, TextField, Typography } from "@mui/material";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import useRemoteSettingsStore from "../../stores/RemoteSettingStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import { settingsStyles } from "./SettingsMenu";
import ThemeNodetool from "../themes/ThemeNodetool";

const remoteSettingsStyles = (theme: any): SerializedStyles => {
  const baseStyles = settingsStyles(theme);

  return css`
    ${baseStyles}
    
    .save-button-container {
      position: sticky;
      top: 0;
      z-index: 100;
      background-color: ${theme.palette.c_gray0};
      margin: 0;
      padding: 0.5em 0;
      display: flex;
      justify-content: center;
      width: 100%;
    }

    .save-button {
      padding: 0.5em 2em;
      font-family: ${theme.fontFamily2};
      word-spacing: -0.2em;
      color: ${theme.palette.c_gray0};
      border-radius: 0.2em;
      text-transform: none;
      font-size: ${theme.fontSizeNormal};
      transition: transform 0.2s ease;
    }

    .show-hide-button {
      color: "red",
      minWidth: "18em",
      marginTop: ".5em",
      padding: ".5em"
    }
  `;
};

const RemoteSettings = ({
  enableCollapse = true
}: {
  enableCollapse?: boolean;
}) => {
  const queryClient = useQueryClient();
  const { updateSettings, fetchSettings } = useRemoteSettingsStore();
  const { addNotification } = useNotificationStore();
  const [showRemoteSettings, setShowRemoteSettings] = useState(true);
  const { data, isSuccess, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: fetchSettings
  });

  const [settings, setSettings] = useState({
    COMFY_FOLDER: "",
    CHROMA_PATH: "",
    OPENAI_API_KEY: "",
    ANTHROPIC_API_KEY: "",
    HF_TOKEN: "",
    REPLICATE_API_TOKEN: "",
    KLING_ACCESS_KEY: "",
    KLING_SECRET_KEY: "",
    LUMAAI_API_KEY: "",
    AIME_USER: "",
    AIME_API_KEY: "",
    GOOGLE_APP_PASSWORD: ""
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
        CHROMA_PATH: data.settings.CHROMA_PATH || "",
        OPENAI_API_KEY: data.secrets.OPENAI_API_KEY || "",
        ANTHROPIC_API_KEY: data.secrets.ANTHROPIC_API_KEY || "",
        HF_TOKEN: data.secrets.HF_TOKEN || "",
        REPLICATE_API_TOKEN: data.secrets.REPLICATE_API_TOKEN || "",
        KLING_ACCESS_KEY: data.secrets.KLING_ACCESS_KEY || "",
        KLING_SECRET_KEY: data.secrets.KLING_SECRET_KEY || "",
        LUMAAI_API_KEY: data.secrets.LUMAAI_API_KEY || "",
        AIME_USER: data.secrets.AIME_USER || "",
        AIME_API_KEY: data.secrets.AIME_API_KEY || "",
        GOOGLE_APP_PASSWORD: data.secrets.GOOGLE_APP_PASSWORD || ""
      });
    }
  }, [isSuccess, data]);

  const handleChange = useCallback((key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(() => {
    const { COMFY_FOLDER, CHROMA_PATH, ...secrets } = settings;
    updateSettingsMutation.mutate(
      {
        settings: {
          COMFY_FOLDER,
          CHROMA_PATH
        },
        secrets
      },
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
      {enableCollapse && (
        <Button
          onClick={() => setShowRemoteSettings(!showRemoteSettings)}
          endIcon={showRemoteSettings ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          className="show-hide-button"
          sx={{ width: "100%" }}
        >
          {showRemoteSettings ? "Hide Remote Settings" : "Show Remote Settings"}
        </Button>
      )}

      {isLoading && (
        <Typography sx={{ textAlign: "center", padding: "2em" }}>
          Loading API providers...
        </Typography>
      )}
      {isSuccess && (enableCollapse ? showRemoteSettings : true) && (
        <div
          className="remote-settings"
          css={remoteSettingsStyles(ThemeNodetool)}
        >
          <div className="save-button-container">
            <Button
              variant="contained"
              color="primary"
              onClick={handleSave}
              className="save-button"
              startIcon={<SaveIcon />}
            >
              SAVE API + FOLDER SETTINGS
            </Button>
          </div>

          <Typography variant="h3">API Provider Settings</Typography>

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
              onKeyDown={(e) => e.stopPropagation()}
            />
            <div className="text-and-button">
              <Typography className="description">
                Replicate provides access to a diverse range of AI models and
                capabilities.
                <br /> By configuring your Replicate API token, you&apos;ll gain
                access to advanced models like flux.dev and flux.pro.
                <br />
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
              autoComplete="off"
              id="openai-api-key-input"
              label="OpenAI API key"
              value={settings.OPENAI_API_KEY}
              onChange={(e) => handleChange("OPENAI_API_KEY", e.target.value)}
              variant="standard"
              onKeyDown={(e) => e.stopPropagation()}
            />
            <div className="text-and-button">
              <Typography className="description">
                Setting up an OpenAI API key enables you to use models like GPT,
                Whisper, DALL-E, and more.
                <br />
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
              autoComplete="off"
              id="anthropic-api-key-input"
              label="Anthropic API key"
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
                <br />
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
              autoComplete="off"
              id="hf-token-input"
              label="HuggingFace token"
              value={settings.HF_TOKEN}
              onChange={(e) => handleChange("HF_TOKEN", e.target.value)}
              variant="standard"
            />
            <div className="text-and-button">
              <Typography className="description">
                Enter your HuggingFace Access Token to use additional models
                that are not openly available.
                <br />
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

          <div className="settings-item">
            <TextField
              autoComplete="off"
              id="kling-access-key-input"
              label="Kling AI Access Key"
              value={settings.KLING_ACCESS_KEY}
              onChange={(e) => handleChange("KLING_ACCESS_KEY", e.target.value)}
              variant="standard"
            />
            <TextField
              autoComplete="off"
              id="kling-secret-key-input"
              label="Kling AI Secret Key"
              value={settings.KLING_SECRET_KEY}
              onChange={(e) => handleChange("KLING_SECRET_KEY", e.target.value)}
              variant="standard"
              sx={{ marginTop: "1em" }}
            />
            <Typography className="description">
              Enter your Kling AI credentials to access state-of-the-art video
              generation models. <br />
              <a
                href="https://klingai.com/dev-center"
                target="_blank"
                rel="noopener noreferrer"
              >
                &rarr; Kling AI Dev Center
              </a>{" "}
            </Typography>
          </div>

          <div className="settings-item">
            <TextField
              autoComplete="off"
              id="lumaai-api-key-input"
              label="Luma AI API Key"
              value={settings.LUMAAI_API_KEY}
              onChange={(e) => handleChange("LUMAAI_API_KEY", e.target.value)}
              variant="standard"
            />
            <Typography className="description">
              Enter your Luma AI API key to access state-of-the-art video
              generation models.
              <br />
              <a
                href="https://lumalabs.ai/dream-machine/api"
                target="_blank"
                rel="noopener noreferrer"
              >
                &rarr; Luma AI Settings
              </a>
            </Typography>
          </div>

          <div className="settings-item">
            <TextField
              autoComplete="off"
              id="aime-user-input"
              label="AIME Username"
              value={settings.AIME_USER}
              onChange={(e) => handleChange("AIME_USER", e.target.value)}
              variant="standard"
            />
            <TextField
              autoComplete="off"
              id="aime-api-key-input"
              label="AIME API Key"
              value={settings.AIME_API_KEY}
              onChange={(e) => handleChange("AIME_API_KEY", e.target.value)}
              variant="standard"
              sx={{ marginTop: "1em" }}
            />
            <Typography className="description">
              Enter your AIME account username and API key to access AIME API.
              <br />
              <a
                href="https://api.aime.info/"
                target="_blank"
                rel="noopener noreferrer"
              >
                &rarr; AIME API
              </a>
            </Typography>
          </div>

          <div className="settings-item">
            <TextField
              autoComplete="off"
              id="google-app-password-input"
              label="Google App Password"
              value={settings.GOOGLE_APP_PASSWORD}
              onChange={(e) =>
                handleChange("GOOGLE_APP_PASSWORD", e.target.value)
              }
              variant="standard"
            />
            <div className="text-and-button">
              <Typography className="description">
                To use Gmail integration, you need to generate an App Password.
                To get Gmail credentials:
                <br />
                1. Go to your Google Account settings
                <br />
                2. Navigate to Security &gt; 2-Step Verification
                <br />
                3. Scroll to the bottom and click on "App passwords"
                <br />
                4. Select "Mail" and your device
                <br />
                5. Click "Generate" and use the 16-character password
                <br />
                <a
                  href="https://myaccount.google.com/security"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  &rarr; Google Account Security Settings
                </a>
              </Typography>
            </div>
          </div>

          <div className="secrets">
            <WarningIcon sx={{ color: "#ff9800" }} />
            <Typography>
              Keep your keys and tokens secure and do not share them publicly
            </Typography>
          </div>
          <Typography variant="h3">ComfyUI</Typography>

          <div className="settings-item folder-path">
            <TextField
              autoComplete="off"
              id="comfy-folder-input"
              label="Comfy Folder"
              value={settings.COMFY_FOLDER}
              onChange={(e) => handleChange("COMFY_FOLDER", e.target.value)}
              variant="standard"
              placeholder="PATH/TO/ComfyUI"
            />
            <Typography className="description">
              To use ComfyUI models from your existing ComfyUI installation, set
              the path to your ComfyUI folder.
            </Typography>
          </div>

          <Typography variant="h3">ChromaDB</Typography>

          <div className="settings-item">
            <TextField
              autoComplete="off"
              id="chroma-path-input"
              label="ChromaDB Path"
              value={settings.CHROMA_PATH}
              onChange={(e) => handleChange("CHROMA_PATH", e.target.value)}
              variant="standard"
            />
            <Typography className="description">
              Set the path to your ChromaDB storage folder. ChromaDB is used to
              store and retrieve embeddings for semantic search.
            </Typography>
          </div>
        </div>
      )}
    </>
  );
};

export default RemoteSettings;
