/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { useEffect, useState } from "react";
import { Button, TextField, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import useRemoteSettingsStore from "../../stores/RemoteSettingStore";

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
      display: "block",
      color: theme.palette.c_hl1,
      textDecoration: "none"
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
      {isLoading && <Typography>Loading External Services...</Typography>}
      {isSuccess ? (
        <div className="remote-settings" css={styles}>
          <Typography variant="h3">External Services</Typography>

          <div className="settings-item">
            <TextField
              type="password"
              id="replicate-api-token-input"
              label="Replicate API Token"
              value={
                replicateApiToken.slice(0, 5) +
                "*".repeat(Math.max(0, replicateApiToken.length - 5))
              }
              onChange={(e) => setReplicateApiToken(e.target.value)}
              onBlur={() =>
                updateRemoteSettings(
                  {},
                  { REPLICATE_API_TOKEN: replicateApiToken }
                )
              }
              variant="standard"
            />
            <div className="text-and-button">
              <Typography className="description">
                Get your Replicate API token
              </Typography>
              <Button size="small">
                <a
                  href="https://replicate.com/account/api-tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Replicate Settings
                </a>
              </Button>
            </div>
          </div>

          <div className="settings-item">
            <TextField
              id="openai-api-key-input"
              label="OpenAI API Key"
              value={
                openaiApiKey.slice(0, 5) +
                "*".repeat(Math.max(0, openaiApiKey.length - 5))
              }
              onChange={(e) => setOpenaiApiKey(e.target.value)}
              onBlur={() =>
                updateRemoteSettings({}, { OPENAI_API_KEY: openaiApiKey })
              }
              variant="standard"
            />
            <div className="text-and-button">
              <Typography className="description">
                Get your OpenAI API key
              </Typography>
              <Button size="small">
                <a
                  href="https://platform.openai.com/account/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  OpenAI Settings
                </a>
              </Button>
            </div>
          </div>

          <div className="settings-item">
            <TextField
              id="anthropic-api-key-input"
              label="Anthropic API Key"
              value={
                anthropicApiKey.slice(0, 5) +
                "*".repeat(Math.max(0, anthropicApiKey.length - 5))
              }
              onChange={(e) => setAnthropicApiKey(e.target.value)}
              onBlur={() =>
                updateRemoteSettings({}, { ANTHROPIC_API_KEY: anthropicApiKey })
              }
              variant="standard"
            />

            <div className="text-and-button">
              <Typography className="description">
                Get your Anthropic API key
              </Typography>
              <Button size="small">
                <a
                  href="https://console.anthropic.com/account/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Anthropic Settings
                </a>
              </Button>
            </div>
          </div>

          <div className="settings-item">
            <TextField
              id="hf-token-input"
              label="HuggingFace Token"
              value={
                hfToken.slice(0, 5) +
                "*".repeat(Math.max(0, hfToken.length - 5))
              }
              onChange={(e) => setHfToken(e.target.value)}
              onBlur={() => updateRemoteSettings({}, { HF_TOKEN: hfToken })}
              variant="standard"
            />
            <div className="text-and-button">
              <Typography className="description">
                Get your HuggingFace Access Token
              </Typography>
              <Button size="small">
                <a
                  href="https://huggingface.co/settings/tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  HuggingFace Settings
                </a>
              </Button>
            </div>
          </div>

          <div className="settings-item folder-path">
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

          <Typography className="secrets">
            Keep your keys and tokens secure and do not share them publicly
          </Typography>
        </div>
      ) : null}
    </>
  );
};

export default RemoteSettings;
