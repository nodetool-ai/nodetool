// web/src/components/portal/PortalSetupFlow.tsx
/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { memo, useState, useCallback, useMemo } from "react";
import { TextInput, EditorButton, LoadingSpinner, MOTION, BORDER_RADIUS } from "../ui_primitives";
import useSecretsStore from "../../stores/SecretsStore";
import type { WelcomeTrackId } from "./welcomeTracks";

const styles = (theme: Theme) =>
  css({
    maxWidth: 400,
    ".portal-setup-text": {
      fontSize: "var(--fontSizeNormal)",
      color: theme.vars.palette.c_gray6,
      lineHeight: 1.6,
      marginBottom: `${theme.spacing(1)}`,
    },
    ".portal-setup-providers": {
      display: "flex",
      flexDirection: "column",
      gap: `${theme.spacing(0.75)}`,
    },
    ".portal-setup-provider": {
      display: "flex",
      alignItems: "center",
      gap: `${theme.spacing(1)}`,
      background: theme.vars.palette.c_gray1,
      border: `1px solid ${theme.vars.palette.c_gray2}`,
      borderRadius: BORDER_RADIUS.lg,
      padding: `${theme.spacing(1.5)} ${theme.spacing(1.75)}`,
      cursor: "pointer",
      transition: `border-color ${MOTION.fast}`,
      "&:hover": {
        borderColor: theme.vars.palette.c_gray3,
      },
    },
    ".portal-setup-provider-icon": {
      width: 28,
      height: 28,
      borderRadius: BORDER_RADIUS.sm,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "var(--fontSizeNormal)",
      color: "white",
      fontWeight: 600,
    },
    ".portal-setup-provider-info": {
      flex: 1,
    },
    ".portal-setup-provider-name": {
      fontSize: "var(--fontSizeSmall)",
      color: theme.vars.palette.c_white,
      display: "flex",
      alignItems: "center",
      gap: 6,
    },
    ".portal-setup-recommended": {
      fontSize: 10,
      fontWeight: 600,
      textTransform: "uppercase" as const,
      letterSpacing: "0.05em",
      padding: "2px 6px",
      borderRadius: 9999,
      background: `color-mix(in srgb, ${theme.palette.primary.main} 18%, transparent)`,
      color: theme.palette.primary.main,
    },
    ".portal-setup-provider-desc": {
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.c_gray4,
    },
    ".portal-setup-connect": {
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.primary.main,
    },
    ".portal-setup-key-input": {
      marginTop: `${theme.spacing(1)}`,
      display: "flex",
      gap: `${theme.spacing(1)}`,
      alignItems: "center",
    },
    ".portal-setup-key-help": {
      fontSize: 11,
      color: theme.vars.palette.c_gray4,
      marginTop: 6,
      "& a": {
        color: theme.palette.primary.main,
        textDecoration: "none",
        "&:hover": { textDecoration: "underline" },
      },
    },
    ".portal-setup-error": {
      fontSize: 11,
      color: theme.vars.palette.error.main,
      marginTop: 6,
    },
    ".portal-setup-back": {
      display: "block",
      margin: "16px auto 0",
      background: "none",
      border: "none",
      padding: "6px 10px",
      borderRadius: 6,
      fontSize: 12,
      color: theme.vars.palette.c_gray5,
      cursor: "pointer",
      "&:hover": {
        color: theme.vars.palette.c_white,
        background: theme.vars.palette.c_gray1,
      },
    },
    ".portal-setup-note": {
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.c_gray4,
      marginTop: `${theme.spacing(1)}`,
      textAlign: "center" as const,
    },
    ".portal-setup-ollama-status": {
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.c_gray5,
      marginTop: `${theme.spacing(0.75)}`,
      padding: `${theme.spacing(1)} ${theme.spacing(1.5)}`,
      background: theme.vars.palette.c_gray1,
      borderRadius: BORDER_RADIUS.lg,
    },
  });

type Provider = {
  id: string;
  name: string;
  description: string;
  secretKey: string;
  color: string;
  /** Chat model selected after setup; null when the provider has no
   *  sensible chat default (e.g. Hugging Face for image generation). */
  defaultModel: string | null;
  /** Where to create an API key for this provider. */
  keyUrl: string;
  /** Starter tracks whose default model runs on this provider. */
  recommendedFor?: WelcomeTrackId[];
  /** Only shown when recommended for the pending track. */
  trackOnly?: boolean;
};

