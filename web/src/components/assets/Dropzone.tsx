import { DropZone } from "../ui_primitives";

const rootSx = {
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minHeight: 0,
  overflow: "hidden",
  height: "100%",
  position: "relative"
} as const;

interface DropzoneProps {
  onDrop: (files: File[]) => void;
  children?: React.ReactNode;
}

const Dropzone: React.FC<DropzoneProps> = (props) => {
  return (
    <DropZone
      overlay
      className="dropzone"
      onFilesDrop={props.onDrop}
      leaveDelayMs={50}
      sx={rootSx}
    >
      {/* Upload button moved into the toolbar; keep drag-and-drop active here */}
      {props.children}
    </DropZone>
  );
};

export default Dropzone;
