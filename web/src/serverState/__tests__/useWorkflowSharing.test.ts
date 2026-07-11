import { renderHook } from "@testing-library/react";
import {
  workflowSharingQueryKey,
  myWorkflowRoleQueryKey,
  sharedWithMeQueryKey,
  shareUrlForToken
} from "../useWorkflowSharing";

jest.mock("@tanstack/react-query", () => ({
  __esModule: true,
  useQuery: jest.fn(),
  useMutation: jest.fn(() => ({
    mutateAsync: jest.fn(),
    isPending: false
  })),
  useQueryClient: jest.fn(() => ({
    invalidateQueries: jest.fn()
  }))
}));

jest.mock("../../trpc/client", () => ({
  __esModule: true,
  trpcClient: {
    workflows: {
      sharing: {
        get: { query: jest.fn() },
        createLink: { mutate: jest.fn() },
        revokeLink: { mutate: jest.fn() },
        setRole: { mutate: jest.fn() },
        removeCollaborator: { mutate: jest.fn() },
        accept: { mutate: jest.fn() },
        myRole: { query: jest.fn() },
        sharedWithMe: { query: jest.fn() }
      }
    }
  }
}));

import { useQuery, useMutation } from "@tanstack/react-query";
import {
  useWorkflowSharing,
  useMyWorkflowRole,
  useSharedWithMe
} from "../useWorkflowSharing";

const mockUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;
const mockUseMutation = useMutation as jest.MockedFunction<typeof useMutation>;

describe("useWorkflowSharing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null
    } as any);
    mockUseMutation.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false
    } as any);
  });

  describe("query keys", () => {
    it("scopes sharing state to the workflow", () => {
      expect(workflowSharingQueryKey("wf-1")).toEqual([
        "workflow",
        "wf-1",
        "sharing"
      ]);
    });

    it("scopes my-role to the workflow", () => {
      expect(myWorkflowRoleQueryKey("wf-1")).toEqual([
        "workflow",
        "wf-1",
        "my-role"
      ]);
    });

    it("uses a stable shared-with-me key", () => {
      expect(sharedWithMeQueryKey).toEqual(["workflows", "shared-with-me"]);
    });
  });

  describe("shareUrlForToken", () => {
    it("builds an absolute /share URL", () => {
      expect(shareUrlForToken("tok123")).toBe(
        `${window.location.origin}/share/tok123`
      );
    });
  });

  it("disables the sharing query without a workflow id", () => {
    renderHook(() => useWorkflowSharing(null));
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false })
    );
  });

  it("enables the sharing query with a workflow id", () => {
    renderHook(() => useWorkflowSharing("wf-1"));
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        queryKey: workflowSharingQueryKey("wf-1")
      })
    );
  });

  it("exposes the four sharing mutations", () => {
    const { result } = renderHook(() => useWorkflowSharing("wf-1"));
    expect(result.current.createLink).toBeDefined();
    expect(result.current.revokeLink).toBeDefined();
    expect(result.current.setRole).toBeDefined();
    expect(result.current.removeCollaborator).toBeDefined();
    expect(mockUseMutation).toHaveBeenCalledTimes(4);
  });

  it("disables the my-role query without a workflow id", () => {
    renderHook(() => useMyWorkflowRole(undefined));
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false })
    );
  });

  it("queries shared-with-me under its stable key", () => {
    renderHook(() => useSharedWithMe());
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: sharedWithMeQueryKey })
    );
  });
});
