import { useSeqStore } from '../../seq/store';

// EDIT mode shows either the selected pad's sound panels or the FX rack.
export function PadEditTabs() {
  const fx = useSeqStore((s) => s.drumFxOpen);
  const scope = useSeqStore((s) => s.drumFxScope);
  const { openDrumFx, closeDrumFx } = useSeqStore.getState();
  return (
    <div className="dr-fx-scope dr-edit-tabs" role="tablist" aria-label="DR-1 editor">
      <button type="button" role="tab" aria-selected={!fx} className={fx ? '' : 'active'} onClick={closeDrumFx}>PAD EDIT</button>
      <button type="button" role="tab" aria-selected={fx} className={fx ? 'active' : ''} onClick={() => openDrumFx(scope)}>FX</button>
    </div>
  );
}
