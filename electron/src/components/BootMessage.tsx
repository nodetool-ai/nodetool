import React from "react";
import { ServerStatus } from "../types";

interface UpdateProgressData {
  componentName: string;
  progress: number;
  action: string;
  eta?: string;
}

interface BootMessageProps {
  message: string;
  showUpdateSteps: boolean;
  progressData: UpdateProgressData;
  status?: ServerStatus;
  errorMessage?: string;
  onRetry?: () => void;
  onOpenLogs?: () => void;
  onReinstall?: () => void;
}

const KiePromotion: React.FC = () => {
  const handleOpenKie = async () => {
    try {
      await window.api?.system?.openExternal?.("https://kie.ai/");
    } catch (error) {
      // Silently fail if unable to open external link
      console.error("Failed to open Kie.ai link:", error);
    }
  };

  return (
    <div className="kie-promotion">
      <div className="kie-promotion-header">
        <span className="kie-promotion-icon" aria-hidden="true">🚀</span>
        <h3>While You Wait...</h3>
      </div>
      <div className="kie-promotion-content">
        <p className="kie-promotion-title">
          Need API access to state-of-the-art AI models?
        </p>
        <p className="kie-promotion-description">
          We recommend <strong>Kie.ai</strong> for their incredible pricing and broad support 
          for all the latest SOTA models. Get access to GPT-4, Claude, Gemini, and many more 
          through a single, affordable API.
        </p>
        <ul className="kie-features">
          <li>✨ Access to all major AI models</li>
          <li>💰 Unbeatable pricing</li>
          <li>⚡ Fast, reliable API</li>
        </ul>
        <button 
          className="kie-cta-button"
          onClick={handleOpenKie}
          type="button"
        >
          Get Your API Key at Kie.ai →
        </button>
        <p className="kie-disclaimer">
          We are not affiliated with Kie.ai — we just love their service!
        </p>
      </div>
    </div>
  );
};

const BootMessage: React.FC<BootMessageProps> = ({
  message,
  showUpdateSteps,
  progressData,
  status,
  errorMessage,
  onRetry,
  onOpenLogs,
  onReinstall,
}) => {
  const isError = status === "error" || Boolean(errorMessage);
  const resolvedMessage = errorMessage ?? message;
  const isInstalling = showUpdateSteps && !isError;

  return (
    <div id="boot-message">
      <div className={`boot-panel ${isInstalling ? 'boot-panel-installing' : ''}`}>
        <div className="brand">NodeTool</div>
        <div className="brand-ring" aria-hidden="true" />

        {!isInstalling && (
          <svg
            className="nodetool-icon"
            width="396"
            height="404"
            viewBox="0 0 396 404"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ animation: 'logo-pulse 4s ease-in-out infinite' }}
          >
            <path
              className="path-1"
              d="M128 176.5L195.5 139L70.5 70L2.5 108L1 112V403L126 323V180L128 176.5Z"
              fill="var(--c_border)"
            />
            <path
              className="path-2"
              d="M394.5 403L267.5 323V180L394.5 108V403Z"
              fill="var(--c_border)"
            />
            <path
              className="path-3"
              d="M394.5 108L195 1L70 69.5L268 179L394.5 108Z"
              fill="var(--c_border)"
            />
            <path
              className="path-4"
              d="M195.5 138.5L69.3451 70L3.5 107L127 176.5L195.5 138.5Z"
              fill="var(--c_border)"
            />
            <path
              className="path-5"
              d="M394.5 108V403L267.5 323V180L394.5 108ZM394.5 108L195 1L70 69.5L268 179L394.5 108ZM195.5 139L128 176.5L126 180V323L1 403V112L2.5 108L70.5 70L195.5 139ZM69.3451 70L195.5 138.5L127 176.5L3.5 107L69.3451 70Z"
              stroke="var(--c_text_primary)"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        )}

        <div className="boot-text">{resolvedMessage}</div>

        {isError && (
          <div className="boot-error">
            <div className="boot-error-title">Backend failed to start</div>
            <div className="boot-error-message">
              {resolvedMessage ||
                "An unexpected error occurred while starting the backend server."}
            </div>
            <div className="boot-actions">
              {onRetry && (
                <button className="boot-action primary" onClick={onRetry}>
                  Retry start
                </button>
              )}
              {onOpenLogs && (
                <button className="boot-action" onClick={onOpenLogs}>
                  Open logs
                </button>
              )}
              {onReinstall && (
                <button className="boot-action" onClick={onReinstall}>
                  Reinstall environment
                </button>
              )}
            </div>
          </div>
        )}

        {showUpdateSteps && (
          <div id="update-steps">
            <div className="progress-container">
              <div className="progress-label">
                <span className="action-label">
                  {progressData.action} {progressData.componentName}
                </span>
                <span>
                  <span className="progress-percentage">
                    {Math.round(progressData.progress)}%
                  </span>
                  <span className="progress-eta">
                    {progressData.eta ? ` (${progressData.eta})` : ''}
                  </span>
                </span>
              </div>
              <div className="progress-bar">
                <div
                  className="progress"
                  style={{ width: `${progressData.progress}%` }}
                ></div>
              </div>
            </div>
          </div>
        )}

        {isInstalling && <KiePromotion />}
      </div>
    </div>
  );
};

export default BootMessage;
