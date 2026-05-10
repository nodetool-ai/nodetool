import React, { useMemo } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  Platform,
  Linking,
  TouchableOpacity,
} from "react-native";
import { Video, ResizeMode } from "expo-av";
import SyntaxHighlighter from "react-native-syntax-highlighter";
import {
  atomDark,
  tomorrow,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import MarkdownRenderer from "../../utils/MarkdownRenderer";
import { useTheme } from "../../hooks/useTheme";
import type { ThemeColors } from "../../utils/theme";
import { apiService } from "../../services/api";

interface TypedValue {
  type: string;
  [key: string]: unknown;
}

interface TaskStep {
  description?: string;
  title?: string;
}

interface DataframeColumn {
  name?: string;
}

type OutputRendererProps = {
  value: unknown;
};

/**
 * Type detection matching web's typeFor() from output/types.ts.
 * Returns the discriminated `type` field for typed objects,
 * falls back to typeof for primitives.
 */
const typeFor = (value: unknown): string => {
  if (value === undefined || value === null) {return "null";}
  if (Array.isArray(value)) {return "array";}
  if (typeof value === "boolean") {return "boolean";}
  if (typeof value === "object" && value !== null && "type" in value) {
    return (value as { type: string }).type;
  }
  return typeof value;
};

/**
 * Resolve a media URI — handles relative paths, data URIs, and absolute URLs.
 */
const resolveMediaUri = (
  uri: string | undefined | null
): string | null => {
  if (!uri || uri.startsWith("memory://")) {return null;}
  if (uri.startsWith("data:")) {return uri;}
  return apiService.resolveUrl(uri);
};

/**
 * Format a Datetime object (month is 1-indexed from the API).
 */
const formatDatetime = (dt: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}): string => {
  const date = new Date(dt.year, dt.month - 1, dt.day, dt.hour, dt.minute, dt.second);
  return date.toLocaleString();
};

