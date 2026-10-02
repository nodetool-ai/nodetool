import {
  encodeSketchLayerData,
  imageDocumentData,
  type ImageDocumentData
} from "@nodetool-ai/protocol/api-schemas/sketch.js";
import {
  createDefaultDocument,
  createDefaultLayer
} from "../components/sketch/types/document";
import { newDocumentId } from "../lib/newDocumentId";

export interface ExampleSketch {
  readonly category: "NodeTool" | "Ads" | "Movies" | "Art studies";
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly layers: readonly (readonly [file: string, name: string])[];
}

export const EXAMPLE_SKETCHES: readonly ExampleSketch[] = [
  {
    category: "NodeTool",
    slug: "nodetool-brief-to-screen",
    name: "NodeTool: Brief to Screen",
    description:
      "A NodeTool launch-ad sketch with connected workflow nodes, a painted ribbon, and campaign copy.",
    layers: [
      ["midnight-grid", "Midnight grid"],
      ["painted-ribbon", "Painted ribbon"],
      ["connected-nodes", "Connected workflow nodes"],
      ["campaign-copy", "Campaign lettering"],
      ["direction-notes", "Direction notes"]
    ]
  },
  {
    category: "NodeTool",
    slug: "nodetool-directors-desk",
    name: "NodeTool: Director’s Desk",
    description:
      "Plan a product film with three shot sketches, a shared brief, and a storyboard-to-timeline sequence.",
    layers: [
      ["paper", "Desk paper"],
      ["frame-layout", "Storyboard frames"],
      ["shot-sketches", "Product shot sketches"],
      ["shot-labels", "Shot labels and headline"],
      ["brief-and-arrows", "Brief and direction arrows"]
    ]
  },
  {
    category: "Ads",
    slug: "serein-fragrance-ad",
    name: "Serein: Fragrance Campaign",
    description:
      "An amber-bottle ad for a fictional fragrance brand. Explore glass, botanical shadows, and headline placement.",
    layers: [
      ["warm-paper", "Warm paper"],
      ["arch-and-plinth", "Arch and product plinth"],
      ["amber-bottle", "Amber bottle"],
      ["leaves-and-highlights", "Botanical shadows and highlights"],
      ["advertising-copy", "Advertising lettering"]
    ]
  },
  {
    category: "Ads",
    slug: "volt-running-ad",
    name: "Volt: Running Campaign",
    description:
      "A fictional running-shoe launch with diagonal brush strokes, an illustrated hero product, and bold campaign lettering.",
    layers: [
      ["forest-paper", "Forest-green paper"],
      ["lime-motion-strokes", "Lime motion strokes"],
      ["runner-shoe", "Running shoe illustration"],
      ["speed-accents", "Speed accents"],
      ["launch-copy", "Launch lettering"]
    ]
  },
  {
    category: "Movies",
    slug: "signal-09-film-poster",
    name: "Signal 09: Film Poster",
    description:
      "Original science-fiction key art. A lone astronaut, an eclipsed planet, and a separate title layer.",
    layers: [
      ["star-paper", "Star field"],
      ["eclipse", "Eclipsed planet"],
      ["alien-terrain", "Alien terrain"],
      ["astronaut-and-antenna", "Astronaut and antenna"],
      ["film-title", "Film title and tagline"]
    ]
  },
  {
    category: "Movies",
    slug: "last-train-storyboard",
    name: "The Last Train: Storyboard",
    description:
      "An original noir scene in three frames: establish the station, follow an eyeline, then reveal a stranger.",
    layers: [
      ["storyboard-paper", "Storyboard paper"],
      ["frame-layout", "Frame layout"],
      ["noir-shot-sketches", "Noir shot sketches"],
      ["camera-direction", "Camera direction marks"],
      ["scene-and-shot-labels", "Scene title and shot labels"]
    ]
  },
  {
    category: "Art studies",
    slug: "moonlit-tide",
    name: "Moonlit Tide",
    description:
      "Long teal brush marks, a pale moon, and broken gold reflections.",
    layers: [
      ["sky", "Evening sky"],
      ["moon", "Moon and stars"],
      ["water", "Sea brushwork"],
      ["reflections", "Gold reflections"],
      ["headland", "Headland and foam"]
    ]
  },
  {
    category: "Art studies",
    slug: "golden-koi",
    name: "Golden Koi",
    description:
      "Vermilion koi circle through ink-dark water and fine ripples.",
    layers: [
      ["pond", "Deep water"],
      ["ripples", "Fine ripples"],
      ["koi", "Painted koi"],
      ["lilies", "Lily pads"],
      ["petals", "Floating petals"]
    ]
  },
  {
    category: "Art studies",
    slug: "saffron-dunes",
    name: "Saffron Dunes",
    description:
      "Warm curved ridges, terracotta shadows, and wind-drawn contours.",
    layers: [
      ["sky", "Paper sky and sun"],
      ["distant-ridges", "Distant ridges"],
      ["sunlit-dune", "Sunlit dune"],
      ["foreground", "Foreground sand"],
      ["wind-lines", "Wind lines and caravan"]
    ]
  },
  {
    category: "Art studies",
    slug: "indigo-herbarium",
    name: "Indigo Herbarium",
    description: "An inky botanical study with delicate veins on warm paper.",
    layers: [
      ["paper", "Textured paper"],
      ["ochre-disk", "Ochre disk"],
      ["stems", "Branch strokes"],
      ["leaves", "Indigo leaves"],
      ["ink-details", "Leaf veins and ink samples"]
    ]
  },
  {
    category: "Art studies",
    slug: "pelagic-light",
    name: "Pelagic Light",
    description:
      "A luminous jellyfish with flowing lavender tentacles and a translucent bell.",
    layers: [
      ["deep-water", "Midnight water"],
      ["halo", "Soft blue halo"],
      ["tentacles", "Ribbon tentacles"],
      ["bell", "Luminous bell"],
      ["plankton", "Plankton and bubbles"]
    ]
  },
  {
    category: "Art studies",
    slug: "vermilion-crane",
    name: "Vermilion Crane",
    description:
      "A red-crowned crane, feathered ink strokes, and a warm vermilion sun.",
    layers: [
      ["paper", "Warm paper"],
      ["sun", "Vermilion sun"],
      ["water", "Shallow water"],
      ["crane", "Crane and feather strokes"],
      ["reeds", "Reeds"]
    ]
  },
  {
    category: "Art studies",
    slug: "alpine-silence",
    name: "Alpine Silence",
    description:
      "Snow-cut peaks and dark pines reflected in a turquoise alpine lake.",
    layers: [
      ["sky", "Pale sky and sun"],
      ["clouds", "Cloud strokes"],
      ["peaks", "Snow and mountain shadows"],
      ["lake", "Lake reflections"],
      ["pines", "Pines and shoreline"]
    ]
  },
  {
    category: "Art studies",
    slug: "chromatic-current",
    name: "Chromatic Current",
    description:
      "Sweeping coral and blue brush ribbons, fine ink loops, and scattered pigment.",
    layers: [
      ["paper", "Grainy paper"],
      ["color-fields", "Ochre and coral fields"],
      ["blue-ribbon", "Blue brush ribbon"],
      ["coral-ribbon", "Coral brush ribbon"],
      ["ink-accents", "Ink loops and pigment"]
    ]
  }
];

