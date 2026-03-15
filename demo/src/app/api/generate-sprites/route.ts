import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured" },
      { status: 500 }
    );
  }

  try {
    const body = (await request.json()) as {
      description: string;
      animation: string;
      style: string;
      frames: number;
    };

    const { description, animation, style, frames } = body;

    if (!description?.trim()) {
      return NextResponse.json(
        { error: "Description is required" },
        { status: 400 }
      );
    }

    const cols = frames <= 4 ? frames : Math.ceil(frames / 2);
    const rows = frames <= 4 ? 1 : 2;
    const gridDesc = `${cols}x${rows} grid`;

    const prompt = [
      `A ${gridDesc} spritesheet of a ${description}.`,
      `${style} style.`,
      `${animation} animation cycle with ${frames} frames.`,
      `Each cell shows one frame of the animation in sequence.`,
      `Consistent character across all frames.`,
      `Transparent or solid color background per cell.`,
      `The grid should be perfectly aligned with equal-sized cells.`,
      `No text, no labels, no borders between cells.`,
    ].join(" ");

    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt,
        n: 1,
        size: "1024x1024",
        quality: "medium",
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      return NextResponse.json(
        { error: err?.error?.message ?? "Image generation failed" },
        { status: res.status }
      );
    }

    const data = await res.json();
    const b64 = data?.data?.[0]?.b64_json;

    if (!b64) {
      return NextResponse.json(
        { error: "No image returned from API" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      image: `data:image/png;base64,${b64}`,
      cols,
      rows,
      frames,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate-sprites] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
