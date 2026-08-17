/** @jsxImportSource @emotion/react */
/**
 * Picks one resource out of a bound collection.
 *
 * The app document declares *which* collection (a `ResourceBinding`: a kind
 * plus a project or a pinned id); this widget lets the user choose a member of
 * it. The chosen `ResourceRef` — carrying the document's current `revision` —
 * is what an operation input mapped `from: "resource"` passes to the run, and
 * what a `resourceCommand` acts on.
 *
 * The list itself is server state, so it comes through TanStack Query rather
 * than the app store: the store holds refs and selection, never entity data.
 */
import React, { useEffect, useMemo } from "react";

import { SelectField, Caption, FlexColumn } from "../../ui_primitives";
import { trpc } from "../../../trpc/client";
import { useAppRuntimeContext } from "../runtime/AppRuntimeContext";

interface ResourcePickerProps {
  /** Puck injects the placed widget's id. */
  id?: string;
  /** Id of the `ResourceBinding` in the app document. */
  resourceBindingId?: string;
  label?: string;
  disabled?: boolean;
}

export const ResourcePickerWidget: React.FC<ResourcePickerProps> = ({
  resourceBindingId,
  label,
  disabled
}) => {
  const { resources, designMode, selectResource } = useAppRuntimeContext();
  const binding = resources.find((r) => r.id === resourceBindingId);

  const { data, isLoading } = trpc.resources.list.useQuery(
    {
      kind: binding?.kind ?? "asset",
      projectId: binding?.scope.projectId,
      limit: 50
    },
    { enabled: Boolean(binding) && !designMode }
  );

  const options = useMemo(
    () => (data ?? []).map((item) => ({ label: item.name, value: item.ref.id })),
    [data]
  );

  // A binding pinned to one document has nothing to choose; point at it and
  // render the name.
  const pinned = binding?.scope.fixedId;
  const [selectedId, setSelectedId] = React.useState<string>(pinned ?? "");

  useEffect(() => {
    if (!binding) return;
    const chosen = pinned ?? selectedId;
    const found = (data ?? []).find((item) => item.ref.id === chosen);
    selectResource(binding.id, found?.ref ?? null);
  }, [binding, data, pinned, selectedId, selectResource]);

  if (!binding) {
    return (
      <Caption color="secondary">
        {designMode
          ? "Pick a resource binding for this widget."
          : "This picker is not bound to a resource."}
      </Caption>
    );
  }

  return (
    <FlexColumn gap={0.5} fullWidth>
      <SelectField
        label={label || binding.name}
        value={pinned ?? selectedId}
        options={options}
        disabled={disabled || Boolean(pinned) || isLoading || options.length === 0}
        onChange={setSelectedId}
      />
      {!isLoading && options.length === 0 ? (
        <Caption color="secondary">
          No {binding.kind} resources in this collection yet.
        </Caption>
      ) : null}
    </FlexColumn>
  );
};

export default ResourcePickerWidget;
