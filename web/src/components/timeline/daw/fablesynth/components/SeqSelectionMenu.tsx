// Floating action bar for a step-range selection (WT-1 / BL-1): CUT / COPY /
// DUP / DEL / dismiss, centered over the selected columns inside the
// (relative) grid so it scrolls with them. Verbs come from the host store via props.

interface SeqSelectionMenuProps {
  /** First/last selected column as *visible* grid indices (bar offset included). */
  visibleLo: number;
  visibleHi: number;
  totalSteps: number;
  onCut: () => void;
  onCopy: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDismiss: () => void;
}

export function SeqSelectionMenu({ visibleLo, visibleHi, totalSteps, onCut, onCopy, onDuplicate, onDelete, onDismiss }: SeqSelectionMenuProps) {
  const center = ((visibleLo + visibleHi + 1) / 2 / totalSteps) * 100;
  const left = Math.max(10, Math.min(90, center));
  return (
    <div className="seq-selmenu" style={{ left: `${left}%` }} role="toolbar" aria-label="Selection actions">
      <button type="button" onClick={onCut}>CUT</button>
      <button type="button" onClick={onCopy}>COPY</button>
      <button type="button" onClick={onDuplicate}>DUP</button>
      <button type="button" onClick={onDelete}>DEL</button>
      <button type="button" className="seq-selmenu-x" aria-label="Clear selection" onClick={onDismiss}>✕</button>
    </div>
  );
}
