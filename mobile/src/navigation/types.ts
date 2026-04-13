export type RootStackParamList = {
  MiniAppsList: undefined;
  MiniApp: {
    workflowId: string;
    workflowName: string;
  };
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
