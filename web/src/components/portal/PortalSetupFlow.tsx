// web/src/components/portal/PortalSetupFlow.tsx
/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { memo, useState, useCallback } from "react";
import { TextInput, EditorButton, LoadingSpinner } from "../ui_primitives";
import useSecretsStore from "../../stores/SecretsStore";

const styles = (theme: Theme) =>
  css({
    maxWidth: 400,
    ".portal-setup-text": {
      fontSize: 14,
      color: theme.vars.palette.c_gray6,
      lineHeight: 1.6,
      marginBottom: 14,
    },
    ".portal-setup-providers": {
      display: "flex",
      flexDirection: "column",
      gap: 6,
    },
    ".portal-setup-provider": {
      display: "flex",
      alignItems: "center",
      gap: 10,
      background: theme.vars.palette.c_gray1,
      border: `1px solid ${theme.vars.palette.c_gray2}`,
      borderRadius: 10,
      padding: "12px 14px",
      cursor: "pointer",
      transition: "border-color 0.15s",
      "&:hover": {
        borderColor: theme.vars.palette.c_gray3,
      },
    },
    ".portal-setup-provider-icon": {
      width: 28,
      height: 28,
      borderRadius: 6,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 14,
      color: "white",
      fontWeight: "bold",
    },
    ".portal-setup-provider-info": {
      flex: 1,
    },
    ".portal-setup-provider-name": {
      fontSize: 13,
      color: theme.vars.palette.c_white,
    },
    ".portal-setup-provider-desc": {
      fontSize: 11,
      color: theme.vars.palette.c_gray4,
    },
    ".portal-setup-connect": {
      fontSize: 12,
      color: theme.palette.primary.main,
    },
    ".portal-setup-key-input": {
      marginTop: 8,
      display: "flex",
      gap: 8,
      alignItems: "center",
    },
    ".portal-setup-note": {
      fontSize: 11,
      color: theme.vars.palette.c_gray4,
      marginTop: 10,
      textAlign: "center" as const,
    },
    ".portal-setup-ollama-status": {
      fontSize: 12,
      color: theme.vars.palette.c_gray5,
      marginTop: 6,
      padding: "8px 12px",
      background: theme.vars.palette.c_gray1,
      borderRadius: 8,
    },
  });

type Provider = {
  id: string;
  name: string;
  description: string;
  secretKey: string;
  color: string;
  defaultModel: string;
};

const PROVIDERS: Provider[] = [
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT-4o, DALL-E, Whisper",
    secretKey: "OPENAI_API_KEY",
    color: "#10a37f",
    defaultModel: "openai:gpt-4o",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude Sonnet, Haiku",
    secretKey: "ANTHROPIC_API_KEY",
    color: "#d97706",
    defaultModel: "anthropic:claude-sonnet-4-20250514",
  },
];

type PortalSetupFlowProps = {
  onComplete: (defaultModel: string) => void;
};

const PortalSetupFlow: React.FC<PortalSetupFlowProps> = ({ onComplete }) => {
  const theme = useTheme();
  const updateSecret = useSecretsStore((s) => s.updateSecret);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [keyValue, setKeyValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<
    "unchecked" | "checking" | "running" | "not-running"
  >("unchecked");

  const handleProviderClick = useCallback(
    (provider: Provider) => {
      setExpandedProvider(provider.id);
      setKeyValue("");
    },
    []
  );

  const handleOllamaClick = useCallback(async () => {
    setOllamaStatus("checking");
    try {
      const res = await fetch("http://localhost:11434/api/tags");
      if (res.ok) {
        setOllamaStatus("running");
        onComplete("ollama:llama3.2");
      } else {
        setOllamaStatus("not-running");
      }
    } catch {
      setOllamaStatus("not-running");
    }
  }, [onComplete]);

  const handleSaveKey = useCallback(
    async (provider: Provider) => {
      if (!keyValue.trim()) {return;}
      setSaving(true);
      try {
        await updateSecret(provider.secretKey, keyValue.trim());
        onComplete(provider.defaultModel);
      } catch {
        // Error handled by SecretsStore
      } finally {
        setSaving(false);
      }
    },
    [keyValue, updateSecret, onComplete]
  );

  return (
    <div css={styles(theme)}>
      <div className="portal-setup-text">
        {"I'd love to help with that! To get started, connect an AI provider:"}
      </div>

      <div className="portal-setup-providers">
        {PROVIDERS.map((provider) => (
          <div key={provider.id}>
            <div
              className="portal-setup-provider"
              onClick={() => handleProviderClick(provider)}
            >
              <div
                className="portal-setup-provider-icon"
                style={{ backgroundColor: provider.color }}
              >
                {provider.name[0]}
              </div>
              <div className="portal-setup-provider-info">
                <div className="portal-setup-provider-name">
                  {provider.name}
                </div>
                <div className="portal-setup-provider-desc">
                  {provider.description}
                </div>
              </div>
              <span className="portal-setup-connect">Connect →</span>
            </div>

            {expandedProvider === provider.id && (
              <div className="portal-setup-key-input">
                <TextInput
                  size="small"
                  type="password"
                  placeholder={`${provider.name} API Key`}
                  value={keyValue}
                  onChange={(e) => setKeyValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {handleSaveKey(provider);}
                  }}
                  fullWidth
                  autoFocus
                />
                <EditorButton
                  variant="contained"
                  density="compact"
                  onClick={() => handleSaveKey(provider)}
                  disabled={saving || !keyValue.trim()}
                >
                  {saving ? <LoadingSpinner size="small" inline /> : "Save"}
                </EditorButton>
              </div>
            )}
          </div>
        ))}

        {/* Ollama (no API key) */}
        <div className="portal-setup-provider" onClick={handleOllamaClick}>
          <div
            className="portal-setup-provider-icon"
            style={{ backgroundColor: "#666" }}
          >
            ⬇
          </div>
          <div className="portal-setup-provider-info">
            <div className="portal-setup-provider-name">Run locally</div>
            <div className="portal-setup-provider-desc">
              Ollama, no API key needed
            </div>
          </div>
          <span className="portal-setup-connect">Set up →</span>
        </div>
        {ollamaStatus === "checking" && (
          <div className="portal-setup-ollama-status">
            Checking if Ollama is running...
          </div>
        )}
        {ollamaStatus === "running" && (
          <div className="portal-setup-ollama-status" style={{ color: "#4caf50" }}>
            ✓ Ollama is running. Connecting...
          </div>
        )}
        {ollamaStatus === "not-running" && (
          <div className="portal-setup-ollama-status">
            Ollama is not running. Install it from{" "}
            <a
              href="https://ollama.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#6688cc" }}
            >
              ollama.com
            </a>{" "}
            and start it, then try again.
          </div>
        )}
      </div>

      <div className="portal-setup-note">
        You can add more providers later in settings
      </div>
    </div>
  );
};

export default memo(PortalSetupFlow);
