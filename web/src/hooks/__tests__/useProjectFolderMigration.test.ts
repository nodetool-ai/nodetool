/**
 * The migration hooks keep the project folders and the migration state
 * fresh: the folders when the server moves the state on during a run, and
 * the state when a request is refused because another process changed it.
 */
import { renderHook } from "@testing-library/react";

const statusUseQuery = jest.fn();
const confirmUseMutation = jest.fn();
const setStatusData = jest.fn();
const invalidateStatus = jest.fn();
const invalidateProjects = jest.fn();

jest.mock("../../trpc/client", () => ({
  trpc: {
    useUtils: () => ({
      projects: {
        migration: {
          status: { setData: setStatusData, invalidate: invalidateStatus }
        }
      }
    }),
    projects: {
      migration: {
        status: { useQuery: statusUseQuery },
        confirm: { useMutation: confirmUseMutation }
      }
    }
  }
}));
jest.mock("../useProjects", () => ({
  useInvalidateProjects: () => invalidateProjects
}));

import {
  useConfirmProjectFolderMigration,
  useProjectFolderMigrationStatus
} from "../useProjectFolderMigration";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("useProjectFolderMigrationStatus", () => {
  it("reads the project folders again when a polled state changes", () => {
    statusUseQuery.mockReturnValue({ data: { state: "running" } });
    const { rerender } = renderHook(() => useProjectFolderMigrationStatus());
    expect(invalidateProjects).not.toHaveBeenCalled();

    statusUseQuery.mockReturnValue({ data: { state: "done" } });
    rerender();

    expect(invalidateProjects).toHaveBeenCalledTimes(1);
  });

  it("does not read them again while the state stays the same", () => {
    statusUseQuery.mockReturnValue({ data: { state: "running" } });
    const { rerender } = renderHook(() => useProjectFolderMigrationStatus());
    rerender();

    expect(invalidateProjects).not.toHaveBeenCalled();
  });
});

describe("useConfirmProjectFolderMigration", () => {
  it("reads the state again when the confirmation is refused", () => {
    confirmUseMutation.mockReturnValue({});
    renderHook(() => useConfirmProjectFolderMigration());
    const options = confirmUseMutation.mock.calls[0][0] as { onError: () => void };

    options.onError();

    expect(invalidateStatus).toHaveBeenCalled();
  });
});
