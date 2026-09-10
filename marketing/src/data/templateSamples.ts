import generatedSamples from "./templateSamples.generated.json";

interface SampleCredit {
  name: string;
  url: string;
  license: string;
  licenseUrl: string;
}

export interface TemplateSample {
  inputImage?: string;
  inputText?: string;
  image?: string;
  imageWidth?: number;
  imageHeight?: number;
  video?: string;
  poster?: string;
  audio?: string;
  text?: string;
  caption: string;
  credit?: SampleCredit;
}

const photoCredit: SampleCredit = {
  name: "Photo by Janko Ferlic",
  url: "https://commons.wikimedia.org/wiki/File:White_Ceramic_Mug_Filled_With_Coffee_Beside_Coffee_Beans_(43087322071).jpg",
  license: "CC0",
  licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
};

export const templateSamples: Record<string, TemplateSample> = {
  ...generatedSamples,
  "cut-a-product-out-of-its-background": {
    inputImage: "/templates/samples/coffee.jpg",
    image: "/templates/samples/cutout.webp",
    caption: "Background removed. Edges softened. Product detail stays sharp.",
    credit: photoCredit,
  },
  "put-a-product-on-a-studio-backdrop": {
    inputImage: "/templates/samples/coffee.jpg",
    image: "/templates/samples/backdrop.webp",
    caption: "Same coffee photo. New studio setting.",
    credit: photoCredit,
  },
  "take-a-product-shot-to-print-resolution": {
    inputImage: "/templates/samples/coffee.jpg",
    image: "/templates/samples/print.webp",
    caption: "Upscaled and lightly sharpened for print.",
    credit: photoCredit,
  },
  "localise-a-script-and-revoice-it": {
    audio: "/templates/samples/revoice.mp3",
    caption: "An English coffee-shop script, translated into Spanish and voiced with even volume and clean fades.",
  },
  "score-a-silent-clip": {
    video: "/templates/samples/scored.mp4",
    poster: "/templates/samples/scored-poster.webp",
    caption: "Eight seconds of latte-making footage, with a generated score trimmed and faded to fit.",
    credit: {
      name: "Footage by Stevenndori289; trimmed and scored",
      url: "https://commons.wikimedia.org/wiki/File:Latte_Coffee_making.webm",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    },
  },
  "ai-spokesperson": {
    video: "/templates/samples/spokesperson.mp4",
    poster: "/templates/samples/spokesperson-poster.webp",
    caption: "A generated presenter, revoiced with a coffee-shop script. Audio is levelled and faded before lip-sync.",
  },
};
