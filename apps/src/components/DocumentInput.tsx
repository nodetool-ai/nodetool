import { Box, Text } from "@chakra-ui/react";
import { HStack } from "@chakra-ui/react";
import {
  FileUploadRoot,
  FileUploadTrigger,
  FileUploadDropzone,
  FileUploadList,
} from "./ui/file-upload";
import { Button } from "./ui/button";
import { HiUpload } from "react-icons/hi";
import React, { useCallback, useState } from "react";
import { LuX } from "react-icons/lu";

interface DocumentRef {
  type: "document";
  data: Uint8Array;
  filename: string;
}

interface DocumentInputProps {
  onChange: (file: DocumentRef | null) => void;
  className?: string;
}

const DocumentInput = ({ onChange, className }: DocumentInputProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const handleFileChange = useCallback(
    (changes: any) => {
      const selectedFile = changes.acceptedFiles[0] || null;
      setFile(selectedFile);

      // Clear previous PDF URL if it exists
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
        setPdfUrl(null);
      }

      if (selectedFile) {
        // Create URL for PDF preview if file is PDF
        if (selectedFile.type === "application/pdf") {
          setPdfUrl(URL.createObjectURL(selectedFile));
        }

        const reader = new FileReader();
        reader.onload = () => {
          const arrayBuffer = reader.result as ArrayBuffer;
          onChange({
            type: "document",
            data: new Uint8Array(arrayBuffer),
            filename: selectedFile.name,
          });
        };
        reader.readAsArrayBuffer(selectedFile);
      } else {
        onChange(null);
      }
    },
    [onChange, pdfUrl]
  );

  const handleClear = useCallback(() => {
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
    }
    setFile(null);
    onChange(null);
  }, [onChange, pdfUrl]);

  return (
    <Box
      className={
        className ? `document-input-root ${className}` : "document-input-root"
      }
      width="100%"
    >
      <FileUploadRoot onFileChange={handleFileChange} maxFiles={1} width="100%">
        <HStack width="100%">
          <FileUploadTrigger>
            <Button size="sm" variant="ghost" colorScheme="gray">
              <HiUpload />
            </Button>
          </FileUploadTrigger>
          <FileUploadList />
          {!file && <FileUploadDropzone label="Drop your document here" />}
        </HStack>
      </FileUploadRoot>

      {pdfUrl && (
        <Box mt={4} position="relative">
          <Button
            size="sm"
            position="absolute"
            top={2}
            right={2}
            onClick={handleClear}
            variant="ghost"
            colorScheme="gray"
          >
            <LuX />
          </Button>
          <iframe
            src={pdfUrl}
            width="100%"
            height="500px"
            style={{ border: "1px solid #E2E8F0" }}
          />
        </Box>
      )}
    </Box>
  );
};

export default DocumentInput;
