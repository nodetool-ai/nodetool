# Bundle Code Splitting

**Issue**: Main bundle was 12.77 MB (3.8 MB gzipped) with no code splitting, causing slow initial load times.

**Solution**: Added manual chunking to vite.config.ts to split heavy dependencies into separate chunks:

```typescript
rollupOptions: {
  output: {
    manualChunks: {
      'vendor-react': ['react', 'react-dom', 'react-router-dom'],
      'vendor-mui': ['@mui/material', '@mui/icons-material', '@emotion/react', '@emotion/styled'],
      'vendor-plotly': ['react-plotly.js'],
      'vendor-three': ['three', '@react-three/fiber', '@react-three/drei'],
      'vendor-editor': ['@monaco-editor/react', 'lexical'],
      'vendor-pdf': ['react-pdf'],
      'vendor-waveform': ['wavesurfer.js'],
    }
  }
}
```

**Impact**: 
- Main bundle reduced from 12.77 MB to 5.74 MB (**55% reduction**)
- Gzipped size reduced from 3.8 MB to 1.7 MB (**55% reduction**)
- Heavy libraries now load on-demand and can be cached independently

**Files**: `web/vite.config.ts`

**Date**: 2026-01-12