export const OutputRenderer = ({ value }: OutputRendererProps) => {
  const type = useMemo(() => typeFor(value), [value]);
  const { colors, mode } = useTheme();
  const codeTheme = mode === "dark" ? atomDark : tomorrow;
  const monoFont = Platform.OS === "ios" ? "Menlo" : "monospace";

  if (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "") ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0)
  ) {
    return null;
  }

  // Typed views for property access in switch cases. typeFor() confirms
  // shape at runtime before the value enters each branch.
  const v = value as Record<string, unknown>;

  switch (type) {
    // ── Primitives ──────────────────────────────────────────────
    case "string":
      return <MarkdownRenderer content={value as string} />;

    case "number":
      return (
        <Text style={[styles.text, { color: colors.text }]}>
          {String(value)}
        </Text>
      );

    case "boolean":
      return (
        <Text style={[styles.text, { color: colors.text }]}>
          {String(value).toUpperCase()}
        </Text>
      );

    case "text": {
      const textVal = v.text ?? "";
      if (typeof textVal !== "string" || !textVal) {return null;}
      return <MarkdownRenderer content={textVal} />;
    }

    case "image": {
      if (Array.isArray(v.data)) {
        return (
          <View style={styles.container}>
            {(v.data as unknown[]).map((item: unknown, i: number) => (
              <View
                key={i}
                style={[styles.arrayItem, { borderLeftColor: colors.border }]}
              >
                <OutputRenderer value={item} />
              </View>
            ))}
          </View>
        );
      }

      const imgSource = v.uri || v.data;
      if (!imgSource) {
        return (
          <Text style={[styles.error, { color: colors.error }]}>
            Invalid Image Data
          </Text>
        );
      }

      if (typeof imgSource === "string") {
        const resolvedUri = imgSource.startsWith("data:")
          ? imgSource
          : resolveMediaUri(imgSource) ?? `data:image/png;base64,${imgSource}`;
        return (
          <Image
            source={{ uri: resolvedUri }}
            style={[styles.image, { backgroundColor: colors.inputBg }]}
            resizeMode="contain"
          />
        );
      }

      return (
        <Text style={[styles.placeholder, { color: colors.textSecondary }]}>
          [Unsupported image format]
        </Text>
      );
    }

    case "audio": {
      const audioUri = resolveMediaUri(v.uri as string | undefined);
      if (!audioUri) {
        return (
          <Text style={[styles.placeholder, { color: colors.textSecondary }]}>
            [Audio Output]
          </Text>
        );
      }
      return (
        <Video
          source={{ uri: audioUri }}
          style={styles.audioPlayer}
          useNativeControls
          resizeMode={ResizeMode.CONTAIN}
          isLooping={false}
        />
      );
    }

    case "video": {
      const videoUri = resolveMediaUri(v.uri as string | undefined);
      if (!videoUri) {
        return (
          <Text style={[styles.placeholder, { color: colors.textSecondary }]}>
            [Video Output]
          </Text>
        );
      }
      return (
        <Video
          source={{ uri: videoUri }}
          style={styles.video}
          useNativeControls
          resizeMode={ResizeMode.CONTAIN}
          isLooping={false}
        />
      );
    }

    case "html": {
      const htmlUri = resolveMediaUri(v.uri as string | undefined);
      if (htmlUri) {
        return (
          <TouchableOpacity
            style={[styles.linkButton, { borderColor: colors.border }]}
            onPress={() => Linking.openURL(htmlUri)}
          >
            <Text style={[styles.linkText, { color: colors.primary }]}>
              Open HTML content
            </Text>
          </TouchableOpacity>
        );
      }
      return (
        <Text style={[styles.placeholder, { color: colors.textSecondary }]}>
          [HTML Output]
        </Text>
      );
    }

    case "document": {
      const docUri = resolveMediaUri(v.uri as string | undefined);
      if (docUri) {
        return (
          <TouchableOpacity
            style={[styles.linkButton, { borderColor: colors.border }]}
            onPress={() => Linking.openURL(docUri)}
          >
            <Text style={[styles.linkText, { color: colors.primary }]}>
              Open document
            </Text>
          </TouchableOpacity>
        );
      }
      return renderJSON(v, codeTheme, colors, mode, monoFont);
    }

    case "datetime": {
      const formatted = formatDatetime(v as { year: number; month: number; day: number; hour: number; minute: number; second: number });
      return (
        <Text style={[styles.text, { color: colors.text }]}>
          {formatted}
        </Text>
      );
    }

    case "email":
      return (
        <View style={styles.container}>
          <View style={[styles.emailHeader, { borderBottomColor: colors.borderLight }]}>
            {!!v.sender && (
              <Text style={[styles.emailField, { color: colors.textSecondary }]}>
                <Text style={styles.emailLabel}>From: </Text>
                {String(v.sender)}
              </Text>
            )}
            {!!v.to && (
              <Text style={[styles.emailField, { color: colors.textSecondary }]}>
                <Text style={styles.emailLabel}>To: </Text>
                {String(v.to)}
              </Text>
            )}
            {!!v.cc && (
              <Text style={[styles.emailField, { color: colors.textSecondary }]}>
                <Text style={styles.emailLabel}>CC: </Text>
                {String(v.cc)}
              </Text>
            )}
            {!!v.subject && (
              <Text style={[styles.emailSubject, { color: colors.text }]}>
                {String(v.subject)}
              </Text>
            )}
          </View>
          {typeof v.body === "string" && <MarkdownRenderer content={v.body} />}
        </View>
      );

    case "task":
      return (
        <View style={styles.container}>
          {!!v.title && (
            <Text style={[styles.taskTitle, { color: colors.text }]}>
              {String(v.title)}
            </Text>
          )}
          {typeof v.description === "string" && (
            <MarkdownRenderer content={v.description} />
          )}
          {Array.isArray(v.steps) && v.steps.length > 0 && (
            <View style={styles.taskSteps}>
              {(v.steps as unknown[]).map((step: unknown, i: number) => {
                const s = step as string | TaskStep;
                return (
                <View key={i} style={styles.taskStep}>
                  <Text style={[styles.taskStepBullet, { color: colors.primary }]}>
                    {i + 1}.
                  </Text>
                  <Text style={[styles.taskStepText, { color: colors.text }]}>
                    {typeof s === "string" ? s : (s as TaskStep)?.description || (s as TaskStep)?.title || JSON.stringify(s)}
                  </Text>
                </View>
                );
              })}
            </View>
          )}
        </View>
      );

    // ── Task Plan ────────────────────────────────────────────────
    case "task_plan": {
      const tasks = Array.isArray(v.tasks) ? (v.tasks as unknown[]) : [];
      return (
        <View style={styles.container}>
          {!!v.title && (
            <Text style={[styles.taskTitle, { color: colors.text }]}>
              {String(v.title)}
            </Text>
          )}
          {tasks.map((task: unknown, i: number) => (
            <View
              key={i}
              style={[styles.arrayItem, { borderLeftColor: colors.primary }]}
            >
              <OutputRenderer value={{ ...(task as Record<string, unknown>), type: "task" }} />
            </View>
          ))}
        </View>
      );
    }

    // ── Calendar Event ───────────────────────────────────────────
    case "calendar_event":
      return (
        <View style={[styles.calendarEvent, { borderColor: colors.borderLight }]}>
          {!!v.title && (
            <Text style={[styles.calendarTitle, { color: colors.text }]}>
              {String(v.title)}
            </Text>
          )}
          {!!(v.start_date || v.start_time) && (
            <Text style={[styles.calendarMeta, { color: colors.textSecondary }]}>
              {String(v.start_date ?? "")}{v.start_time ? ` at ${String(v.start_time)}` : ""}
              {v.end_time ? ` – ${String(v.end_time)}` : ""}
            </Text>
          )}
          {!!v.location && (
            <Text style={[styles.calendarMeta, { color: colors.textSecondary }]}>
              📍 {String(v.location)}
            </Text>
          )}
          {typeof v.notes === "string" && <MarkdownRenderer content={v.notes} />}
        </View>
      );

    // ── Chunk ────────────────────────────────────────────────────
    case "chunk": {
      const contentType = v.content_type;

      if (contentType === "image") {
        return <OutputRenderer value={{ type: "image", uri: v.content }} />;
      }
      if (contentType === "video") {
        return <OutputRenderer value={{ type: "video", uri: v.content }} />;
      }
      if (contentType === "audio") {
        return <OutputRenderer value={{ type: "audio", uri: v.content }} />;
      }
      const chunkText = typeof v.content === "string" ? v.content : "";
      if (!chunkText) {return null;}
      return <MarkdownRenderer content={chunkText} />;
    }

    // ── Classification Result ────────────────────────────────────
    case "classification_result":
      return (
        <Text style={[styles.text, { color: colors.text }]}>
          {String(v.label)}: {typeof v.score === "number" ? v.score.toFixed(4) : String(v.score)}
        </Text>
      );

    // ── Segmentation Result ──────────────────────────────────────
    case "segmentation_result":
      return (
        <View style={styles.container}>
          {Object.entries(v)
            .filter(([k]) => k !== "type")
            .map(([key, val]) => (
              <View
                key={key}
                style={[styles.arrayItem, { borderLeftColor: colors.border }]}
              >
                <OutputRenderer value={val} />
              </View>
            ))}
        </View>
      );

    // ── Dataframe (table) ────────────────────────────────────────
    case "dataframe": {
      const columns = Array.isArray(v.columns) ? (v.columns as unknown[]) : [];
      const data = Array.isArray(v.data) ? (v.data as unknown[]) : [];
      if (columns.length === 0 || data.length === 0) {
        return renderJSON(v, codeTheme, colors, mode, monoFont);
      }
      return (
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View>
            {/* Header row */}
            <View style={[styles.tableRow, { backgroundColor: mode === "dark" ? "#2A2A2A" : "#E8E8E8" }]}>
              {columns.map((col, i) => {
                const c = col as string | DataframeColumn;
                return (
                <Text
                  key={i}
                  style={[
                    styles.tableCell,
                    styles.tableHeader,
                    { color: colors.text, borderColor: colors.border },
                  ]}
                  numberOfLines={1}
                >
                  {typeof c === "object" && c !== null ? String((c as DataframeColumn).name) : String(c)}
                </Text>
                );
              })}
            </View>
            {/* Data rows (limit to 50 for performance) */}
            {data.slice(0, 50).map((rawRow, rowIdx) => {
              const row = rawRow as unknown[] | Record<string, unknown>;
              return (
              <View
                key={rowIdx}
                style={[
                  styles.tableRow,
                  { backgroundColor: rowIdx % 2 === 0
                    ? (mode === "dark" ? "#1E1E1E" : "#F5F5F5")
                    : "transparent" },
                ]}
              >
                {(Array.isArray(row) ? row : Object.values(row as Record<string, unknown>)).map((cell: unknown, cellIdx: number) => (
                  <Text
                    key={cellIdx}
                    style={[styles.tableCell, { color: colors.text, borderColor: colors.border }]}
                    numberOfLines={2}
                  >
                    {cell == null ? "" : String(cell)}
                  </Text>
                ))}
              </View>
              );
            })}
            {data.length > 50 && (
              <Text style={[styles.placeholder, { color: colors.textSecondary, padding: 8 }]}>
                Showing 50 of {data.length} rows
              </Text>
            )}
          </View>
        </ScrollView>
      );
    }

    // ── NumPy Array / Tensor ─────────────────────────────────────
    case "np_array": {
      const shapeArr = Array.isArray(v.shape) ? (v.shape as unknown[]) : [];
      const shape = shapeArr.length > 0 ? shapeArr.join(" × ") : "unknown";
      const dtype = v.dtype || "float";
      const npData = Array.isArray(v.data) ? (v.data as unknown[]) : [];
      return (
        <View style={styles.container}>
          <Text style={[styles.tensorLabel, { color: colors.textSecondary }]}>
            Tensor: {shape} ({String(dtype)})
          </Text>
          {npData.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Text
                style={[
                  styles.tensorData,
                  {
                    color: colors.text,
                    backgroundColor: mode === "dark" ? "#1E1E1E" : "#F5F5F5",
                  },
                ]}
              >
                {JSON.stringify(
                  npData.length > 100 ? npData.slice(0, 100) : npData
                )}
                {npData.length > 100 ? " ..." : ""}
              </Text>
            </ScrollView>
          )}
        </View>
      );
    }

    // ── JSON (explicit type) ─────────────────────────────────────
    case "json":
      return renderJSON(v, codeTheme, colors, mode, monoFont);

    // ── Image Comparison ─────────────────────────────────────────
    case "image_comparison": {
      const imageA = v.image_a as Record<string, unknown> | undefined;
      const imageB = v.image_b as Record<string, unknown> | undefined;
      const imgA = resolveMediaUri(imageA?.uri as string | undefined);
      const imgB = resolveMediaUri(imageB?.uri as string | undefined);
      return (
        <View style={styles.comparisonContainer}>
          {imgA && (
            <Image
              source={{ uri: imgA }}
              style={[styles.comparisonImage, { backgroundColor: colors.inputBg }]}
              resizeMode="contain"
            />
          )}
          {imgB && (
            <Image
              source={{ uri: imgB }}
              style={[styles.comparisonImage, { backgroundColor: colors.inputBg }]}
              resizeMode="contain"
            />
          )}
        </View>
      );
    }

    // ── Array ────────────────────────────────────────────────────
    case "array": {
      const arr = value as unknown[];
      if (arr.length === 0) {return null;}

      const firstItem = arr[0];

      // Array of strings → list
      if (typeof firstItem === "string" && arr.every((item) => typeof item === "string")) {
        return (
          <View style={styles.container}>
            {(arr as string[]).map((item: string, i: number) => (
              <View
                key={i}
                style={[styles.listItem, { backgroundColor: mode === "dark" ? "#2A2A2A" : "#F0F0F0" }]}
              >
                <Text style={[styles.listItemText, { color: colors.text }]}>{item}</Text>
              </View>
            ))}
          </View>
        );
      }

      // Array of numbers → compact display
      if (typeof firstItem === "number") {
        return (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Text
              style={[
                styles.tensorData,
                {
                  color: colors.text,
                  backgroundColor: mode === "dark" ? "#1E1E1E" : "#F5F5F5",
                },
              ]}
            >
              [{(arr as number[]).slice(0, 100).join(", ")}
              {arr.length > 100 ? ", ..." : ""}]
            </Text>
          </ScrollView>
        );
      }

      // Array of typed objects
      if (typeof firstItem === "object" && firstItem !== null) {
        const first = firstItem as Record<string, unknown>;
        // Chunks
        if (first.type === "chunk") {
          const allText = (arr as TypedValue[]).every(
            (c) =>
              !c?.content_type ||
              c.content_type === "text" ||
              c.content_type === ""
          );
          if (allText) {
            const text = (arr as TypedValue[])
              .map((c) => (typeof c.content === "string" ? c.content : ""))
              .join("");
            return <MarkdownRenderer content={text} />;
          }
          // Mixed chunks: render each
          return (
            <View style={styles.container}>
              {arr.map((item: unknown, i: number) => (
                <OutputRenderer key={i} value={item} />
              ))}
            </View>
          );
        }

        // Array of images → grid
        if (first.type === "image") {
          return (
            <View style={styles.imageGrid}>
              {arr.map((item: unknown, i: number) => (
                <OutputRenderer key={i} value={item} />
              ))}
            </View>
          );
        }

        // Array of other typed objects (audio, video, etc.)
        if (typeof first.type === "string" && ["audio", "video", "html", "task"].includes(first.type)) {
          return (
            <View style={styles.container}>
              {arr.map((item: unknown, i: number) => (
                <OutputRenderer key={i} value={item} />
              ))}
            </View>
          );
        }

        // Array of plain objects → dataframe-like table
        if (!first.type) {
          const keys = Object.keys(first);
          if (keys.length > 0) {
            return (
              <ScrollView horizontal showsHorizontalScrollIndicator>
                <View>
                  <View style={[styles.tableRow, { backgroundColor: mode === "dark" ? "#2A2A2A" : "#E8E8E8" }]}>
                    {keys.map((k, i) => (
                      <Text
                        key={i}
                        style={[styles.tableCell, styles.tableHeader, { color: colors.text, borderColor: colors.border }]}
                        numberOfLines={1}
                      >
                        {k}
                      </Text>
                    ))}
                  </View>
                  {(arr as Record<string, unknown>[]).slice(0, 50).map((row, rowIdx: number) => (
                    <View
                      key={rowIdx}
                      style={[
                        styles.tableRow,
                        { backgroundColor: rowIdx % 2 === 0
                          ? (mode === "dark" ? "#1E1E1E" : "#F5F5F5")
                          : "transparent" },
                      ]}
                    >
                      {keys.map((k, cellIdx) => (
                        <Text
                          key={cellIdx}
                          style={[styles.tableCell, { color: colors.text, borderColor: colors.border }]}
                          numberOfLines={2}
                        >
                          {row[k] == null ? "" : String(row[k])}
                        </Text>
                      ))}
                    </View>
                  ))}
                  {arr.length > 50 && (
                    <Text style={[styles.placeholder, { color: colors.textSecondary, padding: 8 }]}>
                      Showing 50 of {arr.length} rows
                    </Text>
                  )}
                </View>
              </ScrollView>
            );
          }
        }
      }

      // Fallback: render each item recursively
      return (
        <View style={styles.container}>
          {arr.map((item: unknown, index: number) => (
            <View
              key={index}
              style={[styles.arrayItem, { borderLeftColor: colors.border }]}
            >
              <OutputRenderer value={item} />
            </View>
          ))}
        </View>
      );
    }

    // ── Object (generic, with key/value display) ─────────────────
    case "object": {
      const entries = Object.entries(v).filter(([k]) => k !== "type");

      // Single-key object: unwrap and render value directly
      if (entries.length === 1) {
        const [, singleVal] = entries[0];
        return <OutputRenderer value={singleVal} />;
      }

      // Multi-key object: sectioned key/value display
      return (
        <View style={styles.container}>
          {entries.map(([key, val]) => (
            <View
              key={key}
              style={[styles.objectEntry, { backgroundColor: mode === "dark" ? "#2A2A2A" : "#F0F0F0" }]}
            >
              <Text style={[styles.objectKey, { color: colors.primary }]}>
                {key.replace(/_/g, " ")}
              </Text>
              <View style={styles.objectValue}>
                <OutputRenderer value={val} />
              </View>
            </View>
          ))}
        </View>
      );
    }

    // ── Fallback ─────────────────────────────────────────────────
    default:
      if (value !== null && typeof value === "object") {
        return renderJSON(value, codeTheme, colors, mode, monoFont);
      }
      return (
        <Text style={[styles.text, { color: colors.text }]}>
          {typeof value === "string" ? value : String(value ?? "")}
        </Text>
      );
  }
};

