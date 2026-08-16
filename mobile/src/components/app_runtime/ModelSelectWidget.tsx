/**
 * Native renderer for the catalog's `ModelSelect`.
 *
 * The web widget offers the graph editor's model menus; a phone has no menu of
 * that shape, so the same choice renders as a chip row over the models the
 * device can reach. The written value is identical either way — the
 * `{type, id, provider, name}` ref a workflow's model input reads — so an app
 * authored in the builder runs the same model here.
 *
 * The tRPC model queries live in this file rather than in `widgets.tsx` so the
 * shared widget module keeps rendering without them.
 */
import React from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { AppEvent } from "@nodetool-ai/app-runtime";

import { useTheme } from "../../hooks/useTheme";
import { useModelsForType } from "../../hooks/useModelsByProvider";
import { useWidgetRuntime } from "./useWidgetRuntime";
import { isString } from "../../utils/typePredicates";

interface ModelSelectProps {
  id: string;
  binding?: string;
  events?: AppEvent[];
  disabled?: boolean;
  props: Record<string, unknown>;
}

const str = (value: unknown): string => (isString(value) ? value : "");

/** The six model kinds a workflow input can ask for. */
const MODEL_KINDS = [
  "language_model",
  "image_model",
  "video_model",
  "tts_model",
  "asr_model",
  "embedding_model",
] as const;

type ModelKind = (typeof MODEL_KINDS)[number];

const modelKindOf = (value: unknown): ModelKind =>
  MODEL_KINDS.includes(value as ModelKind)
    ? (value as ModelKind)
    : "language_model";

export const ModelSelectWidget: React.FC<ModelSelectProps> = (widget) => {
  const { colors } = useTheme();
  const { value, setValue, emit } = useWidgetRuntime({
    ...widget,
    bindingMode: "write",
  });
  const kind = modelKindOf(widget.props.modelKind);
  const { models, isLoading, error } = useModelsForType(kind);
  const selectedId = str((value as Record<string, unknown> | null)?.id);

  const label = str(widget.props.label);
  const status = error
    ? error
    : !isLoading && models.length === 0
      ? "No models available"
      : null;

  return (
    <View style={styles.field}>
      {label ? (
        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      ) : null}
      {isLoading ? <ActivityIndicator color={colors.primary} /> : null}
      {status ? (
        <Text style={[styles.hint, { color: colors.textTertiary }]}>
          {status}
        </Text>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chipRow}>
          {models.map((model) => {
            const selected = model.id === selectedId;
            return (
              <TouchableOpacity
                key={`${model.provider}:${model.id}`}
                disabled={widget.disabled}
                onPress={() => {
                  setValue({
                    type: kind,
                    id: model.id,
                    provider: model.provider,
                    name: model.name || "",
                  });
                  emit("change");
                }}
                style={[
                  styles.chip,
                  {
                    backgroundColor: selected ? colors.primary : colors.inputBg,
                    borderColor: selected ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={{
                    color: selected ? colors.textOnPrimary : colors.text,
                  }}
                >
                  {model.name || model.id}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  field: {
    gap: 8,
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
  },
  hint: {
    fontSize: 12,
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
});
