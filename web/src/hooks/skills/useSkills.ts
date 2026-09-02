import type { TRPCClientErrorLike } from "@trpc/client";
import type {
  UseTRPCMutationResult,
  UseTRPCQueryResult
} from "@trpc/react-query/shared";
import type { AppRouter } from "@nodetool-ai/websocket/trpc";
import {
  trpc,
  type RouterInputs,
  type RouterOutputs
} from "../../trpc/client";

const SKILL_LIST_STALE_TIME = 30_000;

type SkillsError = TRPCClientErrorLike<AppRouter>;
type SkillsList = RouterOutputs["skills"]["list"];
type Skill = RouterOutputs["skills"]["get"];
type SkillListMutationContext = { previous: SkillsList | undefined };

/**
 * The user's skills. `includeSystem` adds the ones NodeTool ships — read-only,
 * flagged `system`, and invocable as `/<name>` like any other. Every surface
 * that shows the catalog wants them: the composer's `/` menu, the new-project
 * starters, and the skills panel, which marks them and offers only the actions
 * a document with no row accepts.
 */
export const useSkills = (
  options: { includeSystem?: boolean } = {}
): UseTRPCQueryResult<SkillsList, SkillsError> =>
  trpc.skills.list.useQuery(
    { includeSystem: options.includeSystem },
    {
      staleTime: SKILL_LIST_STALE_TIME,
      retry: false
    }
  );

export const useSkill = (
  id: string
): UseTRPCQueryResult<Skill, SkillsError> =>
  trpc.skills.get.useQuery(
    { id },
    {
      enabled: !!id,
      staleTime: SKILL_LIST_STALE_TIME,
      retry: false
    }
  );

export const useCreateSkill = (): UseTRPCMutationResult<
  Skill,
  SkillsError,
  RouterInputs["skills"]["create"],
  SkillListMutationContext
> => {
  const utils = trpc.useUtils();
  return trpc.skills.create.useMutation({
    onMutate: async (input) => {
      await utils.skills.list.cancel();
      const previous = utils.skills.list.getData({});
      const optimisticId =
        input.id ?? `optimistic-skill-${Date.now().toString(36)}`;
      utils.skills.list.setData({}, (current) => [
        ...(current ?? []),
        {
          id: optimisticId,
          name: input.name,
          description: input.description ?? "",
          updatedAt: new Date().toISOString(),
          system: false
        }
      ]);
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context) {
        utils.skills.list.setData({}, context.previous);
      }
    },
    onSuccess: (created) => {
      utils.skills.get.setData({ id: created.id }, created);
      utils.skills.list.setData({}, (current) =>
        current?.map((skill) =>
          skill.id === created.id
            ? {
                id: created.id,
                name: created.name,
                description: created.description,
                updatedAt: created.updatedAt,
                system: false
              }
            : skill
        )
      );
    },
    onSettled: () => {
      void utils.skills.list.invalidate();
    }
  });
};

export const useUpdateSkill = (): UseTRPCMutationResult<
  Skill,
  SkillsError,
  RouterInputs["skills"]["update"],
  SkillListMutationContext
> => {
  const utils = trpc.useUtils();
  return trpc.skills.update.useMutation({
    onMutate: async (input) => {
      await utils.skills.list.cancel();
      const previous = utils.skills.list.getData({});
      utils.skills.list.setData({}, (current) =>
        current?.map((skill) => {
          if (skill.id !== input.id) return skill;
          const optimistic = { ...skill };
          if (input.name !== undefined) optimistic.name = input.name;
          if (input.description !== undefined) {
            optimistic.description = input.description;
          }
          return optimistic;
        })
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context) {
        utils.skills.list.setData({}, context.previous);
      }
    },
    onSuccess: (updated) => {
      utils.skills.get.setData({ id: updated.id }, updated);
      utils.skills.list.setData({}, (current) =>
        current?.map((skill) =>
          skill.id === updated.id
            ? {
                id: updated.id,
                name: updated.name,
                description: updated.description,
                updatedAt: updated.updatedAt,
                system: false
              }
            : skill
        )
      );
    },
    onSettled: () => {
      void utils.skills.list.invalidate();
    }
  });
};

export const useDeleteSkill = (): UseTRPCMutationResult<
  RouterOutputs["skills"]["delete"],
  SkillsError,
  RouterInputs["skills"]["delete"],
  SkillListMutationContext
> => {
  const utils = trpc.useUtils();
  return trpc.skills.delete.useMutation({
    onMutate: async ({ id }) => {
      await utils.skills.list.cancel();
      const previous = utils.skills.list.getData({});
      utils.skills.list.setData(
        {},
        (current) => current?.filter((skill) => skill.id !== id)
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context) {
        utils.skills.list.setData({}, context.previous);
      }
    },
    onSuccess: (_result, { id }) => {
      utils.skills.get.setData({ id }, undefined);
    },
    onSettled: () => {
      void utils.skills.list.invalidate();
    }
  });
};
