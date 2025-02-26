/** @jsxImportSource @emotion/react */
import React, { useMemo, useRef, useEffect, memo, createElement } from "react";
import { css } from "@emotion/react";

import MarkdownRenderer from "./MarkdownRenderer";
import AudioPlayer from "./AudioPlayer";
import { isEqual } from "lodash";
import ImageView from "./ImageView";
import ArrayView from "./ArrayView";
import { NPArray } from "../types";

export type OutputRendererProps = {
  value: any;
};
/**
 * Converts a Uint8Array to a Base64 encoded string.
 *
 * @param {Uint8Array} uint8Array - The Uint8Array to be converted to Base64.
 * @returns {string} The Base64 encoded string representation of the input.
 * @throws {Error} If the conversion process fails.
 */
export function uint8ArrayToBase64(uint8Array: Uint8Array): string {
  try {
    const numberArray = Array.from(uint8Array);
    const binaryString = numberArray.reduce(
      (str, byte) => str + String.fromCharCode(byte),
      ""
    );
    return btoa(binaryString);
  } catch (error) {
    console.error("Error converting Uint8Array to Base64:", error);
    throw new Error("Failed to convert Uint8Array to Base64");
  }
}

/**
 * Creates a data URI from a Uint8Array.
 *
 * This function takes a Uint8Array and a MIME type, and returns a data URI
 * that can be used to embed the binary data directly in web pages or CSS.
 *
 * @param {Uint8Array} uint8Array - The Uint8Array to be converted to a data URI.
 * @param {string} mimeType - The MIME type of the binary data (e.g., 'image/jpeg', 'application/pdf').
 * @returns {string} The data URI representing the input Uint8Array.
 * @throws {Error} If the conversion process fails.
 *
 * @example
 * const pdfData = new Uint8Array([...]); // PDF file data
 * const dataUri = uint8ArrayToDataUri(pdfData, 'application/pdf');
 * console.log(dataUri); // Outputs: data:application/pdf;base64,JVBERi0xLjQKJc...
 */
export function uint8ArrayToDataUri(
  uint8Array: Uint8Array,
  mimeType: string
): string {
  try {
    const base64 = uint8ArrayToBase64(uint8Array);
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.error("Error creating data URI:", error);
    throw new Error("Failed to create data URI");
  }
}
const convertStyleStringToObject = (
  styleString: string
): React.CSSProperties => {
  if (!styleString) return {};
  return styleString
    .split(";")
    .filter((style) => style.trim())
    .reduce((acc, style) => {
      const [property, value] = style.split(":").map((str) => str.trim());
      // Convert kebab-case to camelCase
      const camelProperty = property.replace(/-([a-z])/g, (g) =>
        g[1].toUpperCase()
      );
      return { ...acc, [camelProperty]: value };
    }, {});
};

interface SVGElement {
  /**
   * Type
   * @default svg_element
   * @constant
   * @enum {string}
   */
  type: "svg_element";
  /**
   * Name
   * @default
   */
  name: string;
  /**
   * Attributes
   * @default {}
   */
  attributes: {
    [key: string]: string;
  };
  /** Content */
  content?: string | null;
  /** Children */
  children?: SVGElement[];
}

const renderSvgElement = (value: SVGElement): React.ReactElement => {
  const attributes = value.attributes || {};

  // Convert style string to object if present
  const style = attributes.style
    ? convertStyleStringToObject(attributes.style)
    : undefined;

  // Create props object from attributes
  const svgProps = {
    ...value.attributes,
    // Ensure React-compatible attribute names
    className: attributes.class,
    xmlSpace: attributes["xml:space"],
    xmlLang: attributes["xml:lang"],
    style, // Override style with converted object
  };

  // Recursively render children
  const children = [
    // Add text content if present
    value.content && value.content,
    // Render child SVG elements
    ...(value.children || []).map(renderSvgElement),
  ].filter(Boolean);

  return createElement(value.name || "svg", svgProps, ...children);
};

const renderSVGDocument = (value: SVGElement[]): React.ReactElement => {
  // Extract SVG document attributes
  const docAttributes = {
    xmlns: "http://www.w3.org/2000/svg",
    version: "1.1",
    width: "100%",
    height: "100%",
  };
  const children = value.map(renderSvgElement);

  // Render the root SVG element and its children
  return createElement("svg", docAttributes, ...children);
};

