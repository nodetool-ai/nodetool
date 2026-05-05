/**
 * PropertyField renders a single property of a chain node.
 *
 * Maps the Property type metadata to the appropriate input widget,
 * mirroring the web's getComponentForProperty / PropertyInput pattern.
 * Covers all property types from the web editor with mobile-appropriate UIs.
 */

import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Switch,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { useTheme } from "../../hooks/useTheme";
import { useModelsForType } from "../../hooks/useModelsByProvider";
import { ModelSelectModal } from "./ModelSelectModal";
import { apiService } from "../../services/api";
import type { Property } from "../../types/ApiTypes";

// ── Shared types ────────────────────────────────────────────────────

interface PropertyFieldProps {
  property: Property;
  value: unknown;
  nodeType?: string;
  onChange: (value: unknown) => void;
  /** When true, shows a "connected" badge and placeholder instead of the input. */
  isConnected?: boolean;
}

type ThemeColors = ReturnType<typeof useTheme>["colors"];

// ── Type resolution ─────────────────────────────────────────────────

type WidgetType =
  | "string"
  | "text"
  | "integer"
  | "float"
  | "boolean"
  | "enum"
  | "image"
  | "audio"
  | "video"
  | "color"
  | "image_size"
  | "json"
  | "dict"
  | "string_list"
  | "list"
  | "file_path"
  | "folder_path"
  | "model"
  | "asset_ref"
  | "unsupported";

function resolveWidgetType(prop: Property): WidgetType {
  // Enum values on the property or nested in type metadata
  if (prop.values && prop.values.length > 0) {return "enum";}
  if (prop.type.values && prop.type.values.length > 0) {return "enum";}
  if (
    prop.type.type_args?.[0]?.values &&
    prop.type.type_args[0].values.length > 0
  )
    {return "enum";}

  // json_schema_extra override
  const extra = prop.json_schema_extra?.type as string | undefined;
  if (extra) {return mapTypeString(extra);}

  const t = prop.type.type;

  // Union: resolve first type arg
  if (t === "union") {
    const first = prop.type.type_args?.[0]?.type;
    if (first) {return mapTypeString(first);}
  }

  // List: check inner type
  if (t === "list") {
    const inner = prop.type.type_args?.[0]?.type;
    if (inner === "str") {return "string_list";}
    return "list";
  }

  return mapTypeString(t);
}

function mapTypeString(t: string): WidgetType {
  switch (t) {
    case "str":
    case "string":
      return "string";
    case "text":
      return "text";
    case "int":
    case "integer":
      return "integer";
    case "float":
    case "number":
      return "float";
    case "bool":
    case "boolean":
      return "boolean";
    case "enum":
    case "select":
      return "enum";
    case "image":
      return "image";
    case "audio":
      return "audio";
    case "video":
      return "video";
    case "color":
      return "color";
    case "image_size":
      return "image_size";
    case "json":
      return "json";
    case "dict":
      return "dict";
    case "file_path":
      return "file_path";
    case "folder_path":
      return "folder_path";
    case "document":
    case "file":
    case "asset":
    case "folder":
      return "asset_ref";
    case "dataframe":
    case "record_type":
    case "collection":
    case "workflow":
    case "font":
    case "model_3d":
      return "asset_ref";
    default:
      // Model types: *_model, comfy.*, hf.*
      if (t.endsWith("_model") || t.startsWith("comfy.") || t.startsWith("hf."))
        {return "model";}
      // List subtypes
      if (
        [
          "image_list",
          "audio_list",
          "video_list",
          "text_list",
          "string_list",
        ].includes(t)
      )
        {return "string_list";}
      return "unsupported";
  }
}

// ── Widget components ───────────────────────────────────────────────

// String input
const StringWidget: React.FC<{
  prop: Property;
  value: unknown;
  onChange: (v: unknown) => void;
  colors: ThemeColors;
  multiline?: boolean;
}> = ({ prop, value, onChange, colors, multiline }) => {
  const isLong = String(value ?? "").length > 60;
  const shouldMultiline = multiline || isLong;

  return (
    <TextInput
      style={[
        styles.textInput,
        shouldMultiline && styles.textInputMultiline,
        {
          backgroundColor: colors.inputBg,
          color: colors.text,
          borderColor: colors.border,
        },
      ]}
      value={String(value ?? "")}
      onChangeText={onChange}
      placeholder={prop.description ?? `Enter ${prop.title ?? prop.name}`}
      placeholderTextColor={colors.textTertiary}
      multiline={shouldMultiline}
    />
  );
};

// Integer input with range hint
const IntegerWidget: React.FC<{
  prop: Property;
  value: unknown;
  onChange: (v: unknown) => void;
  colors: ThemeColors;
}> = ({ prop, value, onChange, colors }) => (
  <View style={styles.numberRow}>
    <TextInput
      style={[
        styles.numberInput,
        {
          backgroundColor: colors.inputBg,
          color: colors.text,
          borderColor: colors.border,
        },
      ]}
      value={String(value ?? "")}
      onChangeText={(text) => {
        const parsed = parseInt(text, 10);
        if (!isNaN(parsed)) {onChange(parsed);}
        else if (text === "" || text === "-") {onChange(text);}
      }}
      keyboardType="number-pad"
      placeholder="0"
      placeholderTextColor={colors.textTertiary}
    />
    {prop.min != null && prop.max != null && (
      <Text style={[styles.rangeHint, { color: colors.textTertiary }]}>
        {prop.min} – {prop.max}
      </Text>
    )}
  </View>
);

