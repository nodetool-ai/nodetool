import { Slider as ChakraSlider, For, HStack } from "@chakra-ui/react";
import * as React from "react";
import { useTheme } from "next-themes";

export interface SliderProps extends ChakraSlider.RootProps {
  marks?: Array<number | { value: number; label: React.ReactNode }>;
  label?: React.ReactNode;
  showValue?: boolean;
  className?: string;
}

export const Slider = React.forwardRef<HTMLDivElement, SliderProps>(
  function Slider(props, ref) {
    const { marks: marksProp, label, showValue, className, ...rest } = props;
    const value = props.defaultValue ?? props.value;
    const { resolvedTheme } = useTheme();
    const currentTheme = resolvedTheme || "light";

    const marks = marksProp?.map((mark) => {
      if (typeof mark === "number") return { value: mark, label: undefined };
      return mark;
    });

    const hasMarkLabel = !!marks?.some((mark) => mark.label);

    return (
      <ChakraSlider.Root
        className={className ? `slider-root ${className}` : "slider-root"}
        ref={ref}
        thumbAlignment="center"
        color="white"
        borderRadius="lg"
        boxShadow="md"
        {...rest}
      >
        {label && !showValue && (
          <ChakraSlider.Label color="text">{label}</ChakraSlider.Label>
        )}
        {label && showValue && (
          <HStack justify="space-between">
            <ChakraSlider.Label color="text">{label}</ChakraSlider.Label>
            <ChakraSlider.ValueText color="text" />
          </HStack>
        )}
        <ChakraSlider.Control
          data-has-mark-label={hasMarkLabel || undefined}
          bg="gray.800"
        >
          <ChakraSlider.Track>
            <ChakraSlider.Range bg="primary" />
          </ChakraSlider.Track>
          <SliderThumbs value={value} />
          <SliderMarks marks={marks} />
        </ChakraSlider.Control>
      </ChakraSlider.Root>
    );
  }
);

function SliderThumbs(props: { value?: number[] }) {
  const { value } = props;
  return (
    <For each={value}>
      {(_, index) => (
        <ChakraSlider.Thumb key={index} index={index}>
          <ChakraSlider.HiddenInput />
        </ChakraSlider.Thumb>
      )}
    </For>
  );
}

interface SliderMarksProps {
  marks?: Array<number | { value: number; label: React.ReactNode }>;
}

const SliderMarks = React.forwardRef<HTMLDivElement, SliderMarksProps>(
  function SliderMarks(props, ref) {
    const { marks } = props;
    if (!marks?.length) return null;

    return (
      <ChakraSlider.MarkerGroup ref={ref}>
        {marks.map((mark, index) => {
          const value = typeof mark === "number" ? mark : mark.value;
          const label = typeof mark === "number" ? undefined : mark.label;
          return (
            <ChakraSlider.Marker key={index} value={value}>
              <ChakraSlider.MarkerIndicator />
              {label}
            </ChakraSlider.Marker>
          );
        })}
      </ChakraSlider.MarkerGroup>
    );
  }
);
