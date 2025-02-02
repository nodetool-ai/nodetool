import type { BoxProps, InputElementProps } from "@chakra-ui/react";
import { Group, InputElement } from "@chakra-ui/react";
import * as React from "react";
import { useTheme } from "next-themes";

export interface InputGroupProps extends BoxProps {
  startElementProps?: InputElementProps;
  endElementProps?: InputElementProps;
  startElement?: React.ReactNode;
  endElement?: React.ReactNode;
  children: React.ReactElement<InputElementProps>;
  startOffset?: InputElementProps["paddingStart"];
  endOffset?: InputElementProps["paddingEnd"];
}

export const InputGroup = React.forwardRef<HTMLDivElement, InputGroupProps>(
  function InputGroup(props, ref) {
    const {
      children,
      startElement,
      endElement,
      startElementProps,
      endElementProps,
      startOffset,
      endOffset,
      ...rest
    } = props;

    const { resolvedTheme } = useTheme();
    const currentTheme = resolvedTheme || "light";

    return (
      <Group
        className={
          props.className
            ? `input-group-root ${props.className}`
            : "input-group-root"
        }
        ref={ref}
        bg="inputBg"
        borderColor="border"
        _hover={{
          borderColor: "primary",
        }}
        _focusWithin={{
          borderColor: "primary",
          boxShadow: "0 0 0 2px var(--nt-colors-primary-alpha)",
        }}
        {...rest}
      >
        {startElement && (
          <InputElement placement="start" color="text" {...startElementProps}>
            {startElement}
          </InputElement>
        )}
        {React.cloneElement(children, {
          paddingStart: startElement ? startOffset : undefined,
          paddingEnd: endElement ? endOffset : undefined,
        })}
        {endElement && (
          <InputElement placement="end" color="text" {...endElementProps}>
            {endElement}
          </InputElement>
        )}
      </Group>
    );
  }
);