/**
 * Render a value as syntax-highlighted JSON.
 */
function renderJSON(
  value: unknown,
  codeTheme: Record<string, unknown>,
  colors: ThemeColors,
  mode: string,
  monoFont: string
) {
  return (
    <View
      style={[
        styles.codeBlock,
        {
          backgroundColor: mode === "dark" ? "#1E1E1E" : "#F5F5F5",
          borderColor: colors.border,
        },
      ]}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <SyntaxHighlighter
          language="json"
          highlighter="prism"
          style={codeTheme}
          customStyle={{
            backgroundColor: "transparent",
            padding: 0,
            margin: 0,
          }}
          fontSize={12}
          fontFamily={monoFont}
          PreTag={View}
          CodeTag={View}
        >
          {JSON.stringify(value, null, 2)}
        </SyntaxHighlighter>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 4,
    gap: 8,
  },
  text: {
    fontSize: 16,
    marginBottom: 8,
  },
  error: {
    fontSize: 14,
  },
  image: {
    width: "100%",
    height: 200,
    borderRadius: 8,
    marginBottom: 8,
  },
  imageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  video: {
    width: "100%",
    height: 200,
    borderRadius: 8,
    marginBottom: 8,
  },
  audioPlayer: {
    width: "100%",
    height: 60,
    marginBottom: 8,
  },
  placeholder: {
    fontStyle: "italic",
    marginBottom: 8,
  },
  arrayItem: {
    marginBottom: 8,
    paddingLeft: 8,
    borderLeftWidth: 2,
  },
  listItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  listItemText: {
    fontSize: 14,
    lineHeight: 20,
  },
  codeBlock: {
    padding: 12,
    borderRadius: 8,
    maxHeight: 300,
    borderWidth: 1,
    marginVertical: 4,
  },
  linkButton: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    marginVertical: 4,
  },
  linkText: {
    fontSize: 14,
    fontWeight: "600",
  },
  // Email
  emailHeader: {
    paddingBottom: 8,
    marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  emailField: {
    fontSize: 13,
    lineHeight: 20,
  },
  emailLabel: {
    fontWeight: "700",
  },
  emailSubject: {
    fontSize: 16,
    fontWeight: "700",
    marginTop: 4,
  },
  // Task
  taskTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  taskSteps: {
    marginTop: 8,
    gap: 4,
  },
  taskStep: {
    flexDirection: "row",
    gap: 6,
  },
  taskStepBullet: {
    fontSize: 14,
    fontWeight: "700",
    width: 20,
  },
  taskStepText: {
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  // Calendar Event
  calendarEvent: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  calendarTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  calendarMeta: {
    fontSize: 13,
    lineHeight: 20,
  },
  // Table (dataframe)
  tableRow: {
    flexDirection: "row",
  },
  tableCell: {
    minWidth: 80,
    maxWidth: 160,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 12,
  },
  tableHeader: {
    fontWeight: "700",
    fontSize: 12,
  },
  // Tensor
  tensorLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 4,
  },
  tensorData: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 11,
    padding: 8,
    borderRadius: 6,
  },
  // Object renderer
  objectEntry: {
    borderRadius: 8,
    padding: 10,
    gap: 4,
  },
  objectKey: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "capitalize",
    letterSpacing: 0.3,
  },
  objectValue: {
    width: "100%",
  },
  // Comparison
  comparisonContainer: {
    flexDirection: "row",
    gap: 8,
  },
  comparisonImage: {
    flex: 1,
    height: 200,
    borderRadius: 8,
  },
});
