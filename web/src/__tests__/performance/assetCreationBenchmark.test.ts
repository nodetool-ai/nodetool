
import { describe, it, expect } from '@jest/globals';

// Mock types
interface AssetFileResult {
  file: File;
  filename: string;
  type: string;
}

// Simulation parameters
const FILE_COUNT = 10;
const API_DELAY_MS = 50;

// Mock functions
const mockCreateAssetFile = async (count: number): Promise<AssetFileResult[]> => {
  return Array.from({ length: count }, (_, i) => ({
    file: new File(['content'], `file${i}.txt`, { type: 'text/plain' }),
    filename: `file${i}.txt`,
    type: 'text/plain'
  }));
};

const mockCreateAsset = async (_file: File): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, API_DELAY_MS));
};

describe('Asset Creation Performance Benchmark', () => {
  it('should demonstrate that parallel execution is faster than sequential', async () => {
    // Setup
    const assetFiles = await mockCreateAssetFile(FILE_COUNT);

    // Measure Sequential (Current Implementation)
    const startSequential = performance.now();
    for (const { file } of assetFiles) {
      await mockCreateAsset(file);
    }
    const endSequential = performance.now();
    const durationSequential = endSequential - startSequential;

    console.log(`[PERF] Sequential execution (${FILE_COUNT} files): ${durationSequential.toFixed(2)}ms`);

    // Measure Parallel (Optimized Implementation)
    const startParallel = performance.now();
    await Promise.all(assetFiles.map(({ file }) => mockCreateAsset(file)));
    const endParallel = performance.now();
    const durationParallel = endParallel - startParallel;

    console.log(`[PERF] Parallel execution (${FILE_COUNT} files): ${durationParallel.toFixed(2)}ms`);

    // Assertions
    // Sequential should take roughly FILE_COUNT * API_DELAY_MS
    expect(durationSequential).toBeGreaterThan(FILE_COUNT * API_DELAY_MS * 0.9);

    // Parallel should take roughly API_DELAY_MS
    expect(durationParallel).toBeLessThan(durationSequential / 2); // Expect at least 2x speedup (conservatively)
    expect(durationParallel).toBeLessThan(API_DELAY_MS * 3); // Allow some overhead

    const speedup = durationSequential / durationParallel;
    console.log(`[PERF] Speedup: ${speedup.toFixed(2)}x`);
  });
});
