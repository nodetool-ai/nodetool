// LED power toggle for bool params.

import { useStore } from '../store';

interface PowerButtonProps {
  paramId: string;
}

export function PowerButton({ paramId }: PowerButtonProps) {
  const value = useStore((s) => s.params[paramId]);
  const setParam = useStore((s) => s.setParam);
  const on = !!value;
  return (
    <button
      className={`power-btn${on ? ' on' : ''}`}
      aria-label="power"
      onClick={() => setParam(paramId, on ? 0 : 1)}
    />
  );
}
