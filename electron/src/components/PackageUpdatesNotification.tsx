import React from "react";
import type { PackageUpdateInfo } from "../types";

interface PackageUpdatesNotificationProps {
  updates: PackageUpdateInfo[];
  onDismiss: () => void;
}

const containerStyle: React.CSSProperties = {
  position: "fixed",
  bottom: "20px",
  right: "20px",
  maxWidth: "320px",
  background: "rgba(17, 24, 39, 0.95)",
  color: "#ffffff",
  padding: "16px",
  borderRadius: "8px",
  boxShadow: "0 10px 30px rgba(0, 0, 0, 0.35)",
  zIndex: 1000,
  display: "flex",
  flexDirection: "column",
  gap: "12px",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
};

const titleStyle: React.CSSProperties = {
  fontSize: "15px",
  fontWeight: 600,
  margin: 0,
};

const closeButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#9ca3af",
  cursor: "pointer",
  fontSize: "18px",
  lineHeight: 1,
};

const listStyle: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  fontSize: "13px",
  lineHeight: 1.4,
};

const hintStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "12px",
  color: "#9ca3af",
};

const PackageUpdatesNotification: React.FC<PackageUpdatesNotificationProps> = ({
  updates,
  onDismiss,
}) => {
  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <p style={titleStyle}>New Nodetool packs available</p>
        <button
          type="button"
          aria-label="Dismiss package update notice"
          style={closeButtonStyle}
          onClick={onDismiss}
        >
          ×
        </button>
      </div>
      <ul style={listStyle}>
        {updates.map((pkg) => (
          <li key={pkg.repo_id}>
            <strong>{pkg.name}</strong>
            <span style={{ color: "#9ca3af" }}>
              {` ${pkg.installedVersion} → ${pkg.latestVersion}`}
            </span>
          </li>
        ))}
      </ul>
      <p style={hintStyle}>Update them in Settings → Package Manager.</p>
    </div>
  );
};

export default PackageUpdatesNotification;
