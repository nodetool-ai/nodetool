import React from 'react';

interface UpdateNotificationProps {
  version: string;
  releaseUrl: string;
  downloaded?: boolean;
  onClose: () => void;
}

const UpdateNotification: React.FC<UpdateNotificationProps> = ({
  version,
  releaseUrl,
  downloaded = false,
  onClose,
}) => {
  const handleReleaseClick = (e: React.MouseEvent) => {
    e.preventDefault();
    window.api.system.openExternal(releaseUrl);
  };

  const handleRestartClick = () => {
    window.api.updates.restartAndInstall();
  };

  return (
    <div
      id="update-notification"
      style={{
        position: 'fixed' as const,
        top: '10px',
        right: '10px',
        background: 'rgba(0, 0, 0, 0.8)',
        padding: '15px',
        borderRadius: '5px',
        zIndex: 1000,
        maxWidth: '300px',
      }}
    >
      <p style={{ margin: 0, color: 'white', marginBottom: '10px' }}>
        {downloaded
          ? `Version ${version} has been downloaded and will be installed on restart.`
          : `Version ${version} is available. Downloading in the background...`}
      </p>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        {!downloaded && (
          <a
            id="release-link"
            href={releaseUrl}
            onClick={handleReleaseClick}
            style={{
              color: '#4a9eff',
              textDecoration: 'none',
              display: 'inline-block',
            }}
          >
            View Release Notes
          </a>
        )}
        {downloaded && (
          <button
            onClick={handleRestartClick}
            style={{
              background: '#4a9eff',
              color: 'white',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#3a8eef')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#4a9eff')}
          >
            Restart to Update
          </button>
        )}
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            color: '#888',
            border: 'none',
            padding: '4px 8px',
            cursor: 'pointer',
            fontSize: '18px',
            lineHeight: 1,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#aaa')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#888')}
        >
          ×
        </button>
      </div>
    </div>
  );
};

export default UpdateNotification;