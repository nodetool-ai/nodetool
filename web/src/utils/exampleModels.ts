import { resolveUri } from "./imageUtils";

/**
 * The shipped glTF starter packs under
 * `packages/base-nodes/nodetool/assets/nodetool-base/game-models/`. Each pack
 * directory holds a `catalog.json`, an `overview.png`, and one `.glb` per
 * model, all served from the `package://` asset route.
 */
export interface ExampleModelPack {
  readonly slug: string;
  readonly label: string;
}

export const EXAMPLE_MODEL_PACKS: readonly ExampleModelPack[] = [
  { slug: "adventure", label: "Adventure" },
  { slug: "dungeon", label: "Dungeon" },
  { slug: "platformer", label: "Platformer" },
  { slug: "seaside", label: "Seaside" },
  { slug: "scifi", label: "Sci-fi" },
  { slug: "scifi-expansion", label: "Sci-fi outpost" }
];

/** One model entry in a pack's `catalog.json`. */
export interface ExampleModel {
  readonly slug: string;
  readonly name: string;
  readonly file: string;
  /** `package://nodetool-base/game-models/<pack>/<file>` */
  readonly uri: string;
  readonly triangles: number;
  readonly clips: readonly string[];
  readonly use: string;
}

export interface ExampleModelCatalog {
  readonly name: string;
  readonly models: readonly ExampleModel[];
}

const packUri = (pack: string, file: string): string =>
  `package://nodetool-base/game-models/${pack}/${file}`;

export const exampleModelOverviewUri = (pack: string): string =>
  packUri(pack, "overview.png");

export async function fetchExampleModelCatalog(
  pack: string
): Promise<ExampleModelCatalog> {
  const response = await fetch(resolveUri(packUri(pack, "catalog.json")));
  if (!response.ok) {
    throw new Error("Could not load the example models.");
  }
  return (await response.json()) as ExampleModelCatalog;
}

/** Download a shipped model as a `.glb` file ready to upload as an asset. */
export async function fetchExampleModelFile(
  model: ExampleModel
): Promise<File> {
  const response = await fetch(resolveUri(model.uri));
  if (!response.ok) {
    throw new Error("Could not load the example model.");
  }
  return new File([await response.blob()], model.file, {
    type: "model/gltf-binary"
  });
}
