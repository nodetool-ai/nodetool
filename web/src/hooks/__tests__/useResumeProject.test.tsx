import { StrictMode, useEffect, type ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import type { ProjectDetail } from "../../components/projects/projectStatus";
import { useResumeProject } from "../useResumeProject";

const mockOpenProject = jest.fn();
const mockOpenTab = jest.fn();
let mockActiveTabId: string | null = null;

jest.mock("../useProjects", () => ({
  useOpenProject: () => mockOpenProject
}));
jest.mock("../../stores/WorkspaceTabsStore", () => ({
  useWorkspaceTabsStore: Object.assign(
    (selector: (state: { openTab: typeof mockOpenTab }) => unknown) =>
      selector({ openTab: mockOpenTab }),
    { getState: () => ({ activeTabId: mockActiveTabId }) }
  )
}));

const detail: ProjectDetail = {
  project: {
    id: "a",
    name: "Aurora",
    kind: "spot",
    isPersonal: false,
    archivedAt: null,
    threadId: null,
    createdAt: "2026-10-19T00:00:00.000Z",
    updatedAt: "2026-10-19T00:00:00.000Z"
  },
  documents: [],
  entities: [],
  spend: { totalUsd: 0, unpricedCount: 0, byCategory: [] }
};
const withDocument: ProjectDetail = {
  ...detail,
  documents: [
    {
      type: "storyboard",
      ref: "sb-new",
      name: "Launch film",
      updatedAt: "2026-10-18T00:00:00.000Z",
      status: null,
      spendUsd: 0,
      unpricedCount: 0,
      thumbnails: [],
      preview: null
    }
  ]
};
const strictWrapper = ({ children }: { children: ReactNode }) => (
  <StrictMode>{children}</StrictMode>
);

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockOpenProject.mockResolvedValue(true);
  mockActiveTabId = null;
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  document.getElementById("project-documents")?.remove();
});

const anchor = (): jest.Mock => {
  const element = document.createElement("div");
  element.id = "project-documents";
  const scroll = jest.fn();
  element.scrollIntoView = scroll;
  document.body.appendChild(element);
  return scroll;
};

it("does not scroll a replacement anchor after unmount", async () => {
  const { result, unmount } = renderHook(useResumeProject);
  await act(async () => result.current(detail));
  unmount();
  const scroll = anchor();
  act(() => jest.advanceTimersByTime(32));
  expect(scroll).not.toHaveBeenCalled();
});

it("scrolls the document list while mounted in StrictMode", async () => {
  const scroll = anchor();
  const { result } = renderHook(useResumeProject, {
    wrapper: strictWrapper,
    reactStrictMode: true
  });
  await act(async () => result.current(detail));
  act(() => jest.advanceTimersByTime(32));
  expect(scroll).toHaveBeenCalledTimes(1);
  expect(scroll).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
});

it.each([detail, withDocument])(
  "ignores project opening completed after unmount ($documents.length documents)",
  async (project) => {
    let resolveOpen!: (opened: boolean) => void;
    mockOpenProject.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        resolveOpen = resolve;
      })
    );
    const { result, unmount } = renderHook(useResumeProject);
    act(() => result.current(project));
    unmount();
    const scroll = anchor();
    await act(async () => resolveOpen(true));
    act(() => jest.advanceTimersByTime(32));
    expect(mockOpenTab).not.toHaveBeenCalled();
    expect(scroll).not.toHaveBeenCalled();
  }
);

it("opens the newest document without scrolling while mounted", async () => {
  const scroll = anchor();
  const { result } = renderHook(useResumeProject);
  await act(async () => result.current(withDocument));
  act(() => jest.advanceTimersByTime(32));
  expect(mockOpenTab).toHaveBeenCalledWith({
    type: "storyboard",
    ref: "sb-new",
    title: "Launch film",
    projectId: "a"
  });
  expect(scroll).not.toHaveBeenCalled();
});

it("leaves restored tabs alone", async () => {
  mockActiveTabId = "saved-tab";
  const scroll = anchor();
  const { result } = renderHook(useResumeProject);
  await act(async () => result.current(withDocument));
  act(() => jest.advanceTimersByTime(32));
  expect(mockOpenTab).not.toHaveBeenCalled();
  expect(scroll).not.toHaveBeenCalled();
});

it("does not revive the first StrictMode lifetime when its promise resolves", async () => {
  const completions: Array<(opened: boolean) => void> = [];
  mockOpenProject.mockImplementation(
    () =>
      new Promise<boolean>((resolve) => {
        completions.push(resolve);
      })
  );
  const scroll = anchor();
  renderHook(
    () => {
      const resume = useResumeProject();
      useEffect(() => resume(detail), [resume]);
    },
    { wrapper: strictWrapper, reactStrictMode: true }
  );
  expect(completions).toHaveLength(2);
  await act(async () => completions[0](true));
  act(() => jest.advanceTimersByTime(32));
  expect(scroll).not.toHaveBeenCalled();
  await act(async () => completions[1](true));
  act(() => jest.advanceTimersByTime(32));
  expect(scroll).toHaveBeenCalledTimes(1);
});
