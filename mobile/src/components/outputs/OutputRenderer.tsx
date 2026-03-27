import React, { useState } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  Platform,
  Modal,
  TouchableOpacity,
  Dimensions,
  StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import SyntaxHighlighter from "react-native-syntax-highlighter";
import {
  atomDark,
  tomorrow,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import MarkdownRenderer from "../../utils/MarkdownRenderer";
import { useTheme } from "../../hooks/useTheme";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

type OutputRendererProps = {
  value: any;
};

// Simple helper to detect type - can be expanded based on ApiTypes from web
const getType = (value: any): string => {
  if (value === null || value === undefined) {return "null";}
  if (typeof value === "string") {return "string";}
  if (typeof value === "number") {return "number";}
  if (typeof value === "boolean") {return "boolean";}
  if (Array.isArray(value)) {return "array";}
  if (typeof value === "object") {
    if (value.type === "image") {return "image";}
    if (value.type === "audio") {return "audio";}
    return "object";
  }
  return "unknown";
};

export const OutputRenderer = ({ value }: OutputRendererProps) => {
  const type = getType(value);
  const { colors, mode } = useTheme();
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

  if (value === null || value === undefined) {
    return null;
  }

  const codeTheme = mode === "dark" ? atomDark : tomorrow;

  const getImageUri = (src: string) =>
    src.startsWith("http") || src.startsWith("data:")
      ? src
      : `data:image/png;base64,${src}`;

  const renderFullscreenViewer = () => (
    <Modal
      visible={!!fullscreenImage}
      transparent
      animationType="fade"
      onRequestClose={() => setFullscreenImage(null)}
      statusBarTranslucent
    >
      <View style={styles.fullscreenOverlay}>
        <StatusBar hidden />
        <TouchableOpacity
          style={styles.fullscreenClose}
          onPress={() => setFullscreenImage(null)}
          accessibilityLabel="Close image"
        >
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
        {fullscreenImage && (
          <Image
            source={{ uri: fullscreenImage }}
            style={styles.fullscreenImage}
            resizeMode="contain"
          />
        )}
      </View>
    </Modal>
  );

  switch (type) {
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
          {value ? "True" : "False"}
        </Text>
      );
    case "image":
      if (Array.isArray(value?.data)) {
        return (
          <View style={styles.container}>
            {value.data.map((v: any, i: number) => (
              <View
                key={i}
                style={[styles.arrayItem, { borderLeftColor: colors.border }]}
              >
                <OutputRenderer value={v} />
              </View>
            ))}
          </View>
        );
      }

      const source = value?.uri || value?.data;
      if (!source)
        {return (
          <Text style={[styles.error, { color: colors.error }]}>
            Invalid Image Data
          </Text>
        );}

      if (typeof source === "string") {
        const uri = getImageUri(source);
        return (
          <>
            {renderFullscreenViewer()}
            <TouchableOpacity
              onPress={() => setFullscreenImage(uri)}
              activeOpacity={0.8}
              accessibilityLabel="Tap to view full screen"
            >
              <Image
                source={{ uri }}
                style={[styles.image, { backgroundColor: colors.inputBg }]}
                resizeMode="contain"
              />
              <View style={styles.imageOverlayHint}>
                <Ionicons name="expand-outline" size={16} color="rgba(255,255,255,0.8)" />
              </View>
            </TouchableOpacity>
          </>
        );
      }

      return (
        <Text style={[styles.placeholder, { color: colors.textSecondary }]}>
          [Unsupported image format: {typeof source}]
        </Text>
      );
    case "audio":
      return (
        <Text style={[styles.placeholder, { color: colors.textSecondary }]}>
          [Audio Output: {value?.uri || "Data"}]
        </Text>
      );
    case "array":
      return (
        <View style={styles.container}>
          {value.map((item: any, index: number) => (
            <View
              key={index}
              style={[styles.arrayItem, { borderLeftColor: colors.border }]}
            >
              <OutputRenderer value={item} />
            </View>
          ))}
        </View>
      );
    case "object":
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
              fontFamily={Platform.OS === "ios" ? "Menlo" : "monospace"}
              PreTag={View}
              CodeTag={View}
            >
              {JSON.stringify(value, null, 2)}
            </SyntaxHighlighter>
          </ScrollView>
        </View>
      );
    default:
      return (
        <Text style={[styles.text, { color: colors.text }]}>
          {String(value)}
        </Text>
      );
  }
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
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
  imageOverlayHint: {
    position: "absolute",
    bottom: 16,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: 12,
    padding: 4,
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
  codeBlock: {
    padding: 12,
    borderRadius: 8,
    maxHeight: 300,
    borderWidth: 1,
    marginVertical: 4,
  },
  fullscreenOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  fullscreenClose: {
    position: "absolute",
    top: 50,
    right: 20,
    zIndex: 10,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 20,
    padding: 8,
  },
  fullscreenImage: {
    width: SCREEN_W,
    height: SCREEN_H * 0.8,
  },
});
