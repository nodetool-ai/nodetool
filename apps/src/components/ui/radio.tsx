import { RadioGroup as ChakraRadioGroup } from "@chakra-ui/react";
import * as React from "react";
import { useTheme } from "next-themes";

export interface RadioProps extends ChakraRadioGroup.ItemProps {
  rootRef?: React.Ref<HTMLDivElement>;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
  className?: string;
}

export const Radio = React.forwardRef<HTMLInputElement, RadioProps>(
  function Radio(props, ref) {
    const { children, inputProps, rootRef, className, ...rest } = props;
    const { resolvedTheme } = useTheme();
    const currentTheme = resolvedTheme || "light";

    return (
      <ChakraRadioGroup.Item
        className={className ? `radio-root ${className}` : "radio-root"}
        ref={rootRef}
        bg="inputBg"
        borderColor="border"
        _hover={{
          borderColor: "primary",
        }}
        {...rest}
      >
        <ChakraRadioGroup.ItemHiddenInput ref={ref} {...inputProps} />
        <ChakraRadioGroup.ItemIndicator />
        {children && (
          <ChakraRadioGroup.ItemText color="text">
            {children}
          </ChakraRadioGroup.ItemText>
        )}
      </ChakraRadioGroup.Item>
    );
  }
);

export const RadioGroup = ChakraRadioGroup.Root;
