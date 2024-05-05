import { useRef, useCallback, ChangeEvent } from "react";
import { Button, Typography, Tooltip } from "@mui/material";
import FileUploadIcon from "@mui/icons-material/FileUpload";
import { TOOLTIP_DELAY } from "../../config/constants";

export type FileUploadButtonProps = {
  onFileChange: (files: File[]) => void;
};

const FileUploadButton = (props: FileUploadButtonProps): JSX.Element => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      props.onFileChange(files);
    },
    [props]
  );

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="file-upload-button">
      <Tooltip enterDelay={TOOLTIP_DELAY} title="Select files or drop here">
        <Button
          className="upload-file"
          variant="outlined"
          onClick={handleClick}
          style={{ display: "flex", alignItems: "center", gap: "0.5em" }}
        >
          <FileUploadIcon />
          <Typography
            variant="inherit"
            // style={{ position: "relative", }}
          >
            Upload
          </Typography>
        </Button>
      </Tooltip>
      <input
        ref={fileInputRef}
        onChange={handleFileUpload}
        type="file"
        hidden
        multiple={true}
      />
    </div>
  );
};

export default FileUploadButton;
