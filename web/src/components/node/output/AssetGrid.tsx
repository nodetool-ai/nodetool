import React from "react";
import { AssetRef } from "../../../stores/ApiTypes";
import PreviewImageGrid from "../PreviewImageGrid";

type Props = {
  values: AssetRef[];
  onOpenIndex: (index: number) => void;
};

export const AssetGrid: React.FC<Props> = ({ values, onOpenIndex }) => {
  const images = values
    .filter((item) => item && (item as any).type === "image")
    .map((item) =>
      (item as any).uri
        ? ((item as any).uri as string)
        : ((item as any).data as unknown as Uint8Array)
    );
  return <PreviewImageGrid images={images} onDoubleClick={onOpenIndex} />;
};
