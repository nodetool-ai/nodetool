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
  Secrets: undefined;
  Collections: undefined;
  Jobs: undefined;
  Threads: undefined;
};
