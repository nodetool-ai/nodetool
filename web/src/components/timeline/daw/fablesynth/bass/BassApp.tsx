import { useEffect, useState } from 'react';
import { WebAgentPanel } from '../agent/WebAgentPanel';
import { makeBassAgentHost } from '../agent/bassAgentHost';
import { BassDeviceBody } from './components/BassDeviceBody';
import { BassPowerOverlay } from './components/BassPowerOverlay';
import { Header } from './components/Header';
import { useBassKeys } from './hooks/useBassKeys';
import { useBassMidi } from './hooks/useBassMidi';
import { bassEngine, useBassStore } from './store';

export function BassApp() {
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentHost] = useState(makeBassAgentHost);
  useBassKeys();
  useBassMidi();

  // exposed for debugging / automated verification
  useEffect(() => {
    (window as unknown as { __fableBl: unknown }).__fableBl = {
      engine: bassEngine,
      store: useBassStore,
    };
  }, []);

  return (
    <>
      <BassPowerOverlay />
      {agentOpen && <WebAgentPanel host={agentHost} plugin="BL-1" onClose={() => setAgentOpen(false)} />}
      <main id="bass-rack">
        <Header />
        <BassDeviceBody />
      </main>
      <button className="web-agent-launcher" onClick={() => setAgentOpen(true)}>AGENT</button>
    </>
  );
}
