// Play/stop glyphs as SVG: text glyphs (▶ ■) sit on font metrics and land off
// centre. The triangle is placed so its centroid (x = 6), not its box,
// sits on the button centre.
export function TransportGlyph({ kind, size = 10 }: { kind: 'play' | 'stop'; size?: number }) {
  return (
    <svg className="sq-glyph" width={size} height={size} viewBox="0 0 12 12" aria-hidden="true">
      {kind === 'play' ? <path d="M3.33 1.5 L11.33 6 L3.33 10.5 Z" fill="currentColor" /> : <rect x="2" y="2" width="8" height="8" rx="1" fill="currentColor" />}
    </svg>
  );
}
