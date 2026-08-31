const perf = require('perf_hooks');

const state = {
    clips: Array.from({ length: 50000 }, (_, i) => ({
        id: `clip_${i}`,
        linkId: i < 5 ? `link_${i}` : undefined,
    }))
};

const selectedIds = new Set(['clip_0', 'clip_1', 'clip_2']);

const t0 = perf.performance.now();

// Original implementation
for (let i = 0; i < 100; i++) {
    const affectedLinkIds = new Set(['link_0', 'link_1', 'link_2']);
    let clips = state.clips.filter((c) => !selectedIds.has(c.id));

    if (affectedLinkIds.size > 0) {
      const linkCounts = new Map();
      for (const c of clips) {
        if (c.linkId !== undefined && affectedLinkIds.has(c.linkId)) {
          linkCounts.set(c.linkId, (linkCounts.get(c.linkId) ?? 0) + 1);
        }
      }
      clips = clips.map((c) => {
        if (
          c.linkId !== undefined &&
          affectedLinkIds.has(c.linkId) &&
          (linkCounts.get(c.linkId) ?? 0) < 2
        ) {
          return { ...c, linkId: undefined };
        }
        return c;
      });
    }
}
const t1 = perf.performance.now();

// Optimized implementation 3
for (let i = 0; i < 100; i++) {
    const affectedLinkIds = new Set(['link_0', 'link_1', 'link_2']);
    let clips = state.clips.filter((c) => !selectedIds.has(c.id));

    if (affectedLinkIds.size > 0) {
      const linkCounts = new Map();
      const lastSeenLinkIndex = new Map();

      for (let j = 0; j < clips.length; j++) {
        const linkId = clips[j].linkId;
        if (linkId !== undefined && affectedLinkIds.has(linkId)) {
          const count = (linkCounts.get(linkId) ?? 0) + 1;
          linkCounts.set(linkId, count);
          if (count === 1) {
            lastSeenLinkIndex.set(linkId, j);
          } else if (count === 2) {
            lastSeenLinkIndex.delete(linkId); // We have at least 2, don't need to unlink
          }
        }
      }

      for (const idx of lastSeenLinkIndex.values()) {
        clips[idx] = { ...clips[idx], linkId: undefined };
      }
    }
}
const t2 = perf.performance.now();

console.log(`Original: ${t1 - t0}ms`);
console.log(`Optimized: ${t2 - t1}ms`);

