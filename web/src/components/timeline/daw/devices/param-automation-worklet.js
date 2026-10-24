// Timeline automation for the FableSynth processors: per-parameter ramps on
// the context clock, applied once per render quantum through each processor's
// own `p` (or `params`) path. Load this module before the processor modules;
// a processor without it on the global scope simply plays without automation.
//
// Messages, read by `onMsg` before the processor's own handling:
//   { t: 'pauto', lanes: [{ k, ev }], clear? }  `ev` is a Float64Array of
//       [frame, value] pairs in time order; the value ramps linearly between
//       pairs and holds before the first and after the last. An empty or
//       missing `ev` drops that lane. `clear` drops every lane first.
//   { t: 'pauto-sync', n }  replies { t: 'pauto-ack', n }, so the host knows
//       every message it posted before has arrived (an offline render waits
//       for it before it starts).

class FableParamAutomation {
  constructor() {
    // key -> { ev, i, last }
    this.lanes = new Map();
  }

  onMsg(d, port) {
    if (!d) return false;
    if (d.t === 'pauto') {
      if (d.clear) this.lanes.clear();
      const list = Array.isArray(d.lanes) ? d.lanes : [];
      for (const lane of list) {
        if (typeof lane.k !== 'string') continue;
        const ev = lane.ev;
        if (!ev || ev.length < 2) this.lanes.delete(lane.k);
        else this.lanes.set(lane.k, { ev, i: 0, last: NaN });
      }
      return true;
    }
    if (d.t === 'pauto-sync') {
      port.postMessage({ t: 'pauto-ack', n: d.n });
      return true;
    }
    return false;
  }

  // Call `set(key, value)` for every lane whose value at `frame` differs from
  // the one it last sent. Frames only move forward between messages.
  tick(frame, set) {
    for (const [key, lane] of this.lanes) {
      const ev = lane.ev;
      const n = ev.length >> 1;
      while (lane.i + 1 < n && ev[(lane.i + 1) * 2] <= frame) lane.i++;
      const f0 = ev[lane.i * 2];
      const v0 = ev[lane.i * 2 + 1];
      let v = v0;
      if (frame > f0 && lane.i + 1 < n) {
        const f1 = ev[(lane.i + 1) * 2];
        const v1 = ev[(lane.i + 1) * 2 + 1];
        v = f1 > f0 ? v0 + (v1 - v0) * ((frame - f0) / (f1 - f0)) : v1;
      }
      if (Number.isFinite(v) && v !== lane.last) {
        lane.last = v;
        set(key, v);
      }
    }
  }
}

globalThis.FableParamAutomation = FableParamAutomation;
