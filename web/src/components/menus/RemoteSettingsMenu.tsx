/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { useEffect, useState } from "react";
import { TextField, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import useRemoteSettingsStore from "../../stores/RemoteSettingStore";

const styles = (theme: any) =>
  css({
    "&.remote-settings": {
      display: "flex",
      flexDirection: "column",
      width: "100%",
      gap: ".5em"
    },

    ".description a": {
      display: "block",
      color: theme.palette.c_hl1,
      textDecoration: "none"
    },
    ".description a:hover": {
      color: theme.palette.c_gray6
    },
    ".secrets": {
      color: theme.palette.c_warning,
      fontSize: theme.fontSizeSmall,
      padding: "0 0 0 .5em",
      marginBottom: "1em"
    }
  });

const RemoteSettings = () => {
  const { updateSettings: updateRemoteSettings, fetchSettings } =
    useRemoteSettingsStore((state) => ({
      updateSettings: state.updateSettings,
      fetchSettings: state.fetchSettings
    }));

  const { data, isSuccess, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: fetchSettings
  });

  const [comfyFolder, setComfyFolder] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [anthropicApiKey, setAnthropicApiKey] = useState("");
  const [hfToken, setHfToken] = useState("");
  const [replicateApiToken, setReplicateApiToken] = useState("");

  useEffect(() => {
    if (isSuccess) {
      setComfyFolder(data.settings.COMFY_FOLDER || "");
      setOpenaiApiKey(data.secrets.OPENAI_API_KEY || "");
      setHfToken(data.secrets.HF_TOKEN || "");
      setReplicateApiToken(data.secrets.REPLICATE_API_TOKEN || "");
    }
  }, [isSuccess, data]);

  return (
    <>
      {isLoading && <Typography>Loading...</Typography>}
      {isSuccess ? (
        <div className="remote-settings" css={styles}>
          <Typography variant="h3">External Services</Typography>
          <div className="settings-item">
            <TextField
              id="comfy-folder-input"
              label="Comfy Folder"
              value={comfyFolder}
              onChange={(e) => setComfyFolder(e.target.value)}
              onBlur={() =>
                updateRemoteSettings({ COMFY_FOLDER: comfyFolder }, {})
              }
              variant="standard"
            />
            <Typography className="description">
              Path to your ComfyUI installation folder.
            </Typography>
          </div>

          <div className="settings-item">
            <TextField
              id="openai-api-key-input"
              label="OpenAI API Key"
              value={openaiApiKey}
              onChange={(e) => setOpenaiApiKey(e.target.value)}
              onBlur={() =>
                updateRemoteSettings({}, { OPENAI_API_KEY: openaiApiKey })
              }
              variant="standard"
            />
            <Typography className="description">
              Your OpenAI API key.
              <a
                href="https://platform.openai.com/account/api-keys"
                target="_blank"
                rel="noopener noreferrer"
              >
                LINK
              </a>
            </Typography>
          </div>

          <div className="settings-item">
            <TextField
              id="anthropic-api-key-input"
              label="Anthropic API Key"
              value={anthropicApiKey}
              onChange={(e) => setAnthropicApiKey(e.target.value)}
              onBlur={() =>
                updateRemoteSettings({}, { ANTHROPIC_API_KEY: anthropicApiKey })
              }
              variant="standard"
            />
            <Typography className="description">
              Your Anthropic API key.
              <a
                href="https://console.anthropic.com/account/keys"
                target="_blank"
                rel="noopener noreferrer"
              >
                LINK
              </a>
            </Typography>
          </div>

          <div className="settings-item">
            <TextField
              id="hf-token-input"
              label="Hugging Face Token"
              value={hfToken}
              onChange={(e) => setHfToken(e.target.value)}
              onBlur={() => updateRemoteSettings({}, { HF_TOKEN: hfToken })}
              variant="standard"
            />
            <Typography className="description">
              Your Hugging Face token.
              <a
                href="https://huggingface.co/settings/tokens"
                target="_blank"
                rel="noopener noreferrer"
              >
                LINK
              </a>
            </Typography>
          </div>

          <div className="settings-item">
            <TextField
              id="replicate-api-token-input"
              label="Replicate API Token"
              value={replicateApiToken}
              onChange={(e) => setReplicateApiToken(e.target.value)}
              onBlur={() =>
                updateRemoteSettings(
                  {},
                  { REPLICATE_API_TOKEN: replicateApiToken }
                )
              }
              variant="standard"
            />
            <Typography className="description">
              Your Replicate API token.
              <a
                href="https://replicate.com/account/api-tokens"
                target="_blank"
                rel="noopener noreferrer"
              >
                LINK
              </a>
            </Typography>
          </div>
          <Typography className="secrets">
            Keep your keys and tokens secure and do not share them publicly
          </Typography>
        </div>
      ) : null}
    </>
  );
};

export default RemoteSettings;
