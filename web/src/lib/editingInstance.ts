// editingInstance.ts
// -----------------------------------------------------------------
// The editing instance id this page sends with every save of a document.
//
// The server keeps the stored revision as a version before it applies a save
// from another instance, so a save that replaces another editor's work can be
// undone. One page holds one instance per document: every save path for that
// document in this page (autosave, explicit save, the open timeline's merge)
// continues the same instance, and writes no extra versions. Another tab, or
// a native app, is another instance. See `sync.ts` in the protocol package.
// -----------------------------------------------------------------

const instances = new Map<string, string>();

export type EditingInstanceKind = "workflow" | "timeline";

/** 32 lowercase hex characters, drawn once per document per page. */
export const editingInstanceFor = (
  kind: EditingInstanceKind,
  documentId: string
): string => {
  const key = `${kind}:${documentId}`;
  let instance = instances.get(key);
  if (instance === undefined) {
    instance = crypto.randomUUID().replace(/-/g, "");
    instances.set(key, instance);
  }
  return instance;
};
