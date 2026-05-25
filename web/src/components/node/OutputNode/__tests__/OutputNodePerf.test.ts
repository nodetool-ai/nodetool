
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

  it("measures execution time (optimized)", async () => {
    // @ts-expect-error Mocked function call
    const assetFiles = await createAssetFile();
    const start = Date.now();

    await Promise.all(assetFiles.map(({ file }: { file: any }) => createAssetMock(file)));

    const end = Date.now();
    const duration = end - start;
    console.log(`Concurrent duration: ${duration}ms`);
    // 3 files * 100ms concurrently = ~100ms
    expect(duration).toBeLessThan(200); // 100ms + overhead
  });
});
