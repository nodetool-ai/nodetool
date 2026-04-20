#!/usr/bin/env tsx
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { AkiClient } from "@aki-io/aki-io";
import type { EndpointDetails } from "@aki-io/aki-io";

interface ManifestEntry {
  endpointId: string;
  title: string;
  outputType: string;
  supportedTasks?: string[];
  paramNames?: Record<string, string>;
}

function outputTypeFromDetails(endpointId: string, details: EndpointDetails | Record<string, unknown>): string {
  const record = details as Partial<EndpointDetails>;
  const category = typeof record.category === "string" ? record.category.toLowerCase() : "";
  if (category.includes("image")) {return "image";}
  if (category.includes("video")) {return "video";}
  if (category.includes("audio")) {return "audio";}
  if (category.includes("text") || category.includes("chat")) {return "text";}

  const outputs = record.parameter_description?.output ?? {};
  for (const [name, desc] of Object.entries(outputs)) {
    const key = name.toLowerCase();
    const type = String(desc?.type ?? "").toLowerCase();
    if (key.includes("image") || type.includes("image")) {return "image";}
    if (key.includes("video") || type.includes("video")) {return "video";}
    if (key.includes("audio") || type.includes("audio")) {return "audio";}
    if (key.includes("text") || type.includes("text")) {return "text";}
  }

  const normalized = endpointId.trim().toLowerCase();
  if (/(^|[_-])(img|image|txt2img|text2img|img2img)$/.test(normalized)) {
    return "image";
  }
  return "text";
}

function inferParamNames(
  details: EndpointDetails | Record<string, unknown>
): Record<string, string> | undefined {
  const inputs = (details as Partial<EndpointDetails>).parameter_description?.input ?? {};
  const keys = new Set(Object.keys(inputs).map((key) => key.toLowerCase()));
  const paramNames: Record<string, string> = {};

  if (!keys.has("prompt_input") && keys.has("prompt")) {
    paramNames.prompt_input = "prompt";
  }
  if (!keys.has("negative_prompt") && keys.has("negativeprompt")) {
    paramNames.negative_prompt = "negativePrompt";
  }
  if (!keys.has("num_inference_steps") && keys.has("steps")) {
    paramNames.num_inference_steps = "steps";
  }
  if (!keys.has("guidance_scale") && keys.has("guidance")) {
    paramNames.guidance_scale = "guidance";
  }

  return Object.keys(paramNames).length > 0 ? paramNames : undefined;
}

function supportedTasksFromDetails(
  endpointId: string,
  outputType: string,
  details: EndpointDetails | Record<string, unknown>
): string[] | undefined {
  if (outputType !== "image") {
    return undefined;
  }

  const inputs = (details as Partial<EndpointDetails>).parameter_description?.input ?? {};
  const inputKeys = Object.keys(inputs).map((key) => key.toLowerCase());
  const tasks = new Set<string>();

  if (
    inputKeys.includes("prompt_input") ||
    inputKeys.includes("chat_context") ||
    inputKeys.some((key) => key.includes("prompt"))
  ) {
    tasks.add("text_to_image");
  }
  if (inputKeys.includes("image") || inputKeys.includes("images")) {
    tasks.add("image_to_image");
  }

  const normalized = endpointId.trim().toLowerCase();
  if (tasks.size === 0) {
    if (normalized.includes("img2img")) {
      tasks.add("image_to_image");
    } else {
      tasks.add("text_to_image");
    }
  }

  return [...tasks];
}

async function main() {
  const apiKey = process.env["AKI_API_KEY"];
  if (!apiKey) {
    throw new Error("AKI_API_KEY is required to generate the AKI manifest");
  }

  const client = new AkiClient({
    endpointName: "llama3_chat",
    apiKey,
    raiseExceptions: false
  });

  const endpoints = await client.getEndpointList();
  const manifest: ManifestEntry[] = [];

  for (const endpointId of endpoints) {
    if (typeof endpointId !== "string" || endpointId.trim().length === 0) {
      continue;
    }

    const details = await client.getEndpointDetails(endpointId);
    const outputType = outputTypeFromDetails(endpointId, details);

    manifest.push({
      endpointId,
      title:
        typeof (details as Partial<EndpointDetails>).title === "string"
          ? (details as Partial<EndpointDetails>).title!
          : endpointId,
      outputType,
      supportedTasks: supportedTasksFromDetails(endpointId, outputType, details),
      paramNames: inferParamNames(details)
    });
  }

  manifest.sort((a, b) => a.endpointId.localeCompare(b.endpointId));

  const outputPath = join(process.cwd(), "packages", "runtime", "src", "providers", "aki-manifest.json");
  writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Wrote ${manifest.length} AKI manifest entries to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
