import { UnifiedModel } from "../stores/ApiTypes";


export const llama_models: UnifiedModel[] = [
  {
    id: "llama3.1:8b",
    name: "Llama 3.1 - 8B",
    type: "llama_model",
  },
  {
    id: "llava:7b",
    name: "Llava - 7B",
    type: "llama_model"
  },
  {
    id: "minicpm-v:8b",
    name: "MiniCPM-V - 8B",
    type: "llama_model"
  },
  {
    id: "gemma2:2b",
    name: "gemma2 - 2B",
    type: "llama_model"
  },
  {
    id: "qwen2:0.5b",
    name: "qwen2 - 0.5B",
    type: "llama_model"
  },
  {
    id: "qwen2:1.5b",
    name: "qwen2 - 1.5B",
    type: "llama_model"
  },
  {
    id: "qwen2:latest",
    name: "Qwen2",
    type: "llama_model"
  },
  {
    id: "phi3:mini",
    name: "phi3 - 3B",
    type: "llama_model"
  },
  {
    id: "mistral:latest",
    name: "mistral-nemo - 8B",
    type: "llama_model"
  },
  {
    id: "codegemma:latest",
    name: "coddegemma",
    type: "llama_model"
  },
  {
    id: "codegemma:2b",
    name: "codegemma - 2B",
    type: "llama_model"
  },
  {
    id: "all-minilm:22m",
    name: "all-minilm - 22M",
    type: "llama_model"
  },
  {
    id: "nomic-embed-text:latest",
    name: "nomic-embed-text",
    type: "llama_model"
  },
  {
    id: "mistral-nemo:8b",
    name: "mistral-nemo - 8B",
    type: "llama_model"
  }
];
