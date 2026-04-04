import type { ModuleConfig } from "../types.js";

export const config: ModuleConfig = {
  configs: {
    "bria/fibo-edit/edit/structured_instruction": {
      className: "BriaFiboEditEditStructured_instruction",
      docstring:
        "Structured Instructions Generation endpoint for Fibo Edit, Bria's newest editing model.",
      tags: ["text", "analysis", "json", "extraction"],
      useCases: [
        "Text analysis to structured data",
        "Content extraction",
        "Data structuring",
        "Information extraction",
        "Text classification"
      ]
    },
    "bria/fibo-lite/generate/structured_prompt": {
      className: "BriaFiboLiteGenerateStructured_prompt",
      docstring:
        "Structured Prompt Generation endpoint for Fibo-Lite, Bria's SOTA Open source model",
      tags: ["text", "analysis", "json", "extraction"],
      useCases: [
        "Text analysis to structured data",
        "Content extraction",
        "Data structuring",
        "Information extraction",
        "Text classification"
      ]
    },
    "bria/fibo-lite/generate/structured_prompt/lite": {
      className: "BriaFiboLiteGenerateStructured_promptLite",
      docstring:
        "Structured Prompt Generation endpoint for Fibo-Lite, Bria's SOTA Open source model",
      tags: ["text", "analysis", "json", "extraction"],
      useCases: [
        "Text analysis to structured data",
        "Content extraction",
        "Data structuring",
        "Information extraction",
        "Text classification"
      ]
    },
    "bria/fibo/generate/structured_prompt": {
      className: "BriaFiboGenerateStructured_prompt",
      docstring:
        "Structured Prompt Generation endpoint for Fibo, Bria's SOTA Open source model",
      tags: ["text", "analysis", "json", "extraction"],
      useCases: [
        "Text analysis to structured data",
        "Content extraction",
        "Data structuring",
        "Information extraction",
        "Text classification"
      ]
    }
  }
};
