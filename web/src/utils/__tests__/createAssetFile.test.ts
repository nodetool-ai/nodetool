import { createAssetFile } from '../createAssetFile';

describe('createAssetFile', () => {
  it('creates a file for single image output', async () => {
    const data = { 0: 1, 1: 2 };
    const [result] = createAssetFile({ type: 'image', data }, 'abc');

    expect(result.filename).toBe('preview_abc.png');
    expect(result.type).toBe('image/png');
    expect(result.file.name).toBe('preview_abc.png');
    expect(result.file.type).toBe('image/png');
    expect(result.file).toBeInstanceOf(File);
    expect(result.file.size).toBeGreaterThan(0);
  });

  it('creates multiple files when given an array of outputs', () => {
    const outputs = [
      { type: 'text', data: 'hello' },
      { type: 'audio', data: { 0: 1 } }
    ];

    const results = createAssetFile(outputs, 'id');
    expect(results).toHaveLength(2);
    expect(results[0].filename).toBe('preview_id_0.txt');
    expect(results[1].filename).toBe('preview_id_1.mp3');
  });

  it('converts dataframes to CSV files', async () => {
    const output = {
      type: 'dataframe',
      data: {
        columns: [{ name: 'a' }, { name: 'b' }],
        data: [ [1, 2], [3, 4] ]
      }
    };
    const [result] = createAssetFile(output, 'id');
    expect(result.filename).toBe('preview_id.csv');
    expect(result.type).toBe('text/csv');
    expect(result.file).toBeInstanceOf(File);
    expect(result.file.name).toBe('preview_id.csv');
  });

  it('handles unknown types as plain text', async () => {
    const output = { foo: 'bar' } as any;
    const [result] = createAssetFile(output, 'test');
    expect(result.filename).toBe('preview_test.txt');
    expect(result.type).toBe('text/plain');
    expect(result.file).toBeInstanceOf(File);
  });
});
