#!/usr/bin/env python3
"""Generate the original camera feeds and score for the T minus 30 example."""

import math
import shutil
import subprocess
import tempfile
import wave
from array import array
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFilter
except ModuleNotFoundError as exc:
    raise SystemExit("Pillow is required to regenerate T minus 30 media") from exc


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "packages/base-nodes/nodetool/assets/nodetool-base/timelines/t-minus-30"
W, H, FPS = 640, 360, 30
INK = (5, 15, 25)
CYAN = (75, 218, 228)
AMBER = (255, 181, 96)


def ffmpeg_video(name, frames):
    proc = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
         "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-an", "-c:v", "libx264",
         "-preset", "medium", "-crf", "22", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
         str(OUT / f"{name}.mp4")],
        stdin=subprocess.PIPE,
    )
    try:
        for n in range(frames):
            proc.stdin.write(frame(name, n).tobytes())
    finally:
        proc.stdin.close()
    if proc.wait() != 0:
        raise RuntimeError(f"ffmpeg failed while encoding {name}")


def starfield(draw, t, horizon=270):
    for i in range(54):
        x = (i * 173 + 43) % W
        y = (i * 97 + 11) % horizon
        a = 90 + int(55 * (1 + math.sin(t * 1.7 + i * 1.9)) / 2)
        draw.point((x, y), fill=(a // 3, a // 2, a))


def pad(n):
    t = n / FPS
    im = Image.new("RGB", (W, H), INK)
    d = ImageDraw.Draw(im)
    for y in range(H):
        d.line((0, y, W, y), fill=(5 + y // 70, 15 + y // 35, 26 + y // 18))
    starfield(d, t)
    d.ellipse((-90, 225, 730, 460), fill=(12, 29, 37))
    for i in range(11):
        x = i * 72 - 15
        d.rectangle((x, 280 - (i % 3) * 8, x + 3, H), fill=(17, 45, 54))
    sway = math.sin(t * 0.7) * 1.5
    tower_x = int(388 + sway)
    d.rectangle((tower_x, 65, tower_x + 20, 307), fill=(30, 61, 68))
    for y in range(75, 300, 18):
        d.line((tower_x, y, tower_x + 20, y + 18), fill=(52, 93, 96), width=2)
        d.line((tower_x + 20, y, tower_x, y + 18), fill=(52, 93, 96), width=2)
    lift = max(0, (t - 23) * 38)
    cx = int(319 + sway * 0.4)
    base = int(290 - lift)
    if t > 21:
        glow = Image.new("RGBA", (W, H))
        gd = ImageDraw.Draw(glow)
        spread = int(12 + min(1, (t - 21) / 2) * 48)
        gd.ellipse((cx - spread, base - 12, cx + spread, base + 105), fill=(255, 126, 40, 110))
        glow = glow.filter(ImageFilter.GaussianBlur(28))
        im = Image.alpha_composite(im.convert("RGBA"), glow).convert("RGB")
        d = ImageDraw.Draw(im)
        for i in range(14):
            sx = cx + int(math.sin(i * 13 + t * 8) * (12 + i * 3))
            sy = base + 12 + i * 9
            d.ellipse((sx - 4, sy - 4, sx + 5, sy + 5), fill=(255, 129 + i * 4, 67))
    d.polygon([(cx, base - 170), (cx - 13, base - 142), (cx - 14, base - 17),
               (cx - 28, base + 1), (cx + 28, base + 1), (cx + 14, base - 17),
               (cx + 13, base - 142)], fill=(202, 220, 221))
    d.rectangle((cx - 14, base - 86, cx + 14, base - 78), fill=CYAN)
    d.polygon([(cx - 28, base + 1), (cx - 8, base - 21), (cx - 8, base + 1)], fill=(112, 150, 158))
    d.polygon([(cx + 28, base + 1), (cx + 8, base - 21), (cx + 8, base + 1)], fill=(112, 150, 158))
    if t > 21:
        flame = 12 + int(20 * (0.5 + 0.5 * math.sin(t * 40)))
        d.polygon([(cx - 11, base + 2), (cx, base + flame + 20), (cx + 11, base + 2)], fill=AMBER)
    for i in range(24):
        x = int((i * 101 + 83 + t * (9 + i % 4)) % 750) - 55
        y = 298 + (i * 13) % 66
        r = 18 + i % 5 * 4
        d.ellipse((x-r, y-r//2, x+r, y+r//2), fill=(24 + i % 3 * 3, 49, 56))
    return im


def control(n):
    t = n / FPS
    im = Image.new("RGB", (W, H), (6, 17, 27))
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, W, 220), fill=(10, 29, 42))
    for k in range(4):
        x = 30 + k * 150
        d.rounded_rectangle((x, 42, x+126, 156), radius=4, fill=(7, 42, 55), outline=(38, 101, 111), width=2)
        for j in range(3):
            y = 70 + j * 25
            d.line((x+10, y, x+112, y), fill=(31, 68, 78))
        points = [(x+10+i*6, 119-int(13*math.sin(i*.44+t*2+k))) for i in range(18)]
        d.line(points, fill=CYAN, width=2)
        d.rectangle((x+10, 52, x+36, 56), fill=AMBER if k == 2 and int(t*2)%5 == 4 else CYAN)
    d.polygon([(0, 360), (140, 218), (W-140, 218), (W, 360)], fill=(13, 37, 46))
    for i in range(5):
        x = 100+i*110
        d.rounded_rectangle((x, 232, x+75, 265), radius=3, fill=(16, 64, 73), outline=(47, 103, 106))
        d.line((x+10, 252, x+60, 252), fill=CYAN, width=2)
    # Silhouettes move subtly while the camera drifts.
    for i in range(3):
        x = int(160+i*155+math.sin(t*.6+i)*3)
        y = 205+(i%2)*14
        d.ellipse((x-17, y-13, x+17, y+20), fill=(3, 11, 20))
        d.polygon([(x-26, y+17), (x+26, y+17), (x+40, 360), (x-40, 360)], fill=(3, 11, 20))
        d.line((x-13, y+20, x+13, y+20), fill=(15, 57, 64), width=2)
    return im


def engine(n):
    t = n / FPS
    im = Image.new("RGB", (W, H), (5, 14, 22))
    d = ImageDraw.Draw(im)
    cx, cy = 320, 180
    for r in range(250, 20, -18):
        q = 1-r/270
        color = (int(12+q*37), int(35+q*45), int(45+q*43))
        d.ellipse((cx-r, cy-r, cx+r, cy+r), outline=color, width=8)
    for i in range(10):
        a = i*math.tau/10+t*.11
        d.line((cx+math.cos(a)*100, cy+math.sin(a)*100,
                cx+math.cos(a)*230, cy+math.sin(a)*230), fill=(36, 90, 95), width=8)
    pulse = 18 + int(7*math.sin(t*12))
    d.ellipse((cx-pulse,cy-pulse,cx+pulse,cy+pulse), fill=AMBER)
    d.ellipse((cx-7,cy-7,cx+7,cy+7), fill=(255, 241, 203))
    for i in range(30):
        a = i*2.4+t*3
        r = 35+(i*29+t*31)%210
        x, y = cx+math.cos(a)*r,cy+math.sin(a)*r
        d.ellipse((x-2,y-2,x+2,y+2), fill=AMBER)
    return im


def frame(name, n):
    return {"pad": pad, "control": control, "engine": engine}[name](n)


def score():
    rate, length = 24000, 30
    samples = array("h")
    voice = array("h", [0]) * (rate * length)
    with tempfile.TemporaryDirectory() as tmp:
        calls = ((0, "All stations, final check"),
                 (7, "Flight systems confirmed. Final camera checks"),
                 (12, "Ten"), (13, "Nine"), (14, "Eight"), (15, "Seven"),
                 (16, "Six"), (17, "Five"), (18, "Hold"), (20, "Fault cleared"),
                 (21, "Four"), (22, "Three"), (23, "Two"), (24, "One"),
                 (25, "Ignition"), (26, "Liftoff. Northstar is flying"))
        for index, (at, word) in enumerate(calls):
            source = Path(tmp) / f"{index}.aiff"
            subprocess.run(["say", "-v", "Alex", "-r", "220", "-o", str(source), word], check=True)
            pcm = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(source),
                                           "-f", "s16le", "-ac", "1", "-ar", str(rate), "-"])
            spoken = array("h")
            spoken.frombytes(pcm)
            start = int(at * rate)
            for j, value in enumerate(spoken):
                if start + j < len(voice):
                    voice[start + j] = int(value * .7)
    for i in range(rate * length):
        t = i / rate
        # The control room hum rises toward launch. Ticks count the final ten.
        hum = (math.sin(t*math.tau*55) + .34*math.sin(t*math.tau*82)) * (0.10 + .08*t/30)
        pulse = .12*math.sin(t*math.tau*110) * max(0, math.sin(math.pi*((t*2)%1))) if t > 7 else 0
        tick = 0
        if 12 <= t < 26 and not 18 <= t < 21 and t % 1 < .09:
            envelope = math.exp(-50*(t%1))
            tick = .48*envelope*math.sin(t*math.tau*960)
        alarm = .13*math.sin(t*math.tau*730) if 18 <= t < 20.5 and int(t*7)%2 == 0 else 0
        rumble = .25*math.sin(t*math.tau*(49+15*math.sin(t*4))) * min(1, (t-21)/3) if t > 21 else 0
        value = max(-1, min(1, hum + pulse + tick + alarm + rumble + voice[i] / 32768))
        samples.append(int(value*18000))
    with wave.open(str(OUT / "score.wav"), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(samples.tobytes())


def main():
    if not shutil.which("ffmpeg") or not shutil.which("say"):
        raise SystemExit("ffmpeg and macOS say are required to regenerate T minus 30 media")
    OUT.mkdir(parents=True, exist_ok=True)
    ffmpeg_video("control", 300)
    ffmpeg_video("engine", 300)
    ffmpeg_video("pad", 900)
    score()
    print(f"Wrote original media to {OUT}")


if __name__ == "__main__":
    main()
