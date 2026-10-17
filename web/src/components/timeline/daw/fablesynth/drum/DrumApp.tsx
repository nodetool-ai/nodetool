import { useEffect, useState } from 'react';
import { WebAgentPanel } from '../agent/WebAgentPanel';
import { makeDrumAgentHost } from '../agent/drumAgentHost';
import { DrumAutomation } from './components/DrumAutomation';
import { DrumDeviceBody } from './components/DrumDeviceBody';
import { DrumPowerOverlay } from './components/DrumPowerOverlay';
import { Header } from './components/Header';
import { useDrumKeys } from './hooks/useDrumKeys';
import { useDrumMidi } from './hooks/useDrumMidi';
import { drumEngine, useDrumStore } from './store';

export function DrumApp() {
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentHost] = useState(makeDrumAgentHost);
  useDrumKeys();
  useDrumMidi();

  // exposed for debugging / automated verification
  useEffect(() => {
    (window as unknown as { __fableDr: unknown }).__fableDr = {
      engine: drumEngine,
      store: useDrumStore,
    };
  }, []);

  return (
    <>
      <DrumPowerOverlay />
      {agentOpen && <WebAgentPanel host={agentHost} plugin="DR-1" onClose={() => setAgentOpen(false)} />}
      <main id="drum-rack">
        <Header />
        <DrumDeviceBody />
        <DrumAutomation />
      </main>
      <button className="web-agent-launcher" onClick={() => setAgentOpen(true)}>AGENT</button>
    </>
  );
}