const styles = (theme: any) =>
  css({
    "&": {
      backgroundColor: theme.palette.c_gray2,
      height: "100%",
      width: "100%",
      padding: ".25em",
      overflow: "auto",
      userSelect: "text",
      cursor: "text",
    },
    ".content": {
      flex: 1,
      overflowY: "auto",
      overflowX: "hidden",
    },
    p: {
      margin: "0",
      padding: ".25em",
      wordWrap: "break-word",
      overflowWrap: "break-word",
    },
    ul: {
      margin: "0",
      padding: ".1em 1.75em",
      listStyleType: "square",
    },
    li: {
      margin: "0",
      padding: ".1em .25em",
    },
    pre: {
      margin: "0",
      padding: ".25em",
      backgroundColor: theme.palette.c_gray0,
      width: "100%",
      overflowX: "scroll",
    },
    code: {
      fontFamily: theme.fontFamily2,
    },
    ".actions": {
      position: "absolute",
      maxWidth: "50%",
      left: "5.5em",
      bottom: ".1em",
      top: "unset",
      padding: "0",
      margin: "0",
      display: "flex",
      flexDirection: "row",
      gap: "0.5em",
      zIndex: 10,
    },
    ".actions button": {
      minWidth: "unset",
      width: "auto",
      lineHeight: "1.5em",
      padding: ".3em .3em 0 .3em",
      color: theme.palette.c_gray5,
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmall,
    },
  });

const typeFor = (value: any): string => {
  if (value === undefined || value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  if (typeof value === "boolean") {
    return "boolean";
  }
  if (typeof value === "object" && "type" in value) {
    return value.type;
  }
  return typeof value;
};

const OutputRenderer: React.FC<OutputRendererProps> = ({ value }) => {
  const type = useMemo(() => typeFor(value), [value]);

  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (type === "video" && videoRef.current) {
      if (value?.uri === "") {
        const blob = new Blob([value?.data], { type: "video/mp4" });
        const url = URL.createObjectURL(blob);
        videoRef.current.src = url;
        return () => URL.revokeObjectURL(url);
      } else {
        videoRef.current.src = value?.uri;
      }
    }
  }, [type, value]);

  const renderContent = useMemo(() => {
    function renderArrayPreview(array: NPArray): React.ReactNode {
      return <ArrayView array={array} />;
    }
    switch (type) {
      case "image":
        if (Array.isArray(value.data)) {
          return value.data.map((v: any, i: number) => (
            <ImageView key={i} source={v} />
          ));
        } else {
          return (
            <ImageView source={value?.uri === "" ? value?.data : value?.uri} />
          );
        }
      case "audio":
        return (
          <div className="audio" style={{ padding: "1em" }}>
            <AudioPlayer
              source={value?.uri === "" ? value?.data : value?.uri}
            />
          </div>
        );
      case "video":
        return <video ref={videoRef} controls style={{ width: "100%" }} />;
      case "dataframe":
        return <div>Dataframe not implemented</div>;
      case "np_array":
        return (
          <div className="tensor nodrag">
            {renderArrayPreview(value as NPArray)}
          </div>
        );
      case "object":
        return <pre>{JSON.stringify(value, null, 2)}</pre>;
      case "array":
        return <pre>{JSON.stringify(value, null, 2)}</pre>;
      case "segmentation_result":
        return (
          <div>
            {Object.entries(value).map((v: any) => (
              <OutputRenderer key={v[0]} value={v[1]} />
            ))}
          </div>
        );
      case "classification_result":
        return (
          <div>
            {value["label"]}: {value["score"]}
          </div>
        );
      case "svg_element":
        return renderSVGDocument([value]);
      case "boolean": {
        const boolStr = String(value).toUpperCase();
        return <pre>{boolStr}</pre>;
      }
      case "email":
        return (
          <div css={styles}>
            <div className="email-header">
              <p>
                <strong>From:</strong> {value.sender}
              </p>
              <p>
                <strong>To:</strong> {value.to}
              </p>
              {value.cc && (
                <p>
                  <strong>CC:</strong> {value.cc}
                </p>
              )}
              <p>
                <strong>Subject:</strong> {value.subject}
              </p>
            </div>
            <div className="email-body">
              <MarkdownRenderer content={value.body} />
            </div>
          </div>
        );
      default:
        return <MarkdownRenderer content={value?.toString()} />;
    }
  }, [value, type]);

  return renderContent;
};

export default memo(OutputRenderer, isEqual);
