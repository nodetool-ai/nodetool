import { Checkbox as ChakraCheckbox } from "@chakra-ui/react";
import * as React from "react";
import { useTheme } from "next-themes";

export interface CheckboxProps extends ChakraCheckbox.RootProps {
  icon?: React.ReactNode;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
  rootRef?: React.Ref<HTMLLabelElement>;
  className?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox(props, ref) {
    const { icon, children, inputProps, rootRef, className, ...rest } = props;
    const { resolvedTheme } = useTheme();
    const currentTheme = resolvedTheme || "light";

    return (
      <ChakraCheckbox.Root
        className={className ? `checkbox-root ${className}` : "checkbox-root"}
        ref={rootRef}
        {...rest}
        bg="inputBg"
        borderColor="border"
        _hover={{
          borderColor: "primary",
        }}
      >
        <ChakraCheckbox.Control>
          {icon || <ChakraCheckbox.Indicator />}
        </ChakraCheckbox.Control>
        <ChakraCheckbox.Label>{children}</ChakraCheckbox.Label>
        <ChakraCheckbox.HiddenInput ref={ref} {...inputProps} />
      </ChakraCheckbox.Root>
    );
  }
);
