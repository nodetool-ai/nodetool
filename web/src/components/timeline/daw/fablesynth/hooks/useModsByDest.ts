// Subscribe to the active modulation routes pointing at one destination. Each
// returned route carries its absolute slot number (1..16) so the on-control mod
// rings can write straight back to that slot via updateSlot / clearSlot.

import { useMemo } from 'react';
import { useStore } from '../store';
import { getModsByDest, type ActiveRoute } from '../store/slotHelpers';

export function useModsByDest(dest: number | undefined): ActiveRoute[] {
  const params = useStore((s) => s.params);
  return useMemo(() => (dest ? getModsByDest(params, dest) : []), [params, dest]);
}
