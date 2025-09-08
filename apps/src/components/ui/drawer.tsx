import { Drawer as ChakraDrawer, Portal } from "@chakra-ui/react";
import * as React from "react";
import { useTheme } from "next-themes";
import { CloseButton } from "./close-button";

export interface DrawerContentProps extends ChakraDrawer.ContentProps {
  portalled?: boolean;
  portalRef?: React.RefObject<HTMLElement>;
  className?: string;
}

export const DrawerContent = React.forwardRef<
  HTMLDivElement,
  DrawerContentProps
>(function DrawerContent(props, ref) {
  const { portalled = true, portalRef, className, ...rest } = props;
  const { resolvedTheme } = useTheme();
  const currentTheme = resolvedTheme || "light";

  return (
    <Portal disabled={!portalled} container={portalRef}>
      <ChakraDrawer.Backdrop className="drawer-backdrop" />
      <ChakraDrawer.Positioner className="drawer-positioner">
        <ChakraDrawer.Content
          ref={ref}
          className={className ? `drawer-root ${className}` : "drawer-root"}
          bg="drawerBg"
          borderColor="border"
          color="text"
          {...rest}
        />
      </ChakraDrawer.Positioner>
    </Portal>
  );
});

export const DrawerCloseTrigger = React.forwardRef<
  HTMLButtonElement,
  ChakraDrawer.CloseTriggerProps
>(function DrawerCloseTrigger(props, ref) {
  return (
    <ChakraDrawer.CloseTrigger
      position="absolute"
      top="1"
      insetEnd="1"
      {...props}
      asChild
      ref={ref}
    >
      <CloseButton size="sm" />
    </ChakraDrawer.CloseTrigger>
  );
});

export const DrawerTitle = ChakraDrawer.Title;
export const DrawerDescription = ChakraDrawer.Description;
export const DrawerFooter = ChakraDrawer.Footer;
export const DrawerHeader = ChakraDrawer.Header;
export const DrawerRoot = ChakraDrawer.Root;
export const DrawerBody = ChakraDrawer.Body;
export const DrawerTrigger = ChakraDrawer.Trigger;
