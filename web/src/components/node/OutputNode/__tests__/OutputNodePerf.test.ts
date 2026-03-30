
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { createAssetFile } from '../../../../utils/createAssetFile';

// Mock createAssetFile just to return something we can iterate over
jest.mock('../../../../utils/createAssetFile', () => ({
  createAssetFile: jest.fn(() => Promise.resolve([
    { file: "file1" },
    { file: "file2" },
    { file: "file3" },
  ])),
}));

describe("OutputNode Asset Creation Performance", () => {
  const createAssetMock = jest.fn();

  beforeEach(() => {
    createAssetMock.mockReset();
    // Simulate network delay of 100ms
    createAssetMock.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));
  });

  it("measures sequential execution time (baseline)", async () => {
    // @ts-expect-error Mocked function call
    const assetFiles = await createAssetFile();
    const start = Date.now();

    for (const { file } of assetFiles) {
      await createAssetMock(file);
    }

    const end = Date.now();
    const duration = end - start;
    console.log(`Sequential duration: ${duration}ms`);
    // 3 files * 100ms = ~300ms
    expect(duration).toBeGreaterThanOrEqual(290); // slightly less than 300 for margin
  });

  it("measures concurrent execution time (optimized)", async () => {
    // @ts-expect-error Mocked function call
    const assetFiles = await createAssetFile();
    const start = Date.now();

    // The optimization we plan to implement
    await Promise.all(assetFiles.map(({ file }: { file: any }) => createAssetMock(file)));

    const end = Date.now();
    const duration = end - start;
    console.log(`Concurrent duration: ${duration}ms`);
    // Should be around 100ms + overhead
    expect(duration).toBeLessThan(200);
  });
});
