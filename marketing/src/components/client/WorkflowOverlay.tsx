import React from "react";
import { SimpleReactFlowWrapperWithProvider } from "./SimpleReactFlowWrapper";
import { Workflow } from "./types";

interface WorkflowOverlayProps {
  workflow: Workflow;
  onClose?: () => void;
}

const WorkflowOverlay: React.FC<WorkflowOverlayProps> = ({
  workflow,
  onClose,
}) => {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30"
      onClick={(e) => onClose && e.target === e.currentTarget && onClose()}
    >
      <div className="bg-slate-900 rounded-lg shadow-lg w-4/5 h-4/5 flex flex-col overflow-hidden">
        <div className="p-4 border-b">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold">{workflow.name}</h2>
            {onClose && (
              <button
                onClick={onClose}
                className="p-1 rounded-full hover:bg-gray-200"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
          {workflow.description && (
            <p className="mt-2 text-slate-300">{workflow.description}</p>
          )}
        </div>

        <div className="flex-grow overflow-hidden">
          <SimpleReactFlowWrapperWithProvider
            workflow={workflow}
            className="w-full h-full"
          />
        </div>
      </div>
    </div>
  );
};

export default WorkflowOverlay;
