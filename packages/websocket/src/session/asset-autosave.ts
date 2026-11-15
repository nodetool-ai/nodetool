// Auto-save writes each output as a file in the run's project folder. Loading
// the server's folder resolution installs the resolver asset services reach it
// through, so every module that saves outputs has it.
import "../lib/workflow-workspace.js";

export * from "@nodetool-ai/project-services/asset-autosave";
