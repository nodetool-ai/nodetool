# Native model default policy

Primary sources are [web seeding](../../../web/src/hooks/useSeedDefaultModels.ts),
[preferred keys](../../../web/src/hooks/useRecommendedModelKeys.ts),
[protocol catalog](../../../packages/protocol/src/nodetool-models.ts), and
[default application](../../../web/src/utils/applyDefaultModels.ts).
Native presentation remains independently configured.

- A1: Seed available language, text-to-image, and TTS models only. Prefer cloud
  over local. Language priority is protocol curated order, ranked keys, server
  recommendations, then catalog order within each group. Image and TTS use
  catalog order within each group.
- A2: Upscale and RemoveBackground pickers persist defaults under
  `image_model:upscale` and `image_model:remove_background`. Load resolution uses
  that pin when present, otherwise the global image pin. An incompatible task
  pin does not trigger another global fallback. Only global defaults auto-seed.
- A3: Existing native pins store provider and full ID only, equivalent to web
  legacy pins without task metadata. They remain valid when unavailable or
  absent from the catalog. Do not infer task metadata for these stored pins.
  Newly seeded candidates retain their catalog task constraints for application.
- A4: Preserve nonempty selected and legacy values, unknown document fields,
  provider restrictions, explicit edits and clears, account and document epochs.
  Apply through the existing no-undo defaults API, retaining dirty state and
  history behavior. Catalog contexts are bounded by model type and picker
  filters, never node count. Each fill traverses the workflow once.

Acceptance uses native fake-server tests for curated versus ranked priority,
cloud/local availability, independent task pins and global fallback, legacy
unavailable pins, reopen and delayed replies. Existing document checks own
undo/redo normalization. No web runtime or presentation module is imported.
