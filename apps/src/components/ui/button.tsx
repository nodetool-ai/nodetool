import type { ButtonProps as ChakraButtonProps } from "@chakra-ui/react";
import {
  AbsoluteCenter,
  Button as ChakraButton,
  Span,
  Spinner,
} from "@chakra-ui/react";
import * as React from "react";
import { useTheme } from "next-themes";

interface ButtonLoadingProps {
  loading?: boolean;
  loadingText?: React.ReactNode;
}

export interface ButtonProps extends ChakraButtonProps, ButtonLoadingProps {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(props, ref) {
    const { loading, disabled, loadingText, children, ...rest } = props;

    return (
      <ChakraButton
        className={
          props.className ? `button-root ${props.className}` : "button-root"
        }
        disabled={loading || disabled}
        ref={ref}
        bg="blue.700"
        color="white"
        borderRadius="xl"
        boxShadow="md"
        transition="all 0.2s ease"
        _hover={{
          color: "white",
          bg: "blue.600",
        }}
        _active={{
          bg: "blue.800",
        }}
        {...rest}
      >
        {loading && !loadingText ? (
          <>
            <AbsoluteCenter display="inline-flex">
              <Spinner size="inherit" color="inherit" />
            </AbsoluteCenter>
            <Span opacity={0}>{children}</Span>
          </>
        ) : loading && loadingText ? (
          <>
            <Spinner size="inherit" color="inherit" />
            {loadingText}
          </>
        ) : (
          children
        )}
      </ChakraButton>
    );
  }
);
