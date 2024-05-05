import { useState, useEffect } from "react";

const useKeyPressedListener = (key: string) => {
  const [keyPressed, setKeyPressed] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      switch (key.toLowerCase()) {
        case "shift":
          setKeyPressed(event.shiftKey);
          break;
        case "control":
          setKeyPressed(event.ctrlKey);
          break;
        case "alt":
          setKeyPressed(event.altKey);
          break;
        case "meta":
          setKeyPressed(event.metaKey);
          break;
        case " ":
          setKeyPressed(event.key === " ");
          break;
        default:
          setKeyPressed(event.key.toLowerCase() === key.toLowerCase());
          break;
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      switch (key.toLowerCase()) {
        case "shift":
          setKeyPressed(event.shiftKey);
          break;
        case "control":
          setKeyPressed(event.ctrlKey);
          break;
        case "alt":
          setKeyPressed(event.altKey);
          break;
        case "meta":
          setKeyPressed(event.metaKey);
          break;
        case " ":
          if (event.key === " ") {
            setKeyPressed(false);
          }
          break;
        default:
          if (event.key.toLowerCase() === key.toLowerCase()) {
            setKeyPressed(false);
          }
          break;
      }
    };

    const handleBlur = () => {
      setKeyPressed(false);
    };

    const handleFocus = () => {
      setKeyPressed(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);

    // Cleanup
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
    };
  }, [key]);

  return keyPressed;
};

export default useKeyPressedListener;
