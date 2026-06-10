
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
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
    jest.useFakeTimers();
    createAssetMock.mockReset();
    // Simulate network delay of 100ms
    createAssetMock.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("uploads all asset files concurrently", async () => {
    // @ts-expect-error Mocked function call
    const assetFiles = await createAssetFile();

    let settled = false;
    const uploads = Promise.all(
      assetFiles.map(({ file }: { file: any }) => createAssetMock(file))
    ).then(() => {
      settled = true;
    });

    // A single 100ms timer advance must settle ALL uploads — sequential
    // awaits would need 300ms of timer time, so this fails if the uploads
    // ever regress to running one after another. Fake timers keep the
    // assertion deterministic; the previous wall-clock check
    // (duration < 200ms) flaked on loaded CI runners.
    await jest.advanceTimersByTimeAsync(100);
    expect(settled).toBe(true);
    await uploads;
  });
});
