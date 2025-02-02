import { Dialog as ChakraDialog, Portal } from "@chakra-ui/react";
import { CloseButton } from "./close-button";
import * as React from "react";
import { useTheme } from "next-themes";

interface DialogContentProps extends ChakraDialog.ContentProps {
  portalled?: boolean;
  portalRef?: React.RefObject<HTMLElement>;
  className?: string;
}

export const DialogContent = React.forwardRef<
  HTMLDivElement,
  DialogContentProps
>(function DialogContent(props, ref) {
  const { children, portalled = true, portalRef, className, ...rest } = props;
  const { resolvedTheme } = useTheme();
  const currentTheme = resolvedTheme || "light";

  return (
    <Portal disabled={!portalled} container={portalRef}>
      <ChakraDialog.Backdrop className="dialog-backdrop" />
      <ChakraDialog.Positioner className="dialog-positioner">
        <ChakraDialog.Content
          ref={ref}
          className={className ? `dialog-root ${className}` : "dialog-root"}
          bg="dialogBg"
          borderColor="border"
          color="text"
          {...rest}
        >
          {children}
        </ChakraDialog.Content>
      </ChakraDialog.Positioner>
    </Portal>
  );
});

export const DialogCloseTrigger = React.forwardRef<
  HTMLButtonElement,
  ChakraDialog.CloseTriggerProps
>(function DialogCloseTrigger(props, ref) {
  return (
    <ChakraDialog.CloseTrigger
      position="absolute"
      top="1"
      insetEnd="1"
      {...props}
      asChild
      ref={ref}
    >
      <CloseButton size="sm" />
    </ChakraDialog.CloseTrigger>
  );
});

export const DialogRoot = ChakraDialog.Root;
export const DialogFooter = ChakraDialog.Footer;
export const DialogHeader = ChakraDialog.Header;
export const DialogBody = ChakraDialog.Body;
export const DialogBackdrop = ChakraDialog.Backdrop;
export const DialogTitle = ChakraDialog.Title;
export const DialogDescription = ChakraDialog.Description;
export const DialogTrigger = ChakraDialog.Trigger;
export const DialogActionTrigger = ChakraDialog.ActionTrigger;
