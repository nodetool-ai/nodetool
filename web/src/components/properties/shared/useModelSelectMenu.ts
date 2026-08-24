import {
  useCallback,
  useRef,
  useState,
  type MouseEvent,
  type RefObject
} from "react";
import type { Provider } from "@nodetool-ai/protocol";
import useModelPreferencesStore from "../../../stores/ModelPreferencesStore";

interface SelectableModel {
  id: string;
  name: string;
  provider: Provider;
}

interface ModelSelection<T extends string> {
  type: T;
  id: string;
  provider: Provider;
  name: string;
}

interface ModelSelectMenu {
  anchorEl: HTMLElement | null;
  buttonRef: RefObject<HTMLButtonElement | null>;
  handleClick: (event: MouseEvent<HTMLElement>) => void;
  handleClose: () => void;
  handleSelect: (model: SelectableModel) => void;
}

// Pickers whose value carries more than `{type, id, provider, name}` — the
// image `path`, the TTS voice list — keep their own select handler.
const useModelSelectMenu = <T extends string>(
  modelType: T,
  onChange: (value: ModelSelection<T>) => void
): ModelSelectMenu => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const addRecent = useModelPreferencesStore((s) => s.addRecent);

  const handleClick = useCallback((event: MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const handleSelect = useCallback(
    (model: SelectableModel) => {
      onChange({
        type: modelType,
        id: model.id,
        provider: model.provider,
        name: model.name || ""
      });
      addRecent({
        provider: model.provider || "",
        id: model.id || "",
        name: model.name || ""
      });
      setAnchorEl(null);
    },
    [modelType, onChange, addRecent]
  );

  return { anchorEl, buttonRef, handleClick, handleClose, handleSelect };
};

export default useModelSelectMenu;
