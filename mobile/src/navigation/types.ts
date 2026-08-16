export type RootStackParamList = {
  Login: undefined;
  WorkflowsList: undefined;
  GraphEditor: {
    workflowId?: string;
  } | undefined;
  Settings: undefined;
  Chat: { threadId?: string } | undefined;
  LanguageModelSelection: undefined;
  Assets: {
    parentId?: string;
    folderName?: string;
  } | undefined;
  AssetViewer: {
    assetId: string;
  };
  /** Browse every document, all kinds in one list. */
  Documents: undefined;
  /** Browse the apps hosted on the server. */
  Apps: undefined;
  /** One app. `name` seeds the header before the load resolves. */
  App: {
    applicationId: string;
    name?: string;
  };
  /** Storyboard editor. `name` seeds the header before the load resolves. */
  StoryboardEditor: {
    id: string;
    name?: string;
  };
  /** Script editor. `name` seeds the header before the load resolves. */
  ScriptEditor: {
    id: string;
    name?: string;
  };
  /** JS script editor. `name` seeds the header before the load resolves. */
  JsScriptEditor: {
    id: string;
    name?: string;
  };
  /** Read-only timeline. */
  TimelineViewer: {
    id: string;
    name?: string;
  };
  /** Read-only sketch: composited layers plus their generation status. */
  SketchViewer: {
    id: string;
    name?: string;
  };
  /** Fallback surface for document kinds with no dedicated screen yet. */
  DocumentViewer: {
    kind: string;
    id: string;
    name?: string;
  };
  Secrets: undefined;
  Collections: undefined;
  /** Job history, optionally narrowed to one workflow. */
  Jobs: { workflowId?: string } | undefined;
  /** Trigger monitoring: what is armed, what fired, what broke. */
  Triggers: undefined;
  /** One job: status, timing, cost, error, and its outputs. */
  JobDetail: { jobId: string };
  Threads: undefined;
};
