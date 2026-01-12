# Zustand Store Type Inference

**Problem**: TypeScript can't infer store types properly.

**Solution**: Define state interface before store:
```typescript
interface MyStoreState {
  items: Item[];
  addItem: (item: Item) => void;
}

const useMyStore = create<MyStoreState>((set) => ({
  items: [],
  addItem: (item) => set((state) => ({ 
    items: [...state.items, item] 
  }))
}));
```

**Files**: `web/src/stores/*`

**Date**: 2026-01-10
