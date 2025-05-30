import * as Binary from '../binary';
const { uint8ArrayToBase64, uint8ArrayToDataUri } = Binary;

describe('binary utilities', () => {
  it('converts Uint8Array to base64', () => {
    const arr = new Uint8Array([72, 101, 108, 108, 111]);
    expect(uint8ArrayToBase64(arr)).toBe('SGVsbG8=');
  });

  it('creates data URI from Uint8Array', () => {
    const arr = new Uint8Array([72, 101, 108, 108, 111]);
    expect(uint8ArrayToDataUri(arr, 'text/plain')).toBe('data:text/plain;base64,SGVsbG8=');
  });

  it('throws when base64 conversion fails', () => {
    const originalBtoa = global.btoa;
    (global as any).btoa = () => { throw new Error('fail'); };
    expect(() => uint8ArrayToBase64(new Uint8Array([1]))).toThrow('Failed to convert Uint8Array to Base64');
    global.btoa = originalBtoa;
  });

  it('throws when data uri creation fails', () => {
    const originalBtoa = global.btoa;
    (global as any).btoa = () => { throw new Error('fail'); };
    expect(() => uint8ArrayToDataUri(new Uint8Array([1]), 'text/plain')).toThrow('Failed to create data URI');
    global.btoa = originalBtoa;
  });
});
