/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import SaveIcon from "@mui/icons-material/Save";
import WarningIcon from "@mui/icons-material/Warning";
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
    margin: "0 auto",
    gap: "2em",

    h3: {
      padding: "0.5em 0.5em 0 0.5em"
    },

    ".settings-item": {
      background: theme.palette.c_gray2,
      padding: "1.5em",
      borderRadius: "12px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
      transition: "transform 0.2s ease, box-shadow 0.2s ease",
      "&:hover": {
        transform: "translateY(-2px)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
      }
    },

    ".description": {
      color: theme.palette.c_gray5,
      fontSize: "0.9em",
      marginTop: "1em",
      marginLeft: "1em",
      lineHeight: "1.5"
    },

    ".description a": {
      color: theme.palette.c_gray6,
      textDecoration: "none",
      fontWeight: 500,
      transition: "color 0.2s ease",
      "&:hover": {
        color: theme.palette.primary.dark
      }
    },

    "& .MuiTextField-root": {
      width: "100%",
      "& .MuiInputBase-root": {
        backgroundColor: theme.palette.c_gray1,
        borderRadius: "8px",
        padding: "4px 12px"
      }
    },

    ".secrets": {
      color: theme.palette.c_gray6,
      padding: "1em",
      borderRadius: "8px",
      marginTop: "2em",
      display: "flex",
      alignItems: "center",
      gap: "0.5em"
    },

    ".save-button": {
      marginTop: "2em",
      padding: "1em 2em",
      borderRadius: "12px",
      fontWeight: 600,
      textTransform: "none",
      fontSize: "1.1em",
      transition: "transform 0.2s ease",
      "&:hover": {
        transform: "translateY(-2px)"
      }
    }
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
    CHROMA_PATH: "",
    ASSET_FOLDER: "",
    OPENAI_API_KEY: "",
    ANTHROPIC_API_KEY: "",
    HF_TOKEN: "",
    REPLICATE_API_TOKEN: "",
    KLING_ACCESS_KEY: "",
    KLING_SECRET_KEY: "",
    LUMAAI_API_KEY: ""
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
        ASSET_FOLDER: data.settings.ASSET_FOLDER || "",
        OPENAI_API_KEY: data.secrets.OPENAI_API_KEY || "",
        ANTHROPIC_API_KEY: data.secrets.ANTHROPIC_API_KEY || "",
        HF_TOKEN: data.secrets.HF_TOKEN || "",
        REPLICATE_API_TOKEN: data.secrets.REPLICATE_API_TOKEN || "",
        KLING_ACCESS_KEY: data.secrets.KLING_ACCESS_KEY || "",
        KLING_SECRET_KEY: data.secrets.KLING_SECRET_KEY || "",
        LUMAAI_API_KEY: data.secrets.LUMAAI_API_KEY || ""
      });
    }
  }, [isSuccess, data]);

  const handleChange = useCallback((key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(() => {
    const { COMFY_FOLDER, CHROMA_PATH, ASSET_FOLDER, ...secrets } = settings;
    updateSettingsMutation.mutate(
      {
        settings: {
          COMFY_FOLDER,
          CHROMA_PATH,
          ASSET_FOLDER
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
      {isLoading && (
        <Typography sx={{ textAlign: "center", padding: "2em" }}>
          Loading API providers...
        </Typography>
      )}
      {isSuccess ? (
        <div className="remote-settings" css={styles}>
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
              sx={{
                "& .MuiInputBase-root": {
                  fontSize: "1rem"
                }
              }}
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
              sx={{
                "& .MuiInputBase-root": {
                  fontSize: "1rem"
                }
              }}
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
              slotProps={{
                inputLabel: {
                  shrink: true
                }
              }}
              sx={{
                "& .MuiInputBase-root": {
                  fontSize: "1rem"
                }
              }}
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
              slotProps={{
                inputLabel: {
                  shrink: true
                }
              }}
              sx={{
                "& .MuiInputBase-root": {
                  fontSize: "1rem"
                }
              }}
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

          <div className="settings-item">
            <TextField
              id="kling-access-key-input"
              label="Kling AI Access Key"
              value={settings.KLING_ACCESS_KEY}
              onChange={(e) => handleChange("KLING_ACCESS_KEY", e.target.value)}
              variant="standard"
              slotProps={{
                inputLabel: {
                  shrink: true
                }
              }}
              sx={{
                "& .MuiInputBase-root": {
                  fontSize: "1rem"
                }
              }}
            />
            <TextField
              id="kling-secret-key-input"
              label="Kling AI Secret Key"
              value={settings.KLING_SECRET_KEY}
              onChange={(e) => handleChange("KLING_SECRET_KEY", e.target.value)}
              variant="standard"
              slotProps={{
                inputLabel: {
                  shrink: true
                }
              }}
              sx={{
                marginTop: "1em",
                "& .MuiInputBase-root": {
                  fontSize: "1rem"
                }
              }}
            />
            <Typography className="description">
              Enter your Kling AI credentials to access state-of-the-art video
              generation models. See https://klingai.com/dev-center for more
              information.
            </Typography>
          </div>

          <div className="settings-item">
            <TextField
              id="lumaai-api-key-input"
              label="Luma AI API Key"
              value={settings.LUMAAI_API_KEY}
              onChange={(e) => handleChange("LUMAAI_API_KEY", e.target.value)}
              variant="standard"
              slotProps={{
                inputLabel: {
                  shrink: true
                }
              }}
              sx={{
                "& .MuiInputBase-root": {
                  fontSize: "1rem"
                }
              }}
            />
            <Typography className="description">
              Enter your Luma AI API key to access state-of-the-art video
              generation models. See https://lumalabs.ai/dream-machine/api for
              more information.
            </Typography>
          </div>

          <div className="settings-item folder-path">
            <TextField
              id="comfy-folder-input"
              label="Comfy Folder"
              value={settings.COMFY_FOLDER}
              onChange={(e) => handleChange("COMFY_FOLDER", e.target.value)}
              variant="standard"
              slotProps={{
                inputLabel: {
                  shrink: true
                }
              }}
              sx={{
                "& .MuiInputBase-root": {
                  fontSize: "1rem"
                }
              }}
            />
            <Typography className="description">
              To use ComfyUI models from your existing ComfyUI installation, set
              the path to your ComfyUI folder.
            </Typography>
          </div>

          <div className="settings-item">
            <TextField
              id="chroma-path-input"
              label="ChromaDB Path"
              value={settings.CHROMA_PATH}
              onChange={(e) => handleChange("CHROMA_PATH", e.target.value)}
              variant="standard"
              slotProps={{
                inputLabel: {
                  shrink: true
                }
              }}
              sx={{
                "& .MuiInputBase-root": {
                  fontSize: "1rem"
                }
              }}
            />
            <Typography className="description">
              Set the path to your ChromaDB storage folder. ChromaDB is used to
              store and retrieve embeddings for semantic search.
            </Typography>
          </div>

          <div className="settings-item">
            <TextField
              id="asset-folder-input"
              label="Asset Folder"
              value={settings.ASSET_FOLDER}
              onChange={(e) => handleChange("ASSET_FOLDER", e.target.value)}
              variant="standard"
              slotProps={{
                inputLabel: {
                  shrink: true
                }
              }}
              sx={{
                "& .MuiInputBase-root": {
                  fontSize: "1rem"
                }
              }}
            />
            <Typography className="description">
              Set the path to your asset storage folder. This folder is used to
              store images and other assets for your workflows.
            </Typography>
          </div>

          <Button
            variant="outlined"
            color="primary"
            onClick={handleSave}
            className="save-button"
            startIcon={<SaveIcon />}
          >
            Save Settings
          </Button>

          <div className="secrets">
            <WarningIcon sx={{ color: "#ff9800" }} />
            <Typography>
              Keep your keys and tokens secure and do not share them publicly
            </Typography>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default RemoteSettings;
