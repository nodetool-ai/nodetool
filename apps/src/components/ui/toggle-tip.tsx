import { Popover as ChakraPopover, IconButton, Portal } from "@chakra-ui/react";
import * as React from "react";
import { HiOutlineInformationCircle } from "react-icons/hi";
import { useTheme } from "next-themes";

export interface ToggleTipProps extends ChakraPopover.RootProps {
  showArrow?: boolean;
  portalled?: boolean;
  portalRef?: React.RefObject<HTMLElement>;
  content?: React.ReactNode;
  className?: string;
}

export const ToggleTip = React.forwardRef<HTMLDivElement, ToggleTipProps>(
  function ToggleTip(props, ref) {
    const {
      showArrow,
      children,
      portalled = true,
      content,
      portalRef,
      className,
      ...rest
    } = props;
    const { resolvedTheme } = useTheme();
    const currentTheme = resolvedTheme || "light";

    return (
      <ChakraPopover.Root
        {...rest}
        positioning={{ ...rest.positioning, gutter: 4 }}
      >
        <ChakraPopover.Trigger asChild>{children}</ChakraPopover.Trigger>
        <Portal disabled={!portalled} container={portalRef}>
          <ChakraPopover.Positioner>
            <ChakraPopover.Content
              width="auto"
              px="2"
              py="1"
              textStyle="xs"
              rounded="sm"
              ref={ref}
              bg="tooltipBg"
              color="text"
              borderColor="border"
              className={
                className
                  ? `toggle-tip-content ${className}`
                  : "toggle-tip-content"
              }
            >
              {showArrow && (
                <ChakraPopover.Arrow>
                  <ChakraPopover.ArrowTip />
                </ChakraPopover.Arrow>
              )}
              {content}
            </ChakraPopover.Content>
          </ChakraPopover.Positioner>
        </Portal>
      </ChakraPopover.Root>
    );
  }
);

export const InfoTip = React.forwardRef<
  HTMLDivElement,
  Partial<ToggleTipProps>
>(function InfoTip(props, ref) {
  const { children, ...rest } = props;
  const { resolvedTheme } = useTheme();
  const currentTheme = resolvedTheme || "light";

  return (
    <ToggleTip content={children} {...rest} ref={ref}>
      <IconButton
        variant="ghost"
        aria-label="info"
        size="2xs"
        color="text"
        _hover={{
          bg: "buttonHover",
        }}
      >
        <HiOutlineInformationCircle />
      </IconButton>
    </ToggleTip>
  );
});
