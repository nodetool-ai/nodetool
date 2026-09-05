/**
 * Server settings: which NodeTool server the panel talks to, and the token it
 * presents. A server reached over loopback needs no token — it maps the
 * request to the local user — so the field stays empty for a local install.
 */

import { useState } from "react";

import { CloseIcon } from "./Icons.js";

interface SettingsDrawerProps {
  apiBaseUrl: string;
  authToken: string;
  onSave: (next: { apiBaseUrl: string; authToken: string }) => void;
  onClose: () => void;
}

export function SettingsDrawer({
  apiBaseUrl,
  authToken,
  onSave,
  onClose,
}: SettingsDrawerProps) {
  const [url, setUrl] = useState(apiBaseUrl);
  const [token, setToken] = useState(authToken);

  return (
    <div className="drawer" role="dialog" aria-label="Server settings">
      <div className="drawer__header">
        <h2 className="drawer__title">Server</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close settings"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>

      <div className="drawer__body">
        <div className="field">
          <label className="field__label" htmlFor="api-base-url">
            NodeTool server URL
          </label>
          <input
            id="api-base-url"
            className="field__input"
            value={url}
            spellCheck={false}
            autoComplete="off"
            placeholder="http://localhost:7777"
            onChange={(e) => setUrl(e.target.value)}
          />
          <p className="field__hint">
            The panel calls <code>/trpc</code> and the <code>/ws</code> chat
            socket on this host.
          </p>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="auth-token">
            Access token
          </label>
          <input
            id="auth-token"
            className="field__input"
            type="password"
            value={token}
            spellCheck={false}
            autoComplete="off"
            placeholder="Leave empty for a local server"
            onChange={(e) => setToken(e.target.value)}
          />
          <p className="field__hint">
            Only needed when the server enforces authentication.
          </p>
        </div>

        <button
          type="button"
          className="text-button text-button--primary"
          onClick={() => onSave({ apiBaseUrl: url, authToken: token })}
        >
          Save and reconnect
        </button>
      </div>
    </div>
  );
}
