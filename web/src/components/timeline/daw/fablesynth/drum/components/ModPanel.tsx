import { DMOD_DESTS, DMOD_SOURCES, DRUM_PARAMS, pad } from '../params';
import { useDrumStore } from '../store';
import { DrumKnob } from './DrumKnob';

interface ModRowProps {
  sel: number;
  route: 1 | 2 | 3 | 4;
}

function ModRow({ sel, route }: ModRowProps) {
  const sourceId = pad(sel, `mod${route}.src`);
  const destinationId = pad(sel, `mod${route}.dst`);
  const amountId = pad(sel, `mod${route}.amt`);
  const source = useDrumStore((s) => s.params[sourceId]);
  const destination = useDrumStore((s) => s.params[destinationId]);
  const setParam = useDrumStore((s) => s.setParam);

  return (
    <div className="dr-mod-row">
      <select
        className="mod-select"
        value={source}
        aria-label={`Mod ${route} source`}
        onChange={(event) => setParam(sourceId, Number(event.target.value))}
      >
        {DMOD_SOURCES.map((name, index) => <option key={name} value={index}>{name}</option>)}
      </select>
      <span className="dr-mod-arrow" aria-hidden="true">▸</span>
      <select
        className="mod-select"
        value={destination}
        aria-label={`Mod ${route} destination`}
        onChange={(event) => setParam(destinationId, Number(event.target.value))}
      >
        {DMOD_DESTS.map((name, index) => <option key={name} value={index}>{name}</option>)}
      </select>
      <DrumKnob paramId={amountId} size="xs" label="" />
    </div>
  );
}

const ROUTES: Array<1 | 2 | 3 | 4> = [1, 2, 3, 4];

export function ModPanel() {
  const sel = useDrumStore((s) => s.sel);
  const decayId = pad(sel, 'modenv.dec');
  const decay = useDrumStore((s) => s.params[decayId]);
  const decayText = DRUM_PARAMS[decayId].fmt?.(decay).toUpperCase() ?? String(decay);
  const params = useDrumStore((s) => s.params);
  const noRoutesAssigned = ROUTES.every((route) => params[pad(sel, `mod${route}.src`)] === 0);

  return (
    <section className="panel dr-edit-panel dr-mod-panel">
      <div className="panel-head dr-mod-head">
        <h2>MOD</h2>
        <div className="dr-mod-env">
          <span className="panel-hint">MOD ENV DEC {decayText}</span>
          <DrumKnob paramId={decayId} size="xs" label="" />
        </div>
      </div>
      {noRoutesAssigned && <div className="dr-mod-hint">ROUTE A SOURCE TO ANY PAD PARAM</div>}
      <div className="dr-mod-routes">
        <ModRow sel={sel} route={1} />
        <ModRow sel={sel} route={2} />
        <ModRow sel={sel} route={3} />
        <ModRow sel={sel} route={4} />
      </div>
    </section>
  );
}
