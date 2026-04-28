import { SUPPORTED_MODEL_TYPES, GENERIC_HF_TYPES } from './packages/huggingface/src/hf-models.js';
console.log(SUPPORTED_MODEL_TYPES.filter(m => !GENERIC_HF_TYPES.has(m.toLowerCase())));
