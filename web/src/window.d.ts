interface WindowControls {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
}

declare global {
  interface Window {
    api: {
      runApp: (workflowId: string) => void;
      clipboardWriteText: (text: string) => void;
      clipboardReadText: () => string;
      onMenuEvent: (callback: (data: MenuEventData) => void) => void;
      unregisterMenuEvent: (callback: (data: any) => void) => void;
      onCreateWorkflow: (workflow: Workflow) => void;
      onUpdateWorkflow: (workflow: Workflow) => void;
      onDeleteWorkflow: (workflow: Workflow) => void;
      showPackageManager: (nodeSearch?: string) => void;
      windowControls: WindowControls;
      platform: string;
    };
    process: {
      type: string;
      platform: string;
      versions: {
        node: string;
        electron: string;
        chrome: string;
      };
    };
    electron?: {
      on: (channel: string, listener: (...args: any[]) => void) => void;
      off: (channel: string, listener: (...args: any[]) => void) => void;
    };
  }
}

export {};
