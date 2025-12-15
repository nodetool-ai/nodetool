import React from 'react';

interface UpdateNotificationProps {
  releaseUrl: string;
  onClose: () => void;
}

const UpdateNotification: React.FC<UpdateNotificationProps> = ({ releaseUrl, onClose }) => {
  const handleReleaseClick = (e: React.MouseEvent) => {
    e.preventDefault();
    window.api.system.openExternal(releaseUrl);
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
      }}
    >
      <p style={{ margin: 0, color: 'white' }}>A new version is available!</p>
      <a
        id="release-link"
        href={releaseUrl}
        onClick={handleReleaseClick}
        style={{
          color: '#4a9eff',
          textDecoration: 'none',
          display: 'inline-block',
          marginTop: '5px',
        }}
      >
        View Release Notes
      </a>
    </div>
  );
};

export default UpdateNotification;