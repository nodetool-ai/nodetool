/** @jsxImportSource @emotion/react */
import { css, SerializedStyles } from "@emotion/react";
import SaveIcon from "@mui/icons-material/Save";
import WarningIcon from "@mui/icons-material/Warning";
import { useMemo, useState, useCallback } from "react";
import { Button, TextField, Typography } from "@mui/material";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import useRemoteSettingsStore from "../../stores/RemoteSettingStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import ThemeNodetool from "../themes/ThemeNodetool";

const remoteSettingsStyles = (theme: any): SerializedStyles => {
  return css`
    display: flex;
    flex-direction: column;
    height: 100%;
    padding-top: 1em;

    .save-button-container {
      position: absolute;
      top: 49px;
      right: 10px;
      z-index: 100;
      margin: 0;
      padding: 0.75em 0;
      display: flex;
      justify-content: center;
      width: 100%;
    }

    .save-button {
      position: absolute;
      bottom: 10px;
      right: 10px;
      padding: 0.6em 2.5em;
      font-family: ${theme.fontFamily2};
      word-spacing: -0.2em;
      color: ${theme.palette.c_hl1};
      border: 1px solid rgba(255, 255, 255, 0.2);
      box-shadow: 0 5px 20px rgba(0, 0, 0, 0.4);
      border-radius: 0.3em;
      text-transform: none;
      font-size: ${theme.fontSizeNormal};
      transition: all 0.2s ease;
      font-weight: 500;
      letter-spacing: 0.02em;
      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
      }
    }

    .show-hide-button {
      color: red;
      min-width: 18em;
      margin-top: 0.5em;
      padding: 0.5em;
    }

    h1 {
      font-size: ${theme.fontSizeGiant};
      margin: 1.5em 0 0.5em 0;
      padding: 0;
      font-weight: 600;
      letter-spacing: -0.01em;
      color: ${theme.palette.c_white};
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      padding-bottom: 0.2em;
    }

    h2 {
      font-size: ${theme.fontSizeBigger};
      margin: 1.5em 0 0.5em 0;
      padding: 0;
      font-weight: 500;
      color: ${theme.palette.c_hl1};
      position: relative;
      display: inline-block;
    }

    .secrets {
      display: flex;
      align-items: center;
      gap: 0.8em;
      background-color: rgba(255, 152, 0, 0.1);
      padding: 0.8em 1.2em;
      border-radius: 6px;
      margin: 1em 0 2em;
      border-left: 3px solid #ff9800;
    }

    .description {
      margin-top: 1em;
      opacity: 0.8;
      font-size: 0.9em;
      line-height: 1.5;
    }

    a {
      color: ${theme.palette.primary.main};
      text-decoration: none;
      transition: color 0.2s ease;

      &:hover {
        color: ${theme.palette.primary.light};
        text-decoration: underline;
      }
    }
  `;
};

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
    OPENAI_API_KEY: "",
    ANTHROPIC_API_KEY: "",
    HF_TOKEN: "",
    REPLICATE_API_TOKEN: "",
    AIME_USER: "",
    AIME_API_KEY: "",
    GOOGLE_APP_PASSWORD: "",
    GEMINI_API_KEY: "",
    FAL_API_KEY: "",
    ELEVENLABS_API_KEY: "",
    GOOGLE_MAIL_USER: "",
    BROWSER_URL: "",
    DATA_FOR_SEO_LOGIN: "",
    DATA_FOR_SEO_PASSWORD: "",
    SERPAPI_API_KEY: ""
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
        AIME_USER: data.secrets.AIME_USER || "",
        AIME_API_KEY: data.secrets.AIME_API_KEY || "",
        GOOGLE_APP_PASSWORD: data.secrets.GOOGLE_APP_PASSWORD || "",
        GEMINI_API_KEY: data.secrets.GEMINI_API_KEY || "",
        FAL_API_KEY: data.secrets.FAL_API_KEY || "",
        ELEVENLABS_API_KEY: data.secrets.ELEVENLABS_API_KEY || "",
        GOOGLE_MAIL_USER: data.secrets.GOOGLE_MAIL_USER || "",
        BROWSER_URL: data.secrets.BROWSER_URL || "",
        DATA_FOR_SEO_LOGIN: data.secrets.DATA_FOR_SEO_LOGIN || "",
        DATA_FOR_SEO_PASSWORD: data.secrets.DATA_FOR_SEO_PASSWORD || "",
        SERPAPI_API_KEY: data.secrets.SERPAPI_API_KEY || ""
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
      {isLoading && (
        <Typography sx={{ textAlign: "center", padding: "2em" }}>
          Loading API providers...
        </Typography>
      )}
      {isSuccess && (
        <div
          className="remote-settings-content"
          css={remoteSettingsStyles(ThemeNodetool)}
        >
          <div className="settings-main-content">
            <Typography variant="h1">API Provider Settings</Typography>

            <div className="secrets">
              <WarningIcon sx={{ color: "#ff9800" }} />
              <Typography>
                Keep your keys and tokens secure and do not share them publicly
              </Typography>
            </div>

            <div className="settings-section">
              <Typography variant="h2" id="openai">
                OpenAI
              </Typography>
              <div className="settings-item">
                <TextField
                  type="password"
                  autoComplete="off"
                  id="openai-api-key-input"
                  label="OpenAI API key"
                  value={settings.OPENAI_API_KEY}
                  onChange={(e) =>
                    handleChange("OPENAI_API_KEY", e.target.value)
                  }
                  variant="standard"
                  onKeyDown={(e) => e.stopPropagation()}
                />
                <div className="text-and-button">
                  <Typography className="description">
                    Setting up an OpenAI API key enables you to use models like
                    GPT, Whisper, DALL-E, and more.
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

              <Typography variant="h2" id="google">
                Google
              </Typography>
              <div className="settings-item">
                <TextField
                  type="password"
                  autoComplete="off"
                  id="gemini-api-key-input"
                  label="Google Gemini API Key"
                  value={settings.GEMINI_API_KEY}
                  onChange={(e) =>
                    handleChange("GEMINI_API_KEY", e.target.value)
                  }
                  variant="standard"
                />
                <div className="text-and-button">
                  <Typography className="description">
                    Enter your Google Gemini API key to access Google&apos;s
                    latest AI models.
                    <br />
                    <a
                      href="https://makersuite.google.com/app/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      &rarr; Google AI Studio API Keys
                    </a>
                  </Typography>
                </div>
              </div>
              <div className="settings-item">
                <TextField
                  autoComplete="off"
                  id="google-mail-user-input"
                  label="Google Mail User"
                  value={settings.GOOGLE_MAIL_USER}
                  onChange={(e) =>
                    handleChange("GOOGLE_MAIL_USER", e.target.value)
                  }
                  variant="standard"
                />
                <TextField
                  type="password"
                  autoComplete="off"
                  id="google-app-password-input"
                  label="Google App Password"
                  value={settings.GOOGLE_APP_PASSWORD}
                  onChange={(e) =>
                    handleChange("GOOGLE_APP_PASSWORD", e.target.value)
                  }
                  variant="standard"
                  sx={{ marginTop: "1em" }}
                />
                <div className="text-and-button">
                  <Typography className="description">
                    To use Gmail integration, you need to generate an App
                    Password. To get Gmail credentials:
                    <br />
                    1. Go to your Google Account settings
                    <br />
                    2. Navigate to Security &gt; 2-Step Verification
                    <br />
                    3. Scroll to the bottom and click on &quot;App
                    passwords&quot;
                    <br />
                    4. Select &quot;Mail&quot; and your device
                    <br />
                    5. Click &quot;Generate&quot; and use the 16-character
                    password
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

              <Typography variant="h2" id="anthropic">
                Anthropic
              </Typography>
              <div className="settings-item">
                <TextField
                  type="password"
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
                    By entering your Anthropic API token, you&apos;ll be able to
                    use sophisticated models like Claude 3.5 Sonnet. models like
                    Claude 3.5 Sonnet.
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

              <Typography variant="h2" id="replicate">
                Replicate
              </Typography>
              <div className="settings-item">
                <TextField
                  type="password"
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
                    Replicate provides access to a variety of AI models and
                    capabilities.
                    <br /> By configuring your Replicate API token, you&apos;ll
                    gain access to models like flux.dev and flux.pro.
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

              <Typography variant="h2" id="huggingface">
                HuggingFace
              </Typography>
              <div className="settings-item">
                <TextField
                  type="password"
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

              <Typography variant="h2" id="aime">
                AIME
              </Typography>
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
                  type="password"
                  autoComplete="off"
                  id="aime-api-key-input"
                  label="AIME API Key"
                  value={settings.AIME_API_KEY}
                  onChange={(e) => handleChange("AIME_API_KEY", e.target.value)}
                  variant="standard"
                  sx={{ marginTop: "1em" }}
                />
                <Typography className="description">
                  Enter your AIME account username and API key to access AIME
                  API.
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

              <Typography variant="h2" id="falai">
                Fal.ai
              </Typography>
              <div className="settings-item">
                <TextField
                  type="password"
                  autoComplete="off"
                  id="fal-api-key-input"
                  label="Fal.ai API Key"
                  value={settings.FAL_API_KEY}
                  onChange={(e) => handleChange("FAL_API_KEY", e.target.value)}
                  variant="standard"
                />
                <div className="text-and-button">
                  <Typography className="description">
                    Enter your Fal.ai API key to access their AI models and
                    services.
                    <br />
                    <a
                      href="https://fal.ai/dashboard/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      &rarr; Fal.ai API Keys
                    </a>
                  </Typography>
                </div>
              </div>

              <Typography variant="h2" id="elevenlabs">
                Eleven Labs
              </Typography>
              <div className="settings-item">
                <TextField
                  type="password"
                  autoComplete="off"
                  id="elevenlabs-api-key-input"
                  label="ElevenLabs API Key"
                  value={settings.ELEVENLABS_API_KEY}
                  onChange={(e) =>
                    handleChange("ELEVENLABS_API_KEY", e.target.value)
                  }
                  variant="standard"
                />
                <div className="text-and-button">
                  <Typography className="description">
                    Enter your ElevenLabs API key to access advanced
                    text-to-speech capabilities.
                    <br />
                    <a
                      href="https://elevenlabs.io/app/settings/api-keys"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      &rarr; ElevenLabs Dashboard
                    </a>
                  </Typography>
                </div>
              </div>
            </div>

            <Typography variant="h2" id="dataforseo">
              DataForSEO
            </Typography>
            <div className="settings-item">
              <TextField
                autoComplete="off"
                id="dataforseo-login-input"
                label="DataForSEO Login"
                value={settings.DATA_FOR_SEO_LOGIN}
                onChange={(e) =>
                  handleChange("DATA_FOR_SEO_LOGIN", e.target.value)
                }
                variant="standard"
              />
              <TextField
                type="password"
                autoComplete="off"
                id="dataforseo-password-input"
                label="DataForSEO Password"
                value={settings.DATA_FOR_SEO_PASSWORD}
                onChange={(e) =>
                  handleChange("DATA_FOR_SEO_PASSWORD", e.target.value)
                }
                variant="standard"
                sx={{ marginTop: "1em" }}
              />
              <div className="text-and-button">
                <Typography className="description">
                  Enter your DataForSEO credentials to access their API for SERP
                  data and other SEO tools.
                  <br />
                  <a
                    href="https://dataforseo.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    &rarr; DataForSEO Website
                  </a>
                </Typography>
              </div>
            </div>

            <Typography variant="h2" id="serpapi">
              SerpAPI
            </Typography>
            <div className="settings-item">
              <TextField
                type="password"
                autoComplete="off"
                id="serpapi-api-key-input"
                label="SerpAPI API Key"
                value={settings.SERPAPI_API_KEY}
                onChange={(e) =>
                  handleChange("SERPAPI_API_KEY", e.target.value)
                }
                variant="standard"
              />
              <div className="text-and-button">
                <Typography className="description">
                  Enter your SerpAPI API key to access their search engine
                  results scraping service.
                  <br />
                  <a
                    href="https://serpapi.com/manage-api-key"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    &rarr; SerpAPI Dashboard
                  </a>
                </Typography>
              </div>
            </div>

            <Typography variant="h2" id="brightdata">
              Crawling Browser
            </Typography>
            <div className="settings-item">
              <TextField
                autoComplete="off"
                id="browser-url-input"
                label="Browser URL"
                value={settings.BROWSER_URL}
                onChange={(e) => handleChange("BROWSER_URL", e.target.value)}
                variant="standard"
                sx={{ marginTop: "1em" }}
              />
              <div className="text-and-button">
                <Typography className="description">
                  <br />
                  <a
                    href="https://docs.browserless.io/overview/connection-urls"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    &rarr; Browserless Connection URLs
                  </a>
                  <br />
                  <a
                    href="https://brightdata.com/products/scraping-browser"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    &rarr; Brightdata Scraping Browser Documentation
                  </a>
                </Typography>
              </div>
            </div>

            <Typography variant="h1">Folder Settings</Typography>
            <div className="settings-section">
              <Typography variant="h2" id="comfyui">
                ComfyUI
              </Typography>

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
                  To use ComfyUI models from your existing ComfyUI installation,
                  set the path to your ComfyUI folder.
                </Typography>
              </div>

              <Typography variant="h2" id="chromadb">
                ChromaDB
              </Typography>

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
                  ChromaDB is used to store and retrieve embeddings for semantic
                  search.
                  <br />
                  Set the path where you want ChromaDB to store its data.
                  <br />
                  This can be any folder path - ChromaDB will create and manage
                  the storage automatically.
                  <br />
                </Typography>
              </div>
            </div>

            <div className="save-button-container">
              <Button
                variant="contained"
                color="primary"
                onClick={handleSave}
                className="save-button"
                startIcon={<SaveIcon />}
              >
                SAVE SETTINGS
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const remoteSidebarSections = [
  {
    category: "API Providers",
    items: [
      { id: "openai", label: "OpenAI" },
      { id: "google", label: "Google" },
      { id: "anthropic", label: "Anthropic" },
      { id: "replicate", label: "Replicate" },
      { id: "huggingface", label: "HuggingFace" },
      { id: "aime", label: "AIME" },
      { id: "falai", label: "Fal.ai" },
      { id: "elevenlabs", label: "Eleven Labs" },
      { id: "dataforseo", label: "DataForSEO" },
      { id: "serpapi", label: "SerpAPI" },
      { id: "brightdata", label: "Brightdata" }
    ]
  },
  {
    category: "Folder Settings",
    items: [
      { id: "comfyui", label: "ComfyUI" },
      { id: "chromadb", label: "ChromaDB" }
    ]
  }
];

export default RemoteSettings;
