// The WT-1 editor's handle on its track's live device. The device belongs to
// the timeline's audio graph and can appear, change or go away while the
// editor is open; the link is stable, so displays subscribe once and follow
// whatever device is attached. It implements the FX panels' telemetry engine.

import type { Wt1Device, Wt1ModMessage, Wt1VizMessage } from '../../devices/wt1Device';
import type { FxTelemetryEngine } from '../components/panels/fxAdapter';
import type { DynamicsMessage } from './dynamics';
import type { EchoMessage } from './echo';
import type { ReverbMessage } from './reverb';
import type { GeneratedTable } from './wavetables';

type Unsubscribe = () => void;
type Kind = 'dynamics' | 'echo' | 'reverb' | 'viz' | 'mod';

interface Subscription {
  kind: Kind;
  listener: (message: never) => void;
  detach: Unsubscribe | null;
}

export class Wt1EngineLink implements FxTelemetryEngine {
  private device: Wt1Device | null = null;
  private readonly subs = new Set<Subscription>();
  private readonly changeListeners = new Set<() => void>();
  private detachDispose: Unsubscribe | null = null;

  /** The attached device, or null while none is running. */
  get current(): Wt1Device | null {
    return this.device;
  }

  get ctx(): BaseAudioContext | null {
    return this.device?.context ?? null;
  }

  get scopeAnalyser(): AnalyserNode | null {
    return this.device?.scopeAnalyser ?? null;
  }

  get specAnalyser(): AnalyserNode | null {
    return this.device?.specAnalyser ?? null;
  }

  attach(device: Wt1Device | null): void {
    if (device === this.device) return;
    for (const sub of this.subs) {
      sub.detach?.();
      sub.detach = null;
    }
    this.detachDispose?.();
    this.detachDispose = null;
    this.device = device && !device.isDisposed ? device : null;
    if (this.device) {
      for (const sub of this.subs) sub.detach = this.bind(sub);
      this.detachDispose = this.device.onDispose(() => this.attach(null));
    }
    this.changeListeners.forEach((listener) => listener());
  }

  /** Called whenever a device is attached or detached. */
  onChange(listener: () => void): Unsubscribe {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  setParam(id: string, value: number): void {
    this.device?.setParam(id, value);
  }

  applyParams(params: Record<string, number>): void {
    this.device?.applyParams(params);
  }

  setUserTables(tables: readonly GeneratedTable[]): void {
    this.device?.setUserTables(tables);
  }

  /** Velocity 0..1, as the on-screen keyboard and the preset audition send it. */
  noteOn(note: number, velocity = 1): void {
    const device = this.device;
    if (!device) return;
    const ctx = device.context;
    if (typeof AudioContext !== 'undefined' && ctx instanceof AudioContext && ctx.state === 'suspended') void ctx.resume();
    device.noteOn(note, Math.max(1, Math.round(velocity * 127)));
  }

  noteOff(note: number): void {
    this.device?.noteOff(note);
  }

  bend(semitones: number): void {
    this.device?.bend(semitones);
  }

  panic(): void {
    this.device?.panic();
  }

  subscribeDynamics(listener: (message: DynamicsMessage) => void): Unsubscribe {
    return this.subscribe('dynamics', listener);
  }

  subscribeEcho(listener: (message: EchoMessage) => void): Unsubscribe {
    return this.subscribe('echo', listener);
  }

  subscribeReverb(listener: (message: ReverbMessage) => void): Unsubscribe {
    return this.subscribe('reverb', listener);
  }

  subscribeViz(listener: (message: Wt1VizMessage) => void): Unsubscribe {
    return this.subscribe('viz', listener);
  }

  subscribeMod(listener: (message: Wt1ModMessage) => void): Unsubscribe {
    return this.subscribe('mod', listener);
  }

  private subscribe(kind: Kind, listener: (message: never) => void): Unsubscribe {
    const sub: Subscription = { kind, listener, detach: null };
    this.subs.add(sub);
    sub.detach = this.bind(sub);
    return () => {
      sub.detach?.();
      this.subs.delete(sub);
    };
  }

  private bind(sub: Subscription): Unsubscribe | null {
    const device = this.device;
    if (!device) return null;
    switch (sub.kind) {
      case 'dynamics': return device.subscribeDynamics(sub.listener as (m: DynamicsMessage) => void);
      case 'echo': return device.subscribeEcho(sub.listener as (m: EchoMessage) => void);
      case 'reverb': return device.subscribeReverb(sub.listener as (m: ReverbMessage) => void);
      case 'viz': return device.onViz(sub.listener as (m: Wt1VizMessage) => void);
      case 'mod': return device.onMod(sub.listener as (m: Wt1ModMessage) => void);
    }
  }
}
