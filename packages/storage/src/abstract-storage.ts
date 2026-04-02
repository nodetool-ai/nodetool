export interface AbstractStorage {
  upload(
    key: string,
    data: Buffer | Uint8Array,
    contentType?: string
  ): Promise<void>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  getUrl(key: string): string;
  exists(key: string): Promise<boolean>;
}
