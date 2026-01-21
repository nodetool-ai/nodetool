# Model Select Component Type Improvements

**Problem**: Several model select components used `any` type for onChange callback and value props, reducing type safety.

**Solution**: Replaced `any` types with specific model types:

1. **LanguageModelSelect.tsx**: Changed `onChange: (value: any)` to `onChange: (value: LanguageModel)`
2. **ImageModelSelect.tsx**: Changed `onChange: (value: any)` to `onChange: (value: ImageModel)`
3. **TTSModelSelect.tsx**: Changed `onChange: (value: any)` and `value: any` to `onChange: (value: TTSModel)` and `value: string | TTSModel`
4. **InferenceProviderModelSelect.tsx**: Created `InferenceProviderModelValue` interface with specific properties (`type`, `provider`, `model_id`) and used it for both `onChange` callback and `value` prop

**Files**:
- web/src/components/properties/LanguageModelSelect.tsx
- web/src/components/properties/ImageModelSelect.tsx
- web/src/components/properties/TTSModelSelect.tsx
- web/src/components/properties/InferenceProviderModelSelect.tsx

**Date**: 2026-01-21
