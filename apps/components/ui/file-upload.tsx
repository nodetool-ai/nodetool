"use client";

import type { ButtonProps, RecipeProps } from "@chakra-ui/react";
import {
  Button,
  FileUpload as ChakraFileUpload,
  Icon,
  IconButton,
  Span,
  Text,
  useFileUploadContext,
  useRecipe,
  Box,
  VStack,
  HStack,
} from "@chakra-ui/react";
import * as React from "react";
import { LuFile, LuUpload, LuX } from "react-icons/lu";

export interface FileUploadRootProps extends ChakraFileUpload.RootProps {
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
  className?: string;
}

export const FileUploadRoot = React.forwardRef<
  HTMLInputElement,
  FileUploadRootProps
>(function FileUploadRoot(props, ref) {
  const { children, inputProps, className, ...rest } = props;
  return (
    <ChakraFileUpload.Root
      className={
        className ? `file-upload-root ${className}` : "file-upload-root"
      }
      {...rest}
    >
      <ChakraFileUpload.HiddenInput
        ref={ref}
        className="file-upload-input"
        {...inputProps}
      />
      {children}
    </ChakraFileUpload.Root>
  );
});

export interface FileUploadDropzoneProps
  extends ChakraFileUpload.DropzoneProps {
  label: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}

export const FileUploadDropzone = React.forwardRef<
  HTMLInputElement,
  FileUploadDropzoneProps
>(function FileUploadDropzone(props, ref) {
  const { children, label, description, className, ...rest } = props;
  return (
    <ChakraFileUpload.Dropzone
      ref={ref}
      className={
        className ? `file-upload-dropzone ${className}` : "file-upload-dropzone"
      }
      {...rest}
    >
      <VStack gap={2}>
        <Icon fontSize="xl" color="fg.muted">
          <LuUpload />
        </Icon>
        <ChakraFileUpload.DropzoneContent>
          <Box>{label}</Box>
          {description && (
            <Text color="fg.muted" className="file-upload-description">
              {description}
            </Text>
          )}
        </ChakraFileUpload.DropzoneContent>
        {children}
      </VStack>
    </ChakraFileUpload.Dropzone>
  );
});

interface VisibilityProps {
  showSize?: boolean;
  clearable?: boolean;
  className?: string;
}

interface FileUploadItemProps extends VisibilityProps {
  file: File;
}

const FileUploadItem = React.forwardRef<HTMLLIElement, FileUploadItemProps>(
  function FileUploadItem(props, ref) {
    const { file, showSize, clearable, className } = props;
    return (
      <ChakraFileUpload.Item
        file={file}
        ref={ref}
        className={
          className ? `file-upload-item ${className}` : "file-upload-item"
        }
      >
        <HStack gap={3} width="100%" align="center">
          <ChakraFileUpload.ItemPreview asChild>
            <Icon fontSize="lg" color="fg.muted">
              <LuFile />
            </Icon>
          </ChakraFileUpload.ItemPreview>

          {showSize ? (
            <ChakraFileUpload.ItemContent className="file-upload-content">
              <ChakraFileUpload.ItemName />
              <ChakraFileUpload.ItemSizeText />
            </ChakraFileUpload.ItemContent>
          ) : (
            <ChakraFileUpload.ItemName flex="1" className="file-upload-name" />
          )}

          {clearable && (
            <ChakraFileUpload.ItemDeleteTrigger asChild>
              <IconButton
                aria-label="Remove file"
                variant="ghost"
                color="fg.muted"
                size="xs"
                className="file-upload-delete"
              >
                <LuX />
              </IconButton>
            </ChakraFileUpload.ItemDeleteTrigger>
          )}
        </HStack>
      </ChakraFileUpload.Item>
    );
  }
);

interface FileUploadListProps
  extends VisibilityProps,
    ChakraFileUpload.ItemGroupProps {
  files?: File[];
}

export const FileUploadList = React.forwardRef<
  HTMLUListElement,
  FileUploadListProps
>(function FileUploadList(props, ref) {
  const { showSize, clearable, files, className, ...rest } = props;

  const fileUpload = useFileUploadContext();
  const acceptedFiles = files ?? fileUpload.acceptedFiles;

  if (acceptedFiles.length === 0) return null;

  return (
    <ChakraFileUpload.ItemGroup
      ref={ref}
      className={
        className ? `file-upload-list ${className}` : "file-upload-list"
      }
      {...rest}
    >
      {acceptedFiles.map((file) => (
        <FileUploadItem
          key={file.name}
          file={file}
          showSize={showSize}
          clearable={clearable}
        />
      ))}
    </ChakraFileUpload.ItemGroup>
  );
});

type Assign<T, U> = Omit<T, keyof U> & U;

interface FileInputProps extends Assign<ButtonProps, RecipeProps<"input">> {
  placeholder?: React.ReactNode;
  className?: string;
}

export const FileInput = React.forwardRef<HTMLButtonElement, FileInputProps>(
  function FileInput(props, ref) {
    const inputRecipe = useRecipe({ key: "input" });
    const [recipeProps, restProps] = inputRecipe.splitVariantProps(props);
    const { placeholder = "Select file(s)", className, ...rest } = restProps;

    return (
      <ChakraFileUpload.Trigger asChild>
        <Button
          unstyled
          py="0"
          ref={ref}
          className={className ? `file-input ${className}` : "file-input"}
          {...rest}
          css={[inputRecipe(recipeProps), props.css]}
        >
          <ChakraFileUpload.Context>
            {({ acceptedFiles }) => {
              if (acceptedFiles.length === 1) {
                return <span>{acceptedFiles[0].name}</span>;
              }
              if (acceptedFiles.length > 1) {
                return <span>{acceptedFiles.length} files</span>;
              }
              return <Span color="fg.subtle">{placeholder}</Span>;
            }}
          </ChakraFileUpload.Context>
        </Button>
      </ChakraFileUpload.Trigger>
    );
  }
);

export const FileUploadLabel = ChakraFileUpload.Label;
export const FileUploadClearTrigger = ChakraFileUpload.ClearTrigger;
export const FileUploadTrigger = ChakraFileUpload.Trigger;