// Float input with local state for partial typing (e.g. "0.")
const FloatWidget: React.FC<{
  prop: Property;
  value: unknown;
  onChange: (v: unknown) => void;
  colors: ThemeColors;
}> = ({ prop, value, onChange, colors }) => {
  const [localValue, setLocalValue] = useState(
    value !== undefined ? String(value) : ""
  );
  const localValueRef = useRef(localValue);
  localValueRef.current = localValue;

  React.useEffect(() => {
    const parsedLocal = parseFloat(localValueRef.current);
    if (value !== undefined && value !== parsedLocal) {
      setLocalValue(String(value));
    }
  }, [value]);

  const onTextChange = useCallback(
    (text: string) => {
      setLocalValue(text);
      if (text === "" || text === "-" || text === ".") {
        onChange(text);
        return;
      }
      const parsed = parseFloat(text);
      if (!isNaN(parsed)) {onChange(parsed);}
    },
    [onChange]
  );

  return (
    <View style={styles.numberRow}>
      <TextInput
        style={[
          styles.numberInput,
          {
            backgroundColor: colors.inputBg,
            color: colors.text,
            borderColor: colors.border,
          },
        ]}
        value={localValue}
        onChangeText={onTextChange}
        keyboardType="decimal-pad"
        placeholder="0.0"
        placeholderTextColor={colors.textTertiary}
      />
      {prop.min != null && prop.max != null && (
        <Text style={[styles.rangeHint, { color: colors.textTertiary }]}>
          {prop.min} – {prop.max}
        </Text>
      )}
    </View>
  );
};

// Boolean toggle
const BoolWidget: React.FC<{
  value: unknown;
  onChange: (v: unknown) => void;
  colors: ThemeColors;
}> = ({ value, onChange, colors }) => (
  <Switch
    value={Boolean(value)}
    onValueChange={onChange}
    trackColor={{ false: colors.border, true: colors.primary + "80" }}
    thumbColor={value ? colors.primary : colors.textTertiary}
  />
);

