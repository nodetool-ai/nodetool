import type { ComponentType } from "react";
import { Property } from "../../stores/ApiTypes";
import reduceUnionType from "../../hooks/reduceUnionType";
import StringProperty from "../properties/StringProperty";
import TextProperty from "../properties/TextProperty";
import ImageProperty from "../properties/ImageProperty";
import AudioProperty from "../properties/AudioProperty";
import VideoProperty from "../properties/VideoProperty";
import Model3DProperty from "../properties/Model3DProperty";
import IntegerProperty from "../properties/IntegerProperty";
import FloatProperty from "../properties/FloatProperty";
import EnumProperty from "../properties/EnumProperty";
import BoolProperty from "../properties/BoolProperty";
import ListProperty from "../properties/ListProperty";
import FileProperty from "../properties/FileProperty";
import AssetProperty from "../properties/AssetProperty";
import FolderProperty from "../properties/FolderProperty";
import WorkflowProperty from "../properties/WorkflowProperty";
import WorkflowListProperty from "../properties/WorkflowListProperty";
import ToolsListProperty from "../properties/ToolsListProperty";
import DataframeProperty from "../properties/DataframeProperty";
import DictProperty from "../properties/DictProperty";
import RecordTypeProperty from "../properties/RecordTypeProperty";
import ModelProperty from "../properties/ModelProperty";
import ColorProperty from "../properties/ColorProperty";
import FilePathProperty from "../properties/FilePathProperty";
import CollectionProperty from "../properties/CollectionProperty";
import FolderPathProperty from "../properties/FolderPathProperty";
import DocumentProperty from "../properties/DocumentProperty";
import FontProperty from "../properties/FontProperty";
import SelectProperty from "../properties/SelectProperty";
import ImageSizeProperty from "../properties/ImageSizeProperty";
import JSONProperty from "../properties/JSONProperty";
import StringListProperty from "../properties/StringListProperty";
import ImageListProperty from "../properties/ImageListProperty";
import VideoListProperty from "../properties/VideoListProperty";
import AudioListProperty from "../properties/AudioListProperty";
import TextListProperty from "../properties/TextListProperty";
import InferenceProviderModelSelect from "../properties/InferenceProviderModelSelect";
import {
  MediaAspectRatioImageProperty,
  MediaAspectRatioVideoProperty,
  MediaResolutionImageProperty,
  MediaResolutionVideoProperty,
  MediaDurationProperty,
  MediaStrengthProperty
} from "../properties/MediaPickerProperties";
import { InputProperty } from "./InputProperty";
import type { PropertyProps } from "./PropertyInput.types";

export function getComponentForProperty(
  property: Property
): ComponentType<PropertyProps> {
  // Dynamic schemas (e.g. FalAI) may attach `values` or `enum` directly to the
  // property object rather than inside `property.type`.
  const propertyWithExtras = property as Property & {
    values?: (string | number)[];
    enum?: (string | number)[];
  };

  // Explicit `json_schema_extra.type` opts into a custom renderer regardless
  // of base type or attached enum values (e.g. media_aspect_ratio_image
  // wants the chip-style picker even though `values` is set).
  if (typeof property.json_schema_extra?.type === "string") {
    const overrideComponent = customComponentForType(
      property.json_schema_extra.type
    );
    if (overrideComponent) {
      return overrideComponent;
    }
  }

  // If property has predefined values, treat it as an enum/select
  // regardless of base type (often comes as 'str' from dynamic schemas)
  const hasValues = (property.type.values && property.type.values.length > 0) ||
                    (property.type.type_args?.[0]?.values && property.type.type_args[0].values.length > 0) ||
                    (propertyWithExtras.values && propertyWithExtras.values.length > 0) ||
                    (propertyWithExtras.enum && propertyWithExtras.enum.length > 0);

  if (hasValues) {
    return EnumProperty;
  }

  if (typeof property.json_schema_extra?.type === "string") {
    return componentForType(property.json_schema_extra.type);
  }

  switch (property.type.type) {
    case "union":
      return handleUnionType(property);
    case "list":
      return handleListType(property);
    default:
      return componentForType(property.type.type);
  }
}

