/// <reference types="vite-plugin-svgr/client" />
import React, { useEffect, useRef, useState } from "react";
import Any from "../icons/enum.svg?react";

type SvgComponentType = React.FunctionComponent<
  React.SVGProps<SVGSVGElement> & { title?: string }
>;

export function useDynamicSvgImport(iconName: string) {
  const importedIconRef = useRef<SvgComponentType>(Any);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const importSvgIcon = async (): Promise<void> => {
      try {
        const iconModule = await import(
          /* @vite-ignore */ `../icons/${iconName}.svg?react`
        );
        const icon = (iconModule.default ||
          iconModule.ReactComponent) as SvgComponentType;
        importedIconRef.current = icon;
      } catch (err) {
        // console.error(err);
      } finally {
        setLoading(false);
      }
    };

    importSvgIcon();
  }, [iconName]);

  return { loading, SvgIcon: importedIconRef.current };
}
