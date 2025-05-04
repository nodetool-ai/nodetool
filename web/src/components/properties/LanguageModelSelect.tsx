import { useMemo, useCallback, memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { isEqual } from "lodash";
import Select from "../inputs/Select";
import useModelStore from "../../stores/ModelStore";
import { LlamaModel } from "../../stores/ApiTypes";

interface LanguageModelSelectProps {
  onChange: (value: any) => void;
  value: string;
}

const LanguageModelSelect = ({ onChange, value }: LanguageModelSelectProps) => {
  const loadLanguageModels = useModelStore((state) => state.loadLanguageModels);
  const {
    data: models,
    isLoading,
    isError
  } = useQuery({
    queryKey: ["models"],
    queryFn: async () => await loadLanguageModels()
  });

  const options = useMemo(() => {
    if (!models || isLoading || isError) return [];
    return [
      { value: "", label: "Select a model" },
      ...models
        .map((model) => ({
          value: model.id || "",
          label: model.name || ""
        }))
        .sort((a, b) => {
          const providerA =
            models?.find((m) => m.id === a.value)?.provider || "";
          const providerB =
            models?.find((m) => m.id === b.value)?.provider || "";

          // First sort by provider
          const providerCompare = providerA.localeCompare(providerB);
          if (providerCompare !== 0) {
            return providerCompare;
          }

          // Then sort by label
          return a.label.localeCompare(b.label);
        })
    ];
  }, [models, isLoading, isError]);

  const handleChange = useCallback(
    (selectedValue: string) => {
      onChange({
        type: "language_model",
        id: selectedValue,
        provider: models?.find((m) => m.id === selectedValue)?.provider
      });
    },
    [onChange, models]
  );

  // Check if the current value exists in the combined options list
  const isValueMissing = value && !options.some((v) => v.value === value);

  return (
    <Select
      options={[
        ...options,
        // Add the missing value option if the current value isn't in the list
        ...(isValueMissing
          ? [
              {
                value,
                label: `${value} (missing)`
              }
            ]
          : [])
      ]}
      value={value}
      onChange={handleChange}
      placeholder="Select a model"
    />
  );
};

export default memo(LanguageModelSelect, isEqual);
