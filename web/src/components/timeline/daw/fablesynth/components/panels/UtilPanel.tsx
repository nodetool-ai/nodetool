import { Knob } from '../Knob';
import { Stepper } from '../Stepper';
import { PowerButton } from '../PowerButton';

export function UtilPanel() {
  return (
    <section className="panel panel-util" style={{ gridArea: 'util' }}>
      <div className="util-block">
        <div className="panel-head">
          <span className="ph-power"><PowerButton paramId="sub.on" /></span>
          <h2>SUB</h2>
          <span className="ph-stepper"><Stepper paramId="sub.shape" /></span>
        </div>
        <div className="util-knobs">
          <Knob paramId="sub.oct" size="sm" accent="n" />
          <Knob paramId="sub.level" size="sm" accent="n" />
        </div>
      </div>
      <div className="util-block">
        <div className="panel-head">
          <span className="ph-power"><PowerButton paramId="noise.on" /></span>
          <h2>NOISE</h2>
          <span className="ph-stepper"><Stepper paramId="noise.type" /></span>
        </div>
        <div className="util-knobs">
          <Knob paramId="noise.level" size="sm" accent="n" />
        </div>
      </div>
    </section>
  );
}
