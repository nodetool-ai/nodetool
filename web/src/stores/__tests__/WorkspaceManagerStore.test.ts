import { useWorkspaceManagerStore } from "../WorkspaceManagerStore";

describe("WorkspaceManagerStore", () => {
  beforeEach(() => {
    useWorkspaceManagerStore.setState(useWorkspaceManagerStore.getInitialState());
  });

  it("initializes with isOpen set to false", () => {
    expect(useWorkspaceManagerStore.getState().isOpen).toBe(false);
  });

  it("sets isOpen to true when called with true", () => {
    useWorkspaceManagerStore.getState().setIsOpen(true);
    expect(useWorkspaceManagerStore.getState().isOpen).toBe(true);
  });

  it("sets isOpen to false when called with false", () => {
    useWorkspaceManagerStore.setState({ isOpen: true });
    useWorkspaceManagerStore.getState().setIsOpen(false);
    expect(useWorkspaceManagerStore.getState().isOpen).toBe(false);
  });

  it("can toggle isOpen state", () => {
    expect(useWorkspaceManagerStore.getState().isOpen).toBe(false);
    
    useWorkspaceManagerStore.getState().setIsOpen(true);
    expect(useWorkspaceManagerStore.getState().isOpen).toBe(true);
    
    useWorkspaceManagerStore.getState().setIsOpen(false);
    expect(useWorkspaceManagerStore.getState().isOpen).toBe(false);
  });

  it("can set isOpen multiple times in sequence", () => {
    useWorkspaceManagerStore.getState().setIsOpen(true);
    expect(useWorkspaceManagerStore.getState().isOpen).toBe(true);
    
    useWorkspaceManagerStore.getState().setIsOpen(false);
    expect(useWorkspaceManagerStore.getState().isOpen).toBe(false);
    
    useWorkspaceManagerStore.getState().setIsOpen(true);
    expect(useWorkspaceManagerStore.getState().isOpen).toBe(true);
  });
});
