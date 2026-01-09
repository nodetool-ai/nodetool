/// <reference types="vite-plugin-svgr/client" />
import React, { useEffect, useRef, useState } from "react";
import Any from "../icons/enum.svg?react";
import AssistantIcon from "../icons/assistant.svg?react";

type SvgComponentType = React.FunctionComponent<
  React.SVGProps<SVGSVGElement> & { title?: string }
>;

// Static imports for icons that have dynamic import issues
const staticIconMap: Record<string, SvgComponentType> = {
  assistant: AssistantIcon
};

export function useDynamicSvgImport(iconName: string) {
  // Use static import if available, otherwise default to Any
  const getInitialIcon = (name: string): SvgComponentType => {
    return staticIconMap[name] || Any;
  };

  const importedIconRef = useRef<SvgComponentType>(getInitialIcon(iconName));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // If we have a static import for this icon, use it and skip dynamic import
    if (staticIconMap[iconName]) {
      importedIconRef.current = staticIconMap[iconName];
      setLoading(false);
      return;
    }

    // Try dynamic import for other icons
    setLoading(true);
    const importSvgIcon = async (): Promise<void> => {
      try {
        const iconModule = await import(
          /* @vite-ignore */ `../icons/${iconName}.svg?react`
        );

        const icon = (iconModule.default ||
          iconModule.ReactComponent) as SvgComponentType;

        if (icon) {
          importedIconRef.current = icon;
        }
      } catch (_err) {
        // Fallback to default icon on error
        console.warn(`Failed to load icon ${iconName}, using fallback`);
      } finally {
        setLoading(false);
      }
    };

    importSvgIcon();
  }, [iconName]);

  return { loading, SvgIcon: importedIconRef.current };
}
