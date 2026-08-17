/**
 * Shared plumbing for widgets that drive a `ResourceBinding`.
 *
 * The app document declares *which* collection a widget works on (a kind plus
 * a project scope or one pinned id); this hook turns that declaration into the
 * collection's members and the `ResourceRef` the widget currently points at,
 * and reports the pick to the runtime so an operation input mapped
 * `from: "resource"` sees it.
 *
 * The listing is server state, so it comes through TanStack Query. The app
 * store holds refs and selection only — entity data never lands in it.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ResourceBinding, ResourceRef } from "@nodetool-ai/app-runtime";

import { trpc, type RouterOutputs } from "../../../trpc/client";
import { useAppRuntimeContext } from "../runtime/AppRuntimeContext";

export type ResourceItem = RouterOutputs["resources"]["list"][number];

interface BoundResource {
  /** The declared binding, or undefined when the widget names none. */
  binding: ResourceBinding | undefined;
  items: ResourceItem[];
  isLoading: boolean;
  /** In the builder canvas nothing is fetched — widgets render a hint instead. */
  designMode: boolean;
  /** The resource the widget currently drives. */
  selected: ResourceRef | null;
  select: (ref: ResourceRef | null) => void;
}

/** How many members of a collection a widget lists at once. */
const LIST_LIMIT = 50;

/**
 * @param fallbackToFirst point at the first member of an unpinned collection
 *   until the user picks another — what an editing widget needs to have
 *   anything to show.
 */
export const useBoundResource = (
  resourceBindingId: string | undefined,
  fallbackToFirst = false
): BoundResource => {
  const { resources, designMode, selectResource } = useAppRuntimeContext();
  const binding = resources.find((r) => r.id === resourceBindingId);
  const pinnedId = binding?.scope.fixedId;

  const { data, isLoading } = trpc.resources.list.useQuery(
    {
      kind: binding?.kind ?? "asset",
      projectId: binding?.scope.projectId,
      limit: LIST_LIMIT
    },
    { enabled: Boolean(binding) && !designMode }
  );

  const items = useMemo(() => data ?? [], [data]);

  const [chosenId, setChosenId] = useState<string | null>(null);
  const targetId =
    pinnedId ?? chosenId ?? (fallbackToFirst ? items[0]?.ref.id : undefined);

  const selected = useMemo<ResourceRef | null>(() => {
    if (!binding || !targetId) return null;
    // A pinned id can sit outside the listed page; point at it anyway. The
    // revision a write needs comes from the read, not from the listing.
    return (
      items.find((item) => item.ref.id === targetId)?.ref ?? {
        kind: binding.kind,
        id: targetId
      }
    );
  }, [binding, items, targetId]);

  useEffect(() => {
    if (binding) selectResource(binding.id, selected);
  }, [binding, selected, selectResource]);

  const select = useCallback(
    (ref: ResourceRef | null) => setChosenId(ref?.id ?? null),
    []
  );

  return { binding, items, isLoading, designMode, selected, select };
};
