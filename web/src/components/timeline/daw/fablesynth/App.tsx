import { WtDeviceBody } from './components/WtDeviceBody';
import { useEffect, useState } from 'react';
import { WebAgentPanel } from './agent/WebAgentPanel';
import { makeWtAgentHost } from './agent/wtAgentHost';
import { PowerOverlay } from './components/PowerOverlay';
import { WavetableEditor } from './components/WavetableEditor';
import { TopBar } from './components/panels/TopBar';
import { KeyboardBar } from './components/panels/KeyboardBar';
import { useComputerKeys } from './hooks/useComputerKeys';
import { useSeqEditKeys } from './hooks/useSeqEditKeys';
import { useMidi } from './hooks/useMidi';
import { engine, useStore } from './store';

export function App() {
  const [agentOpen, setAgentOpen] = useState(false);
  const agentHost = useState(makeWtAgentHost)[0];
  useComputerKeys();
  useSeqEditKeys();
  useMidi();

  // exposed for debugging / automated verification
  useEffect(() => {
    (window as unknown as { __fable: unknown }).__fable = {
      engine,
      store: useStore,
      applyPreset: useStore.getState().applyPreset,
    };
  }, []);

  return (
    <>
      <PowerOverlay />
      {agentOpen && <WebAgentPanel host={agentHost} plugin="WT-1" onClose={() => setAgentOpen(false)} />}
      <WavetableEditor />
      <main id="rack">
        <TopBar />
        <WtDeviceBody />
        <KeyboardBar />
      </main>
      <button className="web-agent-launcher" onClick={() => setAgentOpen(true)}>AGENT</button>
    </>
  );
}
