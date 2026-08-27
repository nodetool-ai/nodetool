import { act, renderHook } from "@testing-library/react";
import type {
  CreateSkillInput,
  SkillListItem
} from "@nodetool-ai/protocol/api-schemas/skills.js";

type SkillList = SkillListItem[];
type SkillsListQuery = { readonly marker?: never };
type MutationContext = { previous: SkillList | undefined };
type CreateMutationOptions = {
  onMutate: (input: CreateSkillInput) => Promise<MutationContext>;
  onError: (
    error: unknown,
    input: CreateSkillInput,
    context: MutationContext
  ) => void;
};
type DeleteMutationOptions = {
  onMutate: (input: { id: string }) => Promise<MutationContext>;
  onError: (
    error: unknown,
    input: { id: string },
    context: MutationContext
  ) => void;
};
type SkillListUpdate =
  | SkillList
  | undefined
  | ((current: SkillList | undefined) => SkillList | undefined);

let cachedList: SkillList | undefined;
let createOptions: CreateMutationOptions | undefined;
let deleteOptions: DeleteMutationOptions | undefined;

const mockListUseQuery = jest.fn(() => ({ data: undefined }));
const mockGetUseQuery = jest.fn(() => ({ data: undefined }));
const mockCreateUseMutation = jest.fn((options: CreateMutationOptions) => {
  createOptions = options;
  return {};
});
const mockUpdateUseMutation = jest.fn((options: unknown) => options);
const mockDeleteUseMutation = jest.fn((options: DeleteMutationOptions) => {
  deleteOptions = options;
  return {};
});
const mockSetData = jest.fn((_input: SkillsListQuery, update: SkillListUpdate) => {
  cachedList = typeof update === "function" ? update(cachedList) : update;
});
const mockCancel = jest.fn(async () => undefined);
const mockInvalidate = jest.fn(async () => undefined);
const mockGetData = jest.fn(() => cachedList);

jest.mock("../../../trpc/client", () => ({
  trpc: {
    useUtils: () => ({
      skills: {
        list: {
          cancel: mockCancel,
          getData: mockGetData,
          setData: mockSetData,
          invalidate: mockInvalidate
        },
        get: { setData: jest.fn() }
      }
    }),
    skills: {
      list: { useQuery: mockListUseQuery },
      get: { useQuery: mockGetUseQuery },
      create: { useMutation: mockCreateUseMutation },
      update: { useMutation: mockUpdateUseMutation },
      delete: { useMutation: mockDeleteUseMutation }
    }
  }
}));

import {
  useCreateSkill,
  useDeleteSkill,
  useSkill,
  useSkills,
  useUpdateSkill
} from "../useSkills";

beforeEach(() => {
  jest.clearAllMocks();
  cachedList = undefined;
  createOptions = undefined;
  deleteOptions = undefined;
});

describe("skill query hooks", () => {
  it("uses explicit non-retry query policies", () => {
    renderHook(() => useSkills());
    renderHook(() => useSkill("skill-1"));
    expect(mockListUseQuery).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ staleTime: 30_000, retry: false })
    );
    expect(mockGetUseQuery).toHaveBeenCalledWith(
      { id: "skill-1" },
      expect.objectContaining({ staleTime: 30_000, retry: false })
    );
  });
});

describe("skill list mutations", () => {
  it("optimistically adds a skill and can roll back an unloaded list", async () => {
    renderHook(() => useCreateSkill());
    if (!createOptions) throw new Error("Create mutation options not captured");
    const input: CreateSkillInput = {
      name: "my-skill",
      description: "A valid description",
      content: "# Skill"
    };
    await act(async () => {
      await createOptions?.onMutate(input);
    });
    expect(cachedList).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "my-skill",
          description: "A valid description"
        })
      ])
    );
    act(() =>
      createOptions?.onError(new Error("offline"), input, {
        previous: undefined
      })
    );
    expect(cachedList).toBeUndefined();
  });

  it("optimistically removes a skill and restores it on failure", async () => {
    const previous: SkillList = [
      {
        id: "skill-1",
        name: "my-skill",
        description: "A valid description",
        updatedAt: "2026-08-27T00:00:00.000Z"
      }
    ];
    cachedList = previous;
    renderHook(() => useDeleteSkill());
    if (!deleteOptions) throw new Error("Delete mutation options not captured");
    const input = { id: "skill-1" };
    await act(async () => {
      await deleteOptions?.onMutate(input);
    });
    expect(cachedList).toEqual([]);
    act(() =>
      deleteOptions?.onError(new Error("offline"), input, { previous })
    );
    expect(cachedList).toEqual(previous);
  });

  it("exposes update and delete mutation hooks", () => {
    renderHook(() => useUpdateSkill());
    renderHook(() => useDeleteSkill());
    expect(mockUpdateUseMutation).toHaveBeenCalled();
    expect(mockDeleteUseMutation).toHaveBeenCalled();
  });
});
