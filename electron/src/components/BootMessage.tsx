import React from 'react';

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
}

const BootMessage: React.FC<BootMessageProps> = ({ message, showUpdateSteps, progressData }) => {
  return (
    <div id="boot-message">
      <svg
        className="nodetool-icon"
        width="396"
        height="404"
        viewBox="0 0 396 404"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          className="path-1"
          d="M128 176.5L195.5 139L70.5 70L2.5 108L1 112V403L126 323V180L128 176.5Z"
          fill="#2E2E2E"
        />
        <path
          className="path-2"
          d="M394.5 403L267.5 323V180L394.5 108V403Z"
          fill="#2E2E2E"
        />
        <path
          className="path-3"
          d="M394.5 108L195 1L70 69.5L268 179L394.5 108Z"
          fill="#2E2E2E"
        />
        <path
          className="path-4"
          d="M195.5 138.5L69.3451 70L3.5 107L127 176.5L195.5 138.5Z"
          fill="#2E2E2E"
        />
        <path
          className="path-5"
          d="M394.5 108V403L267.5 323V180L394.5 108ZM394.5 108L195 1L70 69.5L268 179L394.5 108ZM195.5 139L128 176.5L126 180V323L1 403V112L2.5 108L70.5 70L195.5 139ZM69.3451 70L195.5 138.5L127 176.5L3.5 107L69.3451 70Z"
          stroke="white"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>

      <div className="boot-text">{message}</div>
      
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
    </div>
  );
};

export default BootMessage;