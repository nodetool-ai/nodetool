import { UnifiedModel } from "../stores/ApiTypes";


export const llama_models: UnifiedModel[] = [
  {
    id: "llama3.1:8b",
    name: "Llama 3.1 - 8B",
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
    id: "phi3:mini",
    name: "phi3 - 3B",
    type: "llama_model"
  }
];
