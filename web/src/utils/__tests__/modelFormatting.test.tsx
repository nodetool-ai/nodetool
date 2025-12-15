/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom/jest-globals";
import { describe, it, expect } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import React from "react";
import {
  formatBytes,
  getShortModelName,
  groupModelsByType,
  prettifyModelType,
  sortModelTypes
} from "../modelFormatting";
import type { UnifiedModel } from "../../stores/ApiTypes";

describe("prettifyModelType", () => {
  it("returns plain text for the 'All' type", () => {
    expect(prettifyModelType("All")).toBe("All");
  });

  it("renders Ollama specific information for llama_model", () => {
    render(<>{prettifyModelType("llama_model")}</>);

    expect(screen.getByText("Ollama")).toBeInTheDocument();
    expect(screen.getByAltText("Ollama")).toBeInTheDocument();
  });

  it("renders icon and label for llama_cpp", () => {
    const { container } = render(<>{prettifyModelType("llama_cpp")}</>);

    expect(screen.getByText("Llama cpp")).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("formats hugging face model types with branding", () => {
    render(<>{prettifyModelType("hf.text_to_image")}</>);

    expect(screen.getByAltText("Hugging Face")).toBeInTheDocument();
    expect(screen.getByText("Text To Image")).toBeInTheDocument();
  });

  it("falls back to default branding for unknown model types", () => {
    render(<>{prettifyModelType("custom_model")}</>);

    expect(screen.getByAltText("Model")).toBeInTheDocument();
    expect(screen.getByText("Custom Model")).toBeInTheDocument();
  });
});

describe("getShortModelName", () => {
  it("returns empty string when full name is undefined", () => {
    expect(getShortModelName(undefined)).toBe("");
  });

  it("extracts the last path segment when slashes are present", () => {
    expect(getShortModelName("owner/model-name")).toBe("model-name");
  });

  it("returns the name unchanged when there are no slashes", () => {
    expect(getShortModelName("model-name")).toBe("model-name");
  });
});

describe("formatBytes", () => {
  it("returns empty string for invalid inputs", () => {
    expect(formatBytes(undefined)).toBe("");
    expect(formatBytes(NaN)).toBe("");
  });

  it("formats zero bytes", () => {
    expect(formatBytes(0)).toBe("0 Bytes");
  });

  it("converts bytes into larger units with two decimal precision", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5 MB");
  });
});

describe("groupModelsByType", () => {
  it("groups models by their type with fallback", () => {
    const models: UnifiedModel[] = [
      { id: "1", type: "llama_model" } as unknown as UnifiedModel,
      { id: "2", type: "hf.text_to_image" } as unknown as UnifiedModel,
      { id: "3" } as unknown as UnifiedModel
    ];

    const grouped = groupModelsByType(models);

    expect(grouped["llama_model"]).toHaveLength(1);
    expect(grouped["hf.text_to_image"]).toHaveLength(1);
    expect(grouped.Other).toHaveLength(1);
  });
});

describe("sortModelTypes", () => {
  it("orders model types by priority and alphabetically within the same priority", () => {
    const types = [
      "custom", "llama_cpp", "Other", "llama_model", "All", "mlx", "zeta"
    ];

    const sorted = sortModelTypes([...types]);

    expect(sorted).toEqual([
      "All",
      "llama_cpp",
      "llama_model",
      "mlx",
      "Other",
      "custom",
      "zeta"
    ]);
  });
});
