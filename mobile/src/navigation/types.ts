export type RootStackParamList = {
  Login: undefined;
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
  /** Browse timelines, sketches, and storyboards in one list. */
  Documents: undefined;
  /** Browse the apps hosted on the server. The home screen after login. */
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
  /** Job history, optionally narrowed to one workflow. */
  Jobs: { workflowId?: string } | undefined;
  /** One job: status, timing, cost, error, and its outputs. */
  JobDetail: { jobId: string };
  Threads: undefined;
};
