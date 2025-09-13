import { Field as ChakraField } from "@chakra-ui/react";
import * as React from "react";
import { useTheme } from "next-themes";

export interface FieldProps extends Omit<ChakraField.RootProps, "label"> {
  label?: React.ReactNode;
  helperText?: React.ReactNode;
  errorText?: React.ReactNode;
  optionalText?: React.ReactNode;
  className?: string;
}

export const Field = React.forwardRef<HTMLDivElement, FieldProps>(
  function Field(props, ref) {
    const {
      label,
      children,
      helperText,
      errorText,
      optionalText,
      className,
      ...rest
    } = props;
    const { resolvedTheme } = useTheme();
    const currentTheme = resolvedTheme || "light";

    return (
      <ChakraField.Root
        className={className ? `field-root ${className}` : "field-root"}
        ref={ref}
        bg="gray.900"
        color="white"
        borderRadius="lg"
        boxShadow="md"
        {...rest}
      >
        {label && (
          <ChakraField.Label color="text">
            {label}
            <ChakraField.RequiredIndicator fallback={optionalText} />
          </ChakraField.Label>
        )}
        {children}
        {helperText && (
          <ChakraField.HelperText color="textGray">
            {helperText}
          </ChakraField.HelperText>
        )}
        {errorText && (
          <ChakraField.ErrorText color="error">
            {errorText}
          </ChakraField.ErrorText>
        )}
      </ChakraField.Root>
    );
  }
);