export const EXAMPLE_SKETCH_WIDTH = 1200;
export const EXAMPLE_SKETCH_HEIGHT = 900;

export function exampleSketchUrl(slug: string, file: string): string {
  return `/examples/sketches/${slug}/${file}.svg`;
}

function rasterizeLayer(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = EXAMPLE_SKETCH_WIDTH;
      canvas.height = EXAMPLE_SKETCH_HEIGHT;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("A drawing canvas is unavailable."));
        return;
      }
      try {
        context.drawImage(image, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () =>
      reject(new Error("Could not load the example artwork."));
    image.src = url;
  });
}

/** Own the pixels in the copy so it remains editable without the example files. */
export async function buildExampleSketch(
  example: ExampleSketch
): Promise<ImageDocumentData> {
  const bounds = {
    x: 0,
    y: 0,
    width: EXAMPLE_SKETCH_WIDTH,
    height: EXAMPLE_SKETCH_HEIGHT
  };
  const layers = await Promise.all(
    example.layers.map(async ([file, name]) => ({
      ...createDefaultLayer(
        name,
        "raster",
        EXAMPLE_SKETCH_WIDTH,
        EXAMPLE_SKETCH_HEIGHT
      ),
      id: newDocumentId(),
      data: encodeSketchLayerData(
        await rasterizeLayer(exampleSketchUrl(example.slug, file)),
        bounds
      )
    }))
  );
  const activeLayer = layers.at(-1);
  if (!activeLayer) {
    throw new Error("The example has no paint layers.");
  }
  return imageDocumentData.parse({
    sketch: {
      ...createDefaultDocument(EXAMPLE_SKETCH_WIDTH, EXAMPLE_SKETCH_HEIGHT),
      layers,
      activeLayerId: activeLayer.id,
      maskLayerId: null,
      activeTool: "brush",
      viewport: { zoom: 1, pan: { x: 0, y: 0 } },
      history: [],
      historyIndex: -1
    },
    layerBindings: []
  });
}
