import { DrivePanel } from './DrivePanel';
import { ChorusPanel } from './ChorusPanel';
import type { FxPanelAdapter } from './fxAdapter';

export function FxPanel({ adapter }: { adapter: FxPanelAdapter }) {
  return (
    <>
      <DrivePanel adapter={adapter} />
      <ChorusPanel adapter={adapter} />
    </>
  );
}
