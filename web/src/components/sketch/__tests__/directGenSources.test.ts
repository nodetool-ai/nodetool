import { directGenSourceLayers } from "../Inspector/directGenSources";
import { createDefaultLayer, type Layer } from "../types";

describe("directGenSourceLayers", () => {
  it("offers an uploaded photo whose pixels sit behind its image reference", () => {
    // What "Upload an image to edit" leaves on the first layer: no inline
    // pixels yet, only the asset it was placed from.
    const photo: Layer = {
      ...createDefaultLayer("holiday-photo.jpg", "raster", 800, 600),
      imageReference: {
        uri: "/api/storage/1/photo.jpg",
        naturalWidth: 800,
        naturalHeight: 600,
        objectFit: "contain"
      }
    };
    const generated = createDefaultLayer("Image-to-Image", "raster", 800, 600);

    expect(
      directGenSourceLayers([generated, photo], generated.id).map((l) => l.name)
    ).toEqual(["holiday-photo.jpg"]);
  });

  it("leaves out the generated layer itself, empty layers, and groups", () => {
    const generated = createDefaultLayer("Image-to-Image", "raster");
    const empty = createDefaultLayer("Empty", "raster");
    const group = { ...createDefaultLayer("Group", "group"), data: "data:x" };
    const painted = { ...createDefaultLayer("Painted", "raster"), data: "data:x" };

    expect(
      directGenSourceLayers([generated, empty, group, painted], generated.id).map(
        (l) => l.name
      )
    ).toEqual(["Painted"]);
  });
});