// Enum / select with horizontal chips
const EnumWidget: React.FC<{
  prop: Property;
  value: unknown;
  onChange: (v: unknown) => void;
  colors: ThemeColors;
}> = ({ prop, value, onChange, colors }) => {
  const options =
    prop.values ??
    prop.type.values ??
    prop.type.type_args?.[0]?.values ??
    [];

  // For many options use a scrollable list instead of wrapping chips
  if (options.length > 8) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.enumScroll}
      >
        <View style={styles.enumContainer}>
          {options.map((opt) => {
            const isSelected = String(value) === String(opt);
            return (
              <TouchableOpacity
                key={String(opt)}
                style={[
                  styles.enumOption,
                  {
                    backgroundColor: isSelected
                      ? colors.primaryMuted
                      : colors.inputBg,
                    borderColor: isSelected
                      ? colors.primary + "60"
                      : colors.border,
                  },
                ]}
                onPress={() => onChange(opt)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.enumText,
                    { color: isSelected ? colors.primary : colors.text },
                  ]}
                >
                  {formatEnumLabel(String(opt))}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={styles.enumContainer}>
      {options.map((opt) => {
        const isSelected = String(value) === String(opt);
        return (
          <TouchableOpacity
            key={String(opt)}
            style={[
              styles.enumOption,
              {
                backgroundColor: isSelected
                  ? colors.primaryMuted
                  : colors.inputBg,
                borderColor: isSelected
                  ? colors.primary + "60"
                  : colors.border,
              },
            ]}
            onPress={() => onChange(opt)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.enumText,
                { color: isSelected ? colors.primary : colors.text },
              ]}
            >
              {formatEnumLabel(String(opt))}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

/** Convert snake_case enum values to Title Case for display */
function formatEnumLabel(s: string): string {
  return s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Media widgets (image, audio, video) ─────────────────────────────

const ImageWidget: React.FC<{
  prop: Property;
  value: unknown;
  onChange: (v: unknown) => void;
  colors: ThemeColors;
}> = ({ prop, value, onChange, colors }) => {
  const uri = extractUri(value);
  const [uploading, setUploading] = useState(false);

  const pickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const picked = result.assets[0];
      const fileName = picked.fileName ?? `image_${Date.now()}.jpg`;
      const mimeType = picked.mimeType ?? "image/jpeg";
      setUploading(true);
      try {
        const asset = await apiService.uploadAsset({
          uri: picked.uri,
          name: fileName,
          contentType: mimeType,
          parentId: "",
        });
        const ext = fileName.includes(".")
          ? fileName.slice(fileName.lastIndexOf("."))
          : ".jpg";
        const storageUri = `${apiService.getApiHost()}/api/storage/${asset.id}${ext}`;
        onChange({ type: "image", uri: storageUri, asset_id: asset.id });
      } catch (err) {
        console.error("Failed to upload image:", err);
        // Fall back to local URI so the preview still works
        onChange({ type: "image", uri: picked.uri });
      } finally {
        setUploading(false);
      }
    }
  }, [onChange]);

  return (
    <View style={styles.mediaContainer}>
      {uri ? (
        <View style={styles.mediaPreviewRow}>
          <Image
            source={{ uri }}
            style={[styles.mediaPreview, { borderColor: colors.border }]}
            resizeMode="cover"
          />
          <View style={styles.mediaActions}>
            <TouchableOpacity
              style={[styles.mediaButton, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
              onPress={pickImage}
              activeOpacity={0.7}
            >
              <Ionicons name="swap-horizontal" size={16} color={colors.text} />
              <Text style={[styles.mediaButtonText, { color: colors.text }]}>Replace</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.mediaButton, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
              onPress={() => onChange(null)}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={16} color={colors.error} />
              <Text style={[styles.mediaButtonText, { color: colors.error }]}>Clear</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={[
            styles.mediaDropzone,
            { backgroundColor: colors.inputBg, borderColor: colors.border },
          ]}
          onPress={pickImage}
          activeOpacity={0.7}
        >
          <Ionicons name="image-outline" size={28} color={colors.textTertiary} />
          <Text style={[styles.mediaDropzoneText, { color: colors.textTertiary }]}>
            Tap to select image
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const AudioWidget: React.FC<{
  prop: Property;
  value: unknown;
  onChange: (v: unknown) => void;
  colors: ThemeColors;
}> = ({ prop, value, onChange, colors }) => {
  const uri = extractUri(value);
  const [uploading, setUploading] = useState(false);

  const pickAudio = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: "audio/*",
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets?.[0]) {
      const picked = result.assets[0];
      const fileName = picked.name ?? `audio_${Date.now()}.wav`;
      const mimeType = picked.mimeType ?? "audio/wav";
      setUploading(true);
      try {
        const asset = await apiService.uploadAsset({
          uri: picked.uri,
          name: fileName,
          contentType: mimeType,
          parentId: "",
        });
        const ext = fileName.includes(".")
          ? fileName.slice(fileName.lastIndexOf("."))
          : ".wav";
        const storageUri = `${apiService.getApiHost()}/api/storage/${asset.id}${ext}`;
        onChange({ type: "audio", uri: storageUri, asset_id: asset.id });
      } catch (err) {
        console.error("Failed to upload audio:", err);
        onChange({ type: "audio", uri: picked.uri });
      } finally {
        setUploading(false);
      }
    }
  }, [onChange]);

  return (
    <View style={styles.mediaContainer}>
      {uri ? (
        <View style={styles.mediaFileRow}>
          <Ionicons name="musical-note" size={20} color={colors.primary} />
          <Text
            style={[styles.mediaFileName, { color: colors.text }]}
            numberOfLines={1}
          >
            {extractFileName(uri)}
          </Text>
          <TouchableOpacity onPress={() => onChange(null)} hitSlop={8}>
            <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={[
            styles.mediaDropzone,
            { backgroundColor: colors.inputBg, borderColor: colors.border },
          ]}
          onPress={pickAudio}
          activeOpacity={0.7}
        >
          <Ionicons name="musical-note-outline" size={28} color={colors.textTertiary} />
          <Text style={[styles.mediaDropzoneText, { color: colors.textTertiary }]}>
            Tap to select audio
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const VideoWidget: React.FC<{
  prop: Property;
  value: unknown;
  onChange: (v: unknown) => void;
  colors: ThemeColors;
}> = ({ prop, value, onChange, colors }) => {
  const uri = extractUri(value);
  const [uploading, setUploading] = useState(false);

  const pickVideo = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const picked = result.assets[0];
      const fileName = picked.fileName ?? `video_${Date.now()}.mp4`;
      const mimeType = picked.mimeType ?? "video/mp4";
      setUploading(true);
      try {
        const asset = await apiService.uploadAsset({
          uri: picked.uri,
          name: fileName,
          contentType: mimeType,
          parentId: "",
        });
        const ext = fileName.includes(".")
          ? fileName.slice(fileName.lastIndexOf("."))
          : ".mp4";
        const storageUri = `${apiService.getApiHost()}/api/storage/${asset.id}${ext}`;
        onChange({ type: "video", uri: storageUri, asset_id: asset.id });
      } catch (err) {
        console.error("Failed to upload video:", err);
        onChange({ type: "video", uri: picked.uri });
      } finally {
        setUploading(false);
      }
    }
  }, [onChange]);

  return (
    <View style={styles.mediaContainer}>
      {uri ? (
        <View style={styles.mediaFileRow}>
          <Ionicons name="videocam" size={20} color={colors.primary} />
          <Text
            style={[styles.mediaFileName, { color: colors.text }]}
            numberOfLines={1}
          >
            {extractFileName(uri)}
          </Text>
          <TouchableOpacity onPress={() => onChange(null)} hitSlop={8}>
            <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={[
            styles.mediaDropzone,
            { backgroundColor: colors.inputBg, borderColor: colors.border },
          ]}
          onPress={pickVideo}
          activeOpacity={0.7}
        >
          <Ionicons name="videocam-outline" size={28} color={colors.textTertiary} />
          <Text style={[styles.mediaDropzoneText, { color: colors.textTertiary }]}>
            Tap to select video
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

/** Extract URI from value — handles {uri: ...}, {id: ...}, or raw string */
function extractUri(value: unknown): string | null {
  if (!value) {return null;}
  if (typeof value === "string") {return value;}
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (typeof v.uri === "string") {return v.uri;}
    if (typeof v.id === "string") {return v.id;}
  }
  return null;
}

function extractFileName(uri: string): string {
  const parts = uri.split("/");
  return parts[parts.length - 1] ?? uri;
}

// ── Color widget ────────────────────────────────────────────────────

const PRESET_COLORS = [
  "#000000", "#FFFFFF", "#FF0000", "#00FF00", "#0000FF",
  "#FFFF00", "#FF00FF", "#00FFFF", "#FF8800", "#8800FF",
  "#0088FF", "#FF0088", "#88FF00", "#00FF88", "#808080",
  "#C0C0C0",
];

const ColorWidget: React.FC<{
  value: unknown;
  onChange: (v: unknown) => void;
  colors: ThemeColors;
}> = ({ value, onChange, colors }) => {
  const colorValue =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>).value as string | undefined
      : typeof value === "string"
        ? value
        : undefined;

  const [customInput, setCustomInput] = useState(colorValue ?? "");

  return (
    <View style={colorStyles.container}>
      <View style={colorStyles.swatchGrid}>
        {PRESET_COLORS.map((c) => (
          <TouchableOpacity
            key={c}
            style={[
              colorStyles.swatch,
              { backgroundColor: c },
              colorValue === c && {
                borderWidth: 2,
                borderColor: colors.primary,
              },
            ]}
            onPress={() => {
              onChange({ type: "color", value: c });
              setCustomInput(c);
            }}
            activeOpacity={0.7}
          />
        ))}
      </View>
      <View style={colorStyles.customRow}>
        {colorValue ? (
          <View
            style={[
              colorStyles.previewSwatch,
              { backgroundColor: colorValue, borderColor: colors.border },
            ]}
          />
        ) : null}
        <TextInput
          style={[
            colorStyles.hexInput,
            {
              backgroundColor: colors.inputBg,
              color: colors.text,
              borderColor: colors.border,
            },
          ]}
          value={customInput}
          onChangeText={(text) => {
            setCustomInput(text);
            if (/^#[0-9A-Fa-f]{6}$/.test(text)) {
              onChange({ type: "color", value: text });
            }
          }}
          placeholder="#000000"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          maxLength={7}
        />
      </View>
    </View>
  );
};

const colorStyles = StyleSheet.create({
  container: { gap: 8 },
  swatchGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
  },
  customRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  previewSwatch: {
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
  },
  hexInput: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 14,
    fontFamily: "monospace",
    minHeight: 40,
  },
});

// ── Image size widget ───────────────────────────────────────────────

const IMAGE_SIZE_PRESETS = [
  { label: "512x512", width: 512, height: 512 },
  { label: "768x768", width: 768, height: 768 },
  { label: "1024x1024", width: 1024, height: 1024 },
  { label: "720p", width: 1280, height: 720 },
  { label: "1080p", width: 1920, height: 1080 },
  { label: "9:16", width: 1080, height: 1920 },
  { label: "4:3", width: 1024, height: 768 },
  { label: "3:4", width: 768, height: 1024 },
];

const ImageSizeWidget: React.FC<{
  value: unknown;
  onChange: (v: unknown) => void;
  colors: ThemeColors;
}> = ({ value, onChange, colors }) => {
  const safeValue = useMemo(() => {
    if (typeof value === "object" && value !== null) {
      const v = value as Record<string, unknown>;
      return {
        width: typeof v.width === "number" ? v.width : 1024,
        height: typeof v.height === "number" ? v.height : 1024,
      };
    }
    return { width: 1024, height: 1024 };
  }, [value]);

  const [locked, setLocked] = useState(false);
  const ratio = safeValue.width / safeValue.height;

  const matchedPreset = IMAGE_SIZE_PRESETS.find(
    (p) => p.width === safeValue.width && p.height === safeValue.height
  );

  return (
    <View style={imageSizeStyles.container}>
      {/* Width / Height inputs */}
      <View style={imageSizeStyles.inputRow}>
        <View style={imageSizeStyles.dimInput}>
          <Text style={[imageSizeStyles.dimLabel, { color: colors.textTertiary }]}>W</Text>
          <TextInput
            style={[
              imageSizeStyles.dimField,
              {
                backgroundColor: colors.inputBg,
                color: colors.text,
                borderColor: colors.border,
              },
            ]}
            value={String(safeValue.width)}
            onChangeText={(text) => {
              const w = parseInt(text, 10);
              if (!isNaN(w) && w > 0) {
                const h = locked ? Math.round(w / ratio) : safeValue.height;
                onChange({ ...safeValue, width: w, height: h, preset: undefined });
              }
            }}
            keyboardType="number-pad"
          />
        </View>

        <TouchableOpacity
          onPress={() => {
            onChange({
              ...safeValue,
              width: safeValue.height,
              height: safeValue.width,
              preset: undefined,
            });
          }}
          hitSlop={8}
        >
          <Ionicons name="swap-horizontal" size={18} color={colors.textSecondary} />
        </TouchableOpacity>

        <View style={imageSizeStyles.dimInput}>
          <Text style={[imageSizeStyles.dimLabel, { color: colors.textTertiary }]}>H</Text>
          <TextInput
            style={[
              imageSizeStyles.dimField,
              {
                backgroundColor: colors.inputBg,
                color: colors.text,
                borderColor: colors.border,
              },
            ]}
            value={String(safeValue.height)}
            onChangeText={(text) => {
              const h = parseInt(text, 10);
              if (!isNaN(h) && h > 0) {
                const w = locked ? Math.round(h * ratio) : safeValue.width;
                onChange({ ...safeValue, width: w, height: h, preset: undefined });
              }
            }}
            keyboardType="number-pad"
          />
        </View>

        <TouchableOpacity
          onPress={() => setLocked(!locked)}
          hitSlop={8}
        >
          <Ionicons
            name={locked ? "lock-closed" : "lock-open"}
            size={16}
            color={locked ? colors.primary : colors.textTertiary}
          />
        </TouchableOpacity>
      </View>

      {/* Presets */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={imageSizeStyles.presetsRow}>
          {IMAGE_SIZE_PRESETS.map((p) => {
            const isSelected = p.width === safeValue.width && p.height === safeValue.height;
            return (
              <TouchableOpacity
                key={p.label}
                style={[
                  imageSizeStyles.preset,
                  {
                    backgroundColor: isSelected ? colors.primaryMuted : colors.inputBg,
                    borderColor: isSelected ? colors.primary + "60" : colors.border,
                  },
                ]}
                onPress={() =>
                  onChange({ width: p.width, height: p.height, preset: p.label })
                }
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    imageSizeStyles.presetText,
                    { color: isSelected ? colors.primary : colors.text },
                  ]}
                >
                  {p.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {matchedPreset && (
        <Text style={[imageSizeStyles.matchedLabel, { color: colors.textTertiary }]}>
          {matchedPreset.label}
        </Text>
      )}
    </View>
  );
};

const imageSizeStyles = StyleSheet.create({
  container: { gap: 8 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dimInput: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dimLabel: { fontSize: 12, fontWeight: "600" },
  dimField: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 14,
    minHeight: 40,
    textAlign: "center",
  },
  presetsRow: {
    flexDirection: "row",
    gap: 6,
    paddingVertical: 2,
  },
  preset: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  presetText: { fontSize: 12, fontWeight: "500" },
  matchedLabel: { fontSize: 11 },
});

// ── JSON widget ─────────────────────────────────────────────────────

const JSONWidget: React.FC<{
  prop: Property;
  value: unknown;
  onChange: (v: unknown) => void;
  colors: ThemeColors;
}> = ({ prop, value, onChange, colors }) => {
  const dataStr =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>).data as string | undefined
      : typeof value === "string"
        ? value
        : undefined;

  const [localValue, setLocalValue] = useState(dataStr ?? "{}");
  const [error, setError] = useState<string | null>(null);

  const handleBlur = useCallback(() => {
    try {
      JSON.parse(localValue);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
    onChange({ type: "json", data: localValue });
  }, [localValue, onChange]);

  return (
    <View style={jsonStyles.container}>
      <TextInput
        style={[
          jsonStyles.editor,
          {
            backgroundColor: colors.inputBg,
            color: colors.text,
            borderColor: error ? colors.error : colors.border,
          },
        ]}
        value={localValue}
        onChangeText={setLocalValue}
        onBlur={handleBlur}
        placeholder="{}"
        placeholderTextColor={colors.textTertiary}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
      />
      {error && (
        <Text style={[jsonStyles.error, { color: colors.error }]} numberOfLines={2}>
          {error}
        </Text>
      )}
    </View>
  );
};

const jsonStyles = StyleSheet.create({
  container: { gap: 4 },
  editor: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 13,
    fontFamily: "monospace",
    minHeight: 88,
    textAlignVertical: "top",
  },
  error: { fontSize: 11 },
});

// ── Dict widget (key-value pairs) ───────────────────────────────────

const DictWidget: React.FC<{
  value: unknown;
  onChange: (v: unknown) => void;
  colors: ThemeColors;
}> = ({ value, onChange, colors }) => {
  const dict = useMemo(() => {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return {};
  }, [value]);

  const entries = Object.entries(dict);

  const updateKey = useCallback(
    (oldKey: string, newKey: string) => {
      const newDict: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(dict)) {
        newDict[k === oldKey ? newKey : k] = v;
      }
      onChange(newDict);
    },
    [dict, onChange]
  );

  const updateValue = useCallback(
    (key: string, newValue: string) => {
      onChange({ ...dict, [key]: newValue });
    },
    [dict, onChange]
  );

  const removeEntry = useCallback(
    (key: string) => {
      const newDict = { ...dict };
      delete newDict[key];
      onChange(newDict);
    },
    [dict, onChange]
  );

  const addEntry = useCallback(() => {
    let newKey = "key";
    let i = 1;
    while (newKey in dict) {
      newKey = `key${i++}`;
    }
    onChange({ ...dict, [newKey]: "" });
  }, [dict, onChange]);

  return (
    <View style={dictStyles.container}>
      {entries.map(([key, val], i) => (
        <View key={i} style={dictStyles.entryRow}>
          <TextInput
            style={[
              dictStyles.keyInput,
              {
                backgroundColor: colors.inputBg,
                color: colors.text,
                borderColor: colors.border,
              },
            ]}
            value={key}
            onChangeText={(text) => updateKey(key, text)}
            placeholder="key"
            placeholderTextColor={colors.textTertiary}
          />
          <TextInput
            style={[
              dictStyles.valueInput,
              {
                backgroundColor: colors.inputBg,
                color: colors.text,
                borderColor: colors.border,
              },
            ]}
            value={String(val ?? "")}
            onChangeText={(text) => updateValue(key, text)}
            placeholder="value"
            placeholderTextColor={colors.textTertiary}
          />
          <TouchableOpacity
            onPress={() => removeEntry(key)}
            hitSlop={8}
          >
            <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity
        style={[
          dictStyles.addButton,
          { borderColor: colors.border },
        ]}
        onPress={addEntry}
        activeOpacity={0.7}
      >
        <Ionicons name="add" size={16} color={colors.textSecondary} />
        <Text style={[dictStyles.addText, { color: colors.textSecondary }]}>
          Add entry
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const dictStyles = StyleSheet.create({
  container: { gap: 6 },
  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  keyInput: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 13,
    minHeight: 38,
  },
  valueInput: {
    flex: 2,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 13,
    minHeight: 38,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  addText: { fontSize: 13 },
});

// ── String list widget (tag input) ──────────────────────────────────

const StringListWidget: React.FC<{
  value: unknown;
  onChange: (v: unknown) => void;
  colors: ThemeColors;
}> = ({ value, onChange, colors }) => {
  const items = useMemo(() => {
    if (Array.isArray(value)) {return value.map(String);}
    return [];
  }, [value]);

  const [inputValue, setInputValue] = useState("");

  const addItem = useCallback(() => {
    const trimmed = inputValue.trim();
    if (trimmed && !items.includes(trimmed)) {
      onChange([...items, trimmed]);
      setInputValue("");
    }
  }, [inputValue, items, onChange]);

  const removeItem = useCallback(
    (index: number) => {
      onChange(items.filter((_, i) => i !== index));
    },
    [items, onChange]
  );

  return (
    <View style={stringListStyles.container}>
      {items.length > 0 && (
        <View style={stringListStyles.tagRow}>
          {items.map((item, i) => (
            <View
              key={`${item}-${i}`}
              style={[
                stringListStyles.tag,
                { backgroundColor: colors.primaryMuted, borderColor: colors.primary + "40" },
              ]}
            >
              <Text style={[stringListStyles.tagText, { color: colors.text }]}>
                {item}
              </Text>
              <TouchableOpacity onPress={() => removeItem(i)} hitSlop={4}>
                <Ionicons name="close" size={14} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
      <View style={stringListStyles.inputRow}>
        <TextInput
          style={[
            stringListStyles.input,
            {
              backgroundColor: colors.inputBg,
              color: colors.text,
              borderColor: colors.border,
            },
          ]}
          value={inputValue}
          onChangeText={setInputValue}
          onSubmitEditing={addItem}
          placeholder="Type and press enter..."
          placeholderTextColor={colors.textTertiary}
          returnKeyType="done"
        />
        <TouchableOpacity
          style={[stringListStyles.addBtn, { backgroundColor: colors.primary }]}
          onPress={addItem}
          activeOpacity={0.7}
        >
          <Ionicons name="add" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const stringListStyles = StyleSheet.create({
  container: { gap: 6 },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  tagText: { fontSize: 13 },
  inputRow: {
    flexDirection: "row",
    gap: 6,
  },
  input: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 14,
    minHeight: 40,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});

// ── List widget (generic) ───────────────────────────────────────────

const ListWidget: React.FC<{
  prop: Property;
  value: unknown;
  onChange: (v: unknown) => void;
  colors: ThemeColors;
}> = ({ prop, value, onChange, colors }) => {
  const items = useMemo(() => {
    if (Array.isArray(value)) {return value;}
    return [];
  }, [value]);

  const innerType = prop.type.type_args?.[0]?.type ?? "str";
  const [inputValue, setInputValue] = useState("");

  const addItem = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed) {return;}
    let parsed: unknown = trimmed;
    if (innerType === "int" || innerType === "integer") {
      parsed = parseInt(trimmed, 10);
      if (isNaN(parsed as number)) {return;}
    } else if (innerType === "float" || innerType === "number") {
      parsed = parseFloat(trimmed);
      if (isNaN(parsed as number)) {return;}
    }
    onChange([...items, parsed]);
    setInputValue("");
  }, [inputValue, items, innerType, onChange]);

  const removeItem = useCallback(
    (index: number) => {
      onChange(items.filter((_, i) => i !== index));
    },
    [items, onChange]
  );

  return (
    <View style={stringListStyles.container}>
      {items.length > 0 && (
        <View style={stringListStyles.tagRow}>
          {items.map((item, i) => (
            <View
              key={`${i}`}
              style={[
                stringListStyles.tag,
                { backgroundColor: colors.primaryMuted, borderColor: colors.primary + "40" },
              ]}
            >
              <Text style={[stringListStyles.tagText, { color: colors.text }]}>
                {String(item)}
              </Text>
              <TouchableOpacity onPress={() => removeItem(i)} hitSlop={4}>
                <Ionicons name="close" size={14} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
      <View style={stringListStyles.inputRow}>
        <TextInput
          style={[
            stringListStyles.input,
            {
              backgroundColor: colors.inputBg,
              color: colors.text,
              borderColor: colors.border,
            },
          ]}
          value={inputValue}
          onChangeText={setInputValue}
          onSubmitEditing={addItem}
          placeholder={`Add ${innerType} value...`}
          placeholderTextColor={colors.textTertiary}
          returnKeyType="done"
          keyboardType={
            innerType === "int" || innerType === "integer"
              ? "number-pad"
              : innerType === "float" || innerType === "number"
                ? "decimal-pad"
                : "default"
          }
        />
        <TouchableOpacity
          style={[stringListStyles.addBtn, { backgroundColor: colors.primary }]}
          onPress={addItem}
          activeOpacity={0.7}
        >
          <Ionicons name="add" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ── File/folder path widget ─────────────────────────────────────────

const FilePathWidget: React.FC<{
  prop: Property;
  value: unknown;
  onChange: (v: unknown) => void;
  colors: ThemeColors;
  isFolder?: boolean;
}> = ({ prop, value, onChange, colors, isFolder }) => {
  const pathStr = typeof value === "string" ? value : "";

  const pickFile = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: "*/*",
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets?.[0]) {
      onChange(result.assets[0].uri);
    }
  }, [onChange]);

  return (
    <View style={filePathStyles.container}>
      <View style={filePathStyles.row}>
        <TextInput
          style={[
            filePathStyles.input,
            {
              backgroundColor: colors.inputBg,
              color: colors.text,
              borderColor: colors.border,
            },
          ]}
          value={pathStr}
          onChangeText={onChange}
          placeholder={isFolder ? "/path/to/folder" : "/path/to/file"}
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity
          style={[
            filePathStyles.browseBtn,
            { backgroundColor: colors.inputBg, borderColor: colors.border },
          ]}
          onPress={pickFile}
          activeOpacity={0.7}
        >
          <Ionicons
            name={isFolder ? "folder-outline" : "document-outline"}
            size={18}
            color={colors.textSecondary}
          />
        </TouchableOpacity>
      </View>
      {pathStr ? (
        <TouchableOpacity onPress={() => onChange("")} hitSlop={8}>
          <Text style={[filePathStyles.clearText, { color: colors.textTertiary }]}>
            Clear
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const filePathStyles = StyleSheet.create({
  container: { gap: 4 },
  row: {
    flexDirection: "row",
    gap: 6,
  },
  input: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 14,
    minHeight: 40,
  },
  browseBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  clearText: { fontSize: 12 },
});

// ── Model selector widget ───────────────────────────────────────────

const MODEL_TYPE_LABELS: Record<string, string> = {
  language_model: "Language Model",
  embedding_model: "Embedding Model",
  image_model: "Image Model",
  tts_model: "Text-to-Speech Model",
  asr_model: "Speech Recognition Model",
  video_model: "Video Model",
  model_3d_model: "3D Model",
  llama_model: "Llama Model",
};

const ModelWidget: React.FC<{
  prop: Property;
  value: unknown;
  onChange: (v: unknown) => void;
  colors: ThemeColors;
}> = ({ prop, value, onChange, colors }) => {
  const modelType = prop.type.type;
  const label = MODEL_TYPE_LABELS[modelType] ?? modelType;
  const [modalVisible, setModalVisible] = useState(false);

  // Fetch models from server
  const { models, providers, isLoading } = useModelsForType(modelType);

  // Extract display info from current value
  const { modelId, modelName } = useMemo(() => {
    if (!value) {return { modelId: "", modelName: "" };}
    if (typeof value === "string") {return { modelId: value, modelName: value };}
    if (typeof value === "object") {
      const v = value as Record<string, unknown>;
      const id = String(v.id ?? v.name ?? v.repo_id ?? "");
      const name = String(v.name ?? v.id ?? v.repo_id ?? "");
      return { modelId: id, modelName: name };
    }
    return { modelId: "", modelName: "" };
  }, [value]);

  const handleSelect = useCallback(
    (model: { type: string; id: string; name: string; provider: string; path?: string | null }) => {
      onChange({
        type: modelType,
        id: model.id,
        provider: model.provider,
        name: model.name || "",
        ...(model.path ? { path: model.path } : {}),
      });
    },
    [modelType, onChange]
  );

  return (
    <View style={modelStyles.container}>
      {/* Select button */}
      <TouchableOpacity
        style={[
          modelStyles.selectButton,
          {
            backgroundColor: colors.inputBg,
            borderColor: modelId ? colors.primary + "40" : colors.border,
          },
        ]}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.7}
      >
        <View style={modelStyles.selectContent}>
          {modelId ? (
            <>
              <Text
                style={[modelStyles.selectedName, { color: colors.text }]}
                numberOfLines={1}
              >
                {modelName || modelId}
              </Text>
              {modelName !== modelId && (
                <Text
                  style={[modelStyles.selectedId, { color: colors.textTertiary }]}
                  numberOfLines={1}
                >
                  {modelId}
                </Text>
              )}
            </>
          ) : (
            <Text style={[modelStyles.placeholder, { color: colors.textTertiary }]}>
              Select {label.toLowerCase()}...
            </Text>
          )}
        </View>
        <Ionicons
          name="chevron-down"
          size={16}
          color={colors.textTertiary}
        />
      </TouchableOpacity>

      {/* Provider badge */}
      {modelId && typeof value === "object" && value !== null && (value as Record<string, unknown>).provider ? (
        <Text style={[modelStyles.providerBadge, { color: colors.textTertiary }]}>
          {String((value as Record<string, unknown>).provider)}
        </Text>
      ) : null}

      {/* Model select modal */}
      <ModelSelectModal
        visible={modalVisible}
        title={`Select ${label}`}
        models={models}
        providers={providers}
        isLoading={isLoading}
        selectedModelId={modelId}
        onSelect={handleSelect}
        onClose={() => setModalVisible(false)}
      />
    </View>
  );
};

const modelStyles = StyleSheet.create({
  container: { gap: 4 },
  selectButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 44,
    gap: 8,
  },
  selectContent: {
    flex: 1,
    gap: 2,
  },
  selectedName: {
    fontSize: 14,
    fontWeight: "500",
  },
  selectedId: {
    fontSize: 11,
  },
  placeholder: {
    fontSize: 14,
  },
  providerBadge: {
    fontSize: 11,
    fontWeight: "500",
  },
});

// ── Asset reference widget (document, file, folder, workflow, etc.) ──

const AssetRefWidget: React.FC<{
  prop: Property;
  value: unknown;
  onChange: (v: unknown) => void;
  colors: ThemeColors;
}> = ({ prop, value, onChange, colors }) => {
  const typeLabel = prop.type.type;

  const refId = useMemo(() => {
    if (!value) {return "";}
    if (typeof value === "string") {return value;}
    if (typeof value === "object") {
      const v = value as Record<string, unknown>;
      return String(v.id ?? v.asset_id ?? v.name ?? v.uri ?? "");
    }
    return "";
  }, [value]);

  const pickDocument = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: "*/*",
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets?.[0]) {
      const picked = result.assets[0];
      const fileName = picked.name ?? `file_${Date.now()}`;
      const mimeType = picked.mimeType ?? "application/octet-stream";
      try {
        const uploaded = await apiService.uploadAsset({
          uri: picked.uri,
          name: fileName,
          contentType: mimeType,
          parentId: "",
        });
        const ext = fileName.includes(".")
          ? fileName.slice(fileName.lastIndexOf("."))
          : "";
        const storageUri = `${apiService.getApiHost()}/api/storage/${uploaded.id}${ext}`;
        onChange({ type: typeLabel, uri: storageUri, asset_id: uploaded.id, name: fileName });
      } catch (err) {
        console.error("Failed to upload document:", err);
        onChange({ type: typeLabel, uri: picked.uri, name: fileName });
      }
    }
  }, [onChange, typeLabel]);

  return (
    <View style={assetStyles.container}>
      {refId ? (
        <View style={assetStyles.refRow}>
          <Ionicons
            name={getAssetIcon(typeLabel)}
            size={18}
            color={colors.primary}
          />
          <Text
            style={[assetStyles.refText, { color: colors.text }]}
            numberOfLines={1}
          >
            {extractFileName(refId)}
          </Text>
          <TouchableOpacity onPress={() => onChange(null)} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={[
            assetStyles.pickButton,
            { backgroundColor: colors.inputBg, borderColor: colors.border },
          ]}
          onPress={pickDocument}
          activeOpacity={0.7}
        >
          <Ionicons
            name={getAssetIcon(typeLabel)}
            size={20}
            color={colors.textTertiary}
          />
          <Text style={[assetStyles.pickText, { color: colors.textTertiary }]}>
            Select {typeLabel}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

function getAssetIcon(type: string): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case "document":
      return "document-text-outline";
    case "file":
      return "document-outline";
    case "folder":
      return "folder-outline";
    case "workflow":
      return "git-branch-outline";
    case "font":
      return "text-outline";
    case "dataframe":
      return "grid-outline";
    case "collection":
      return "albums-outline";
    case "model_3d":
      return "cube-outline";
    default:
      return "ellipse-outline";
  }
}

const assetStyles = StyleSheet.create({
  container: {},
  refRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
  },
  refText: {
    flex: 1,
    fontSize: 14,
  },
  pickButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  pickText: { fontSize: 14 },
});

// ── Main PropertyField ──────────────────────────────────────────────

export const PropertyField: React.FC<PropertyFieldProps> = ({
  property,
  value,
  nodeType,
  onChange,
  isConnected = false,
}) => {
  const { colors } = useTheme();
  const widget = resolveWidgetType(property);

  return (
    <View style={styles.fieldContainer}>
      {/* Label row */}
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: colors.text }]}>
          {property.title ?? property.name}
        </Text>
        {property.required && (
          <Text style={[styles.required, { color: colors.error }]}>*</Text>
        )}
        {isConnected && (
          <View
            style={[
              styles.connectedBadge,
              { backgroundColor: colors.accentMuted },
            ]}
          >
            <Text style={[styles.connectedBadgeText, { color: colors.accent }]}>
              connected
            </Text>
          </View>
        )}
      </View>

      {/* Description */}
      {property.description && !isConnected ? (
        <Text
          style={[styles.description, { color: colors.textTertiary }]}
          numberOfLines={2}
        >
          {property.description}
        </Text>
      ) : null}

      {/* Connected placeholder or input widget */}
      {isConnected ? (
        <View
          style={[
            styles.connectedPlaceholder,
            {
              backgroundColor: colors.accentMuted,
              borderColor: colors.accent + "30",
            },
          ]}
        >
          <Text
            style={[
              styles.connectedPlaceholderText,
              { color: colors.accent },
            ]}
          >
            Value provided by previous node
          </Text>
        </View>
      ) : (
        <WidgetRenderer
          widget={widget}
          property={property}
          value={value}
          onChange={onChange}
          colors={colors}
        />
      )}
    </View>
  );
};

/** Renders the appropriate widget for the resolved type */
const WidgetRenderer: React.FC<{
  widget: WidgetType;
  property: Property;
  value: unknown;
  onChange: (v: unknown) => void;
  colors: ThemeColors;
}> = ({ widget, property, value, onChange, colors }) => {
  switch (widget) {
    case "string":
      return <StringWidget prop={property} value={value} onChange={onChange} colors={colors} />;
    case "text":
      return <StringWidget prop={property} value={value} onChange={onChange} colors={colors} multiline />;
    case "integer":
      return <IntegerWidget prop={property} value={value} onChange={onChange} colors={colors} />;
    case "float":
      return <FloatWidget prop={property} value={value} onChange={onChange} colors={colors} />;
    case "boolean":
      return <BoolWidget value={value} onChange={onChange} colors={colors} />;
    case "enum":
      return <EnumWidget prop={property} value={value} onChange={onChange} colors={colors} />;
    case "image":
      return <ImageWidget prop={property} value={value} onChange={onChange} colors={colors} />;
    case "audio":
      return <AudioWidget prop={property} value={value} onChange={onChange} colors={colors} />;
    case "video":
      return <VideoWidget prop={property} value={value} onChange={onChange} colors={colors} />;
    case "color":
      return <ColorWidget value={value} onChange={onChange} colors={colors} />;
    case "image_size":
      return <ImageSizeWidget value={value} onChange={onChange} colors={colors} />;
    case "json":
      return <JSONWidget prop={property} value={value} onChange={onChange} colors={colors} />;
    case "dict":
      return <DictWidget value={value} onChange={onChange} colors={colors} />;
    case "string_list":
      return <StringListWidget value={value} onChange={onChange} colors={colors} />;
    case "list":
      return <ListWidget prop={property} value={value} onChange={onChange} colors={colors} />;
    case "file_path":
      return <FilePathWidget prop={property} value={value} onChange={onChange} colors={colors} />;
    case "folder_path":
      return <FilePathWidget prop={property} value={value} onChange={onChange} colors={colors} isFolder />;
    case "model":
      return <ModelWidget prop={property} value={value} onChange={onChange} colors={colors} />;
    case "asset_ref":
      return <AssetRefWidget prop={property} value={value} onChange={onChange} colors={colors} />;
    case "unsupported":
      return (
        <Text style={[styles.unsupported, { color: colors.textTertiary }]}>
          {property.type.type} (not editable on mobile)
        </Text>
      );
  }
};

// ── Shared styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  fieldContainer: {
    gap: 4,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
  },
  required: {
    fontSize: 14,
    fontWeight: "700",
  },
  description: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 4,
  },
  connectedBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  connectedBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  connectedPlaceholder: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  connectedPlaceholderText: {
    fontSize: 13,
    fontStyle: "italic",
  },
  textInput: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 15,
    minHeight: 44,
  },
  textInputMultiline: {
    minHeight: 88,
    textAlignVertical: "top",
  },
  numberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  numberInput: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 15,
    minHeight: 44,
  },
  rangeHint: {
    fontSize: 12,
  },
  enumScroll: {
    marginHorizontal: -2,
  },
  enumContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  enumOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  enumText: {
    fontSize: 13,
    fontWeight: "500",
  },
  mediaContainer: {},
  mediaDropzone: {
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 24,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: "dashed",
  },
  mediaDropzoneText: {
    fontSize: 14,
  },
  mediaPreviewRow: {
    flexDirection: "row",
    gap: 10,
  },
  mediaPreview: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 1,
  },
  mediaActions: {
    flex: 1,
    justifyContent: "center",
    gap: 6,
  },
  mediaButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  mediaButtonText: {
    fontSize: 13,
  },
  mediaFileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  mediaFileName: {
    flex: 1,
    fontSize: 14,
  },
  unsupported: {
    fontSize: 13,
    fontStyle: "italic",
    paddingVertical: 8,
  },
});
