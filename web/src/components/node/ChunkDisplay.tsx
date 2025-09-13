/** @jsxImportSource @emotion/react */
import { useEffect, useRef } from "react";
import MarkdownRenderer from "../../utils/MarkdownRenderer";
import { Button } from "@mui/material";

interface ChunkDisplayProps {
  chunk: string;
}

const ChunkDisplay: React.FC<ChunkDisplayProps> = ({ chunk }) => {
  const chunkRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chunkRef.current) {
      chunkRef.current.scrollTop = chunkRef.current.scrollHeight;
    }
  }, [chunk]);

  const scrollAmount = 50;

  const scrollUp = () => {
    if (chunkRef.current) {
      chunkRef.current.scrollTop -= scrollAmount;
    }
  };

  const scrollDown = () => {
    if (chunkRef.current) {
      chunkRef.current.scrollTop += scrollAmount;
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "flex-start" }}>
      <div
        className="node-chunk"
        ref={chunkRef}
        style={{
          overflowY: "scroll",
          maxHeight: "200px",
          flexGrow: 1,
          marginRight: "8px"
        }}
      >
        <MarkdownRenderer content={chunk} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <Button size="small" onClick={scrollUp}>
          ↑
        </Button>
        <Button size="small" onClick={scrollDown}>
          ↓
        </Button>
      </div>
    </div>
  );
};

export default ChunkDisplay;
