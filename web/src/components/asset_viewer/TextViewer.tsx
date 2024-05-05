import React, { useEffect, useState } from "react";
import { Asset } from "../../stores/ApiTypes";
import axios from "axios";
import { devError } from "../../utils/DevLog";

interface TextViewerProps {
  asset?: Asset;
  url?: string;
}

/**
 * TextViewer component, used to display a text viewer for a given asset.
 */
const TextViewer: React.FC<TextViewerProps> = ({ asset, url }) => {
  const [document, setDocument] = useState<string | null>(null);
  useEffect(() => {
    if (!asset?.get_url) return;
    axios
      .get(asset?.get_url, {
        responseType: "arraybuffer"
        // headers: { Range: "bytes=0-1000000" }
      })
      .then((response) => {
        const data = new TextDecoder().decode(new Uint8Array(response.data));
        setDocument(data);
      })
      .catch(devError);
  }, [asset?.get_url]);

  return (
    <div className="text-viewer">
      <pre>{document}</pre>
    </div>
  );
};

export default TextViewer;
