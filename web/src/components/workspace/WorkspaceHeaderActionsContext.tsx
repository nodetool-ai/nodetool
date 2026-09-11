import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState
} from "react";

interface HeaderActionsRegistration {
  ownerId: string;
  content: React.ReactNode;
}

interface WorkspaceHeaderActionsContextValue {
  actions: React.ReactNode;
  registerActions: (ownerId: string, content: React.ReactNode) => void;
  unregisterActions: (ownerId: string) => void;
}

const WorkspaceHeaderActionsContext =
  createContext<WorkspaceHeaderActionsContextValue | null>(null);

export const WorkspaceHeaderActionsProvider: React.FC<
  React.PropsWithChildren
> = ({ children }) => {
  const [registration, setRegistration] =
    useState<HeaderActionsRegistration | null>(null);

  const registerActions = useCallback(
    (ownerId: string, content: React.ReactNode) => {
      setRegistration({ ownerId, content });
    },
    []
  );
  const unregisterActions = useCallback((ownerId: string) => {
    setRegistration((current) =>
      current?.ownerId === ownerId ? null : current
    );
  }, []);

  const value = useMemo(
    () => ({
      actions: registration?.content ?? null,
      registerActions,
      unregisterActions
    }),
    [registration, registerActions, unregisterActions]
  );

  return (
    <WorkspaceHeaderActionsContext.Provider value={value}>
      {children}
    </WorkspaceHeaderActionsContext.Provider>
  );
};

export const useWorkspaceHeaderActions = () =>
  useContext(WorkspaceHeaderActionsContext);
