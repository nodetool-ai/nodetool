import { useCallback, useEffect, useMemo } from 'react';
import {
  registerComboCallback,
  unregisterComboCallback
} from '../stores/KeyPressedStore';
import useGlobalChatStore from '../stores/GlobalChatStore';
import { isMac } from '../utils/platform';

const ControlOrMeta = isMac() ? "Meta" : "Control";

export const useChatShortcuts = (active: boolean = true) => {
  const undo = useGlobalChatStore((state) => state.undo);
  const redo = useGlobalChatStore((state) => state.redo);

  const handleUndo = useCallback(() => {
    undo();
  }, [undo]);

  const handleRedo = useCallback(() => {
    redo();
  }, [redo]);

  const undoCombo = useMemo(() => [ControlOrMeta, "z"].sort().join("+"), []);
  const redoCombo = useMemo(() => [ControlOrMeta, "Shift", "z"].sort().join("+"), []);

  useEffect(() => {
    if (active) {
      registerComboCallback(undoCombo, {
        callback: handleUndo,
        preventDefault: true,
        active
      });

      registerComboCallback(redoCombo, {
        callback: handleRedo,
        preventDefault: true,
        active
      });

      return () => {
        unregisterComboCallback(undoCombo);
        unregisterComboCallback(redoCombo);
      };
    }
  }, [active, undoCombo, redoCombo, handleUndo, handleRedo]);
};

export default useChatShortcuts;
