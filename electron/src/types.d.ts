declare global {
  interface Window {
    api: {
      getServerState: () => Promise<ServerState>;
      openLogFile: () => Promise<void>;
      openExternal: (url: string) => void;
      onUpdateProgress: (
        callback: (data: {
          componentName: string;
          progress: number;
          action: string;
          eta?: string;
        }) => void
      ) => void;
      onServerStarted: (callback: () => void) => void;
      onBootMessage: (callback: (message: string) => void) => void;
      onServerLog: (callback: (message: string) => void) => void;
      onUpdateAvailable: (callback: (info: UpdateInfo) => void) => void;
    };
  }
}

interface ServerState {
  isStarted: boolean;
  bootMsg: string;
  logs: string[];
  initialURL: string;
}

interface UpdateInfo {
  releaseUrl: string;
}

interface IntervalRef {
  current: NodeJS.Timeout | null;
}

export interface JSONSchema {
  type: string;
  title?: string;
  label?: string;
  description?: string;
  format?: string;
  default?: any;
  required?: boolean;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  enum?: string[];
  anyOf?: JSONSchema[];
  allOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  not?: JSONSchema;
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  definitions?: Record<string, JSONSchema>;
  $ref?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  tags: string;
  thumbnail: string;
  thumbnail_url: string;
  input_schema: JSONSchema;
  output_schema: JSONSchema;
}

export interface WebSocketUpdate {
  type: "delete_workflow" | "update_workflow" | "create_workflow";
  id?: string;
  workflow?: Workflow;
}

export { ServerState, UpdateInfo, IntervalRef, Workflow };