function customComponentForType(
  type: string
): ComponentType<PropertyProps> | null {
  switch (type) {
    case "media_aspect_ratio_image":
      return MediaAspectRatioImageProperty;
    case "media_aspect_ratio_video":
      return MediaAspectRatioVideoProperty;
    case "media_resolution_image":
      return MediaResolutionImageProperty;
    case "media_resolution_video":
      return MediaResolutionVideoProperty;
    case "media_duration":
      return MediaDurationProperty;
    case "media_strength":
      return MediaStrengthProperty;
    default:
      return null;
  }
}

function componentForType(type: string): ComponentType<PropertyProps> {
  switch (type) {
    case "str":
      return StringProperty;
    case "text":
      return TextProperty;
    case "int":
      return IntegerProperty;
    case "float":
      return FloatProperty;
    case "bool":
      return BoolProperty;
    case "dict":
      return DictProperty;
    case "color":
      return ColorProperty;
    case "image":
      return ImageProperty;
    case "image_size":
      return ImageSizeProperty;
    case "image_list":
      return ImageListProperty;
    case "video_list":
      return VideoListProperty;
    case "audio_list":
      return AudioListProperty;
    case "text_list":
      return TextListProperty;
    case "audio":
      return AudioProperty;
    case "video":
      return VideoProperty;
    case "model_3d":
      return Model3DProperty;
    case "collection":
      return CollectionProperty;
    case "json":
      return JSONProperty;
    case "document":
      return DocumentProperty;
    case "enum":
      return EnumProperty;
    case "file":
      return FileProperty;
    case "file_path":
      return FilePathProperty;
    case "folder_path":
      return FolderPathProperty;
    case "folder":
      return FolderProperty;
    case "asset":
      return AssetProperty;
    case "select":
      return SelectProperty;
    case "workflow":
      return WorkflowProperty;
    case "dataframe":
      return DataframeProperty;
    case "record_type":
      return RecordTypeProperty;
    case "font":
      return FontProperty;
    case "inference_provider_automatic_speech_recognition_model":
    case "inference_provider_audio_classification_model":
    case "inference_provider_image_classification_model":
    case "inference_provider_text_classification_model":
    case "inference_provider_summarization_model":
    case "inference_provider_text_to_image_model":
    case "inference_provider_translation_model":
    case "inference_provider_text_to_text_model":
    case "inference_provider_text_to_speech_model":
    case "inference_provider_text_to_audio_model":
    case "inference_provider_text_generation_model":
    case "inference_provider_image_to_image_model":
    case "inference_provider_image_segmentation_model":
      return InferenceProviderModelSelect;
    default:
      return handleModelTypes(type);
  }
}

function handleUnionType(
  property: Property
): ComponentType<PropertyProps> {
  const reducedType = reduceUnionType(property.type);
  return getComponentForProperty({
    ...property,
    type: {
      ...property.type,
      type: reducedType,
    }
  });
}

function handleListType(
  property: Property
): ComponentType<PropertyProps> {
  const type_args = property.type?.type_args;
  if (type_args && type_args.length > 0) {
    switch (type_args[0].type) {
      case "workflow":
        return WorkflowListProperty;
      case "tool_name":
        return ToolsListProperty;
      case "str":
        return StringListProperty;
      case "image":
        return ImageListProperty;
      case "video":
        return VideoListProperty;
      case "audio":
        return AudioListProperty;
      case "text":
        return TextListProperty;
    }
  }
  return ListProperty;
}

function handleModelTypes(type: string): ComponentType<PropertyProps> {
  const modelPrefixes = ["hf.", "tjs."];

  if (type.endsWith("_model")) {
    return ModelProperty;
  }

  for (const prefix of modelPrefixes) {
    if (type.startsWith(prefix)) {
      return ModelProperty;
    }
  }

  return InputProperty;
}
