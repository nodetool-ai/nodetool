/** Keeps rasterized ImageBitmaps alive until the compositor has consumed a frame. */
export class BitmapFrameScope {
  private releases = new Map<ImageBitmap, () => void>();
  private released = false;

  pin(bitmap: ImageBitmap, releasePin: () => void): boolean {
    if (this.released) throw new Error("Cannot pin a bitmap to a released frame");
    if (this.releases.has(bitmap)) return false;
    this.releases.set(bitmap, releasePin);
    return true;
  }

  release(): void {
    if (this.released) return;
    this.released = true;
    for (const releasePin of this.releases.values()) releasePin();
    this.releases.clear();
  }
}

export const bitmapByteSize = (bitmap: ImageBitmap): number =>
  bitmap.width * bitmap.height * 4;
