export type RootStackParamList = {
  Login: undefined;
  MiniAppsList: undefined;
  MiniApp: {
    workflowId: string;
    workflowName: string;
  };
  GraphEditor: {
    workflowId?: string;
  } | undefined;
  Settings: undefined;
  Chat: undefined;
  LanguageModelSelection: undefined;
};
