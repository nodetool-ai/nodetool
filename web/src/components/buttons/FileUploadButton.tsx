import { useRef, useCallback, ChangeEvent } from "react";
import { Button, Typography, Tooltip } from "@mui/material";
import FileUploadIcon from "@mui/icons-material/FileUpload";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

export type FileUploadButtonProps = {
  onFileChange: (files: File[]) => void;
};

const FileUploadButton = (props: FileUploadButtonProps): JSX.Element => {
  const theme = useTheme();
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
      <Tooltip
        enterDelay={TOOLTIP_ENTER_DELAY}
        title={
          <>
            <Typography
              variant="h4"
              style={{ fontSize: theme.fontSizeBig, paddingLeft: ".5em" }}
            >
              Add assets
            </Typography>
            <ul
              style={{
                width: "100%",
                margin: "0",
                padding: ".5em .5em .5em 2em",
                color: theme.vars.palette.grey[0],
                display: "block"
              }}
            >
              <li>Click to select files</li>
              <li>Drop any file from a file explorer in the assets area</li>
            </ul>
          </>
        }
      >
        <Button
          className="upload-file"
          variant="outlined"
          tabIndex={-1}
          onClick={handleClick}
        >
          <FileUploadIcon />
          Upload Files
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
