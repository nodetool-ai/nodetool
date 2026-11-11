// Both hosts call the unchanged timeline drawText implementation with these
// authored styles. This fixture also isolates a shadow cast by off-clip text.
export function shadowFixture(createCanvas, drawText, kind) {
  const width =
      kind === "authored" || kind === "outlined" || kind === "struck"
        ? 128
        : 256,
    height =
      kind === "authored" || kind === "outlined" || kind === "struck"
        ? 96
        : 192;
  const canvas = createCanvas(width, height),
    ctx = canvas.getContext("2d");
  if (kind === "authored" || kind === "outlined" || kind === "struck") {
    drawText(
      ctx,
      {
        text: "Timeline",
        fontFamily: "Inter",
        fontSizePx: 20,
        color: "#ffffff",
        ...(kind === "struck" ? { strikethrough: true } : {}),
        ...(kind === "outlined"
          ? { stroke: { color: "#00ff00", widthPx: 2 } }
          : {}),
        shadow: { color: "#000000", blurPx: 2, offsetX: 1, offsetY: 1 }
      },
      width,
      height
    );
  } else {
    ctx.fillStyle = "#204060";
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    if (kind === "transformed") {
      ctx.setTransform(1.1, 0.1, -0.05, 1, 3, -5);
    }
    ctx.beginPath();
    ctx.rect(0, 135, width, 57);
    ctx.clip();
    ctx.globalAlpha = kind === "alpha" ? 0.5 : 1;
    drawText(
      ctx,
      {
        text: "H",
        fontFamily: "Inter",
        fontSizePx: 100,
        color: "#ffffff",
        shadow: {
          color: kind === "alpha" ? "rgba(255,0,0,0.75)" : "#ff0000",
          blurPx: 2,
          offsetX: 0,
          offsetY: 70
        }
      },
      width,
      height
    );
    ctx.restore();
  }
  return { data: ctx.getImageData(0, 0, width, height).data, width, height };
}
export function shadowBounds(image, background = false) {
  const { data, width, height } = image;
  let left = width,
    top = height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const drawn = background ? data[i] > 34 : data[i + 3] > 16;
      if (drawn) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }
  return [left, top, right, bottom];
}
