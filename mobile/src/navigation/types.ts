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
  /** Fallback surface for document kinds with no dedicated screen yet. */
  DocumentViewer: {
    kind: string;
    id: string;
    name?: string;
  };
  Secrets: undefined;
  Collections: undefined;
  Jobs: undefined;
  Threads: undefined;
};