const PROVIDERS: Provider[] = [
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT-4o, GPT-Image, Whisper",
    secretKey: "OPENAI_API_KEY",
    color: "#10a37f",
    defaultModel: "openai:gpt-4o",
    keyUrl: "https://platform.openai.com/api-keys",
    recommendedFor: ["audio", "agent"],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude Sonnet, Haiku",
    secretKey: "ANTHROPIC_API_KEY",
    color: "#d97706",
    defaultModel: "anthropic:claude-sonnet-4-6",
    keyUrl: "https://console.anthropic.com/settings/keys",
    recommendedFor: ["agent"],
  },
  {
    id: "gemini",
    name: "Google Gemini",
    description: "Gemini, Veo video",
    secretKey: "GEMINI_API_KEY",
    color: "#4285f4",
    defaultModel: "gemini:gemini-2.5-flash",
    keyUrl: "https://aistudio.google.com/apikey",
    recommendedFor: ["video"],
    trackOnly: true,
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    description: "FLUX, SDXL via Inference Providers",
    secretKey: "HF_TOKEN",
    color: "#ff9d00",
    defaultModel: null,
    keyUrl: "https://huggingface.co/settings/tokens",
    recommendedFor: ["image"],
    trackOnly: true,
  },
];

type PortalSetupFlowProps = {
  onComplete: (defaultModel: string | null) => void;
  /** Return to the dashboard without configuring a provider. */
  onBack?: () => void;
  /** Contextual intro line; defaults to the generic chat prompt. */
  message?: string;
  /** Pending starter track; surfaces providers that can run its model. */
  trackId?: WelcomeTrackId | null;
};

const PortalSetupFlow: React.FC<PortalSetupFlowProps> = ({
  onComplete,
  onBack,
  message = "I'd love to help with that! To get started, connect an AI provider:",
  trackId = null,
}) => {
  const theme = useTheme();
  const updateSecret = useSecretsStore((s) => s.updateSecret);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [keyValue, setKeyValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [ollamaStatus, setOllamaStatus] = useState<
    "unchecked" | "checking" | "running" | "not-running"
  >("unchecked");

  const isRecommended = useCallback(
    (provider: Provider) =>
      trackId !== null && (provider.recommendedFor?.includes(trackId) ?? false),
    [trackId]
  );

  const visibleProviders = useMemo(() => {
    const visible = PROVIDERS.filter((p) => !p.trackOnly || isRecommended(p));
    return [...visible].sort(
      (a, b) => Number(isRecommended(b)) - Number(isRecommended(a))
    );
  }, [isRecommended]);

  const handleProviderClick = useCallback(
    (provider: Provider) => {
      setExpandedProvider(provider.id);
      setKeyValue("");
      setSaveError(null);
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
      setSaveError(null);
      try {
        await updateSecret(provider.secretKey, keyValue.trim());
        onComplete(provider.defaultModel);
      } catch {
        setSaveError("Couldn't save the key. Check your connection and try again.");
      } finally {
        setSaving(false);
      }
    },
    [keyValue, updateSecret, onComplete]
  );

  return (
    <div css={styles(theme)}>
      <div className="portal-setup-text">{message}</div>

      <div className="portal-setup-providers">
        {visibleProviders.map((provider) => (
          <div key={provider.id}>
            <div
              className="portal-setup-provider"
              role="button"
              tabIndex={0}
              onClick={() => handleProviderClick(provider)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { handleProviderClick(provider); } }}
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
                  {isRecommended(provider) && (
                    <span className="portal-setup-recommended">
                      Recommended
                    </span>
                  )}
                </div>
                <div className="portal-setup-provider-desc">
                  {provider.description}
                </div>
              </div>
              <span className="portal-setup-connect">Connect →</span>
            </div>

            {expandedProvider === provider.id && (
              <>
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
                <div className="portal-setup-key-help">
                  No key yet?{" "}
                  <a
                    href={provider.keyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Get a {provider.name} API key ↗
                  </a>
                </div>
                {saveError && (
                  <div className="portal-setup-error">{saveError}</div>
                )}
              </>
            )}
          </div>
        ))}

        {/* Ollama (no API key) */}
        <div
          className="portal-setup-provider"
          role="button"
          tabIndex={0}
          onClick={handleOllamaClick}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { handleOllamaClick(); } }}
        >
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
            Checking if Ollama is running…
          </div>
        )}
        {ollamaStatus === "running" && (
          <div className="portal-setup-ollama-status" style={{ color: "#4caf50" }}>
            ✓ Ollama is running. Connecting…
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

      {onBack && (
        <button type="button" className="portal-setup-back" onClick={onBack}>
          ← Back to dashboard
        </button>
      )}
    </div>
  );
};

export default memo(PortalSetupFlow);
