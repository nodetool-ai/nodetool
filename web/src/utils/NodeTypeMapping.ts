import { TypeName } from "../stores/ApiTypes";

/**
 * Maps content types (MIME types) to internal node types
 */
export const contentTypeToNodeType = (contentType: string): TypeName | null => {
  switch (contentType) {
    case "application/json":
    case "text/plain":
      return "text";
    case "text/csv":
      return "dataframe";
    case "image/png":
    case "image/jpeg":
    case "image/gif":
    case "image/webp":
      return "image";
    case "video/mp4":
    case "video/mpeg":
    case "video/ogg":
    case "video/webm":
      return "video";
    case "audio/mpeg":
    case "audio/ogg":
    case "audio/wav":
    case "audio/webm":
    case "audio/mp3":
      return "audio";
    case "application/pdf":
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return "document";
    // internal asset types
    case "folder":
      return "folder";
    default:
      return null;
  }
};

/**
 * Maps internal types to input node types
 */
export const inputForType = (type: TypeName) => {
  switch (type) {
    case "str":
      return "nodetool.input.StringInput";
    case "dataframe":
      return "nodetool.input.DataFrameInput";
    case "int":
      return "nodetool.input.IntegerInput";
    case "float":
      return "nodetool.input.FloatInput";
    case "bool":
      return "nodetool.input.BooleanInput";
    case "image":
      return "nodetool.input.ImageInput";
    case "video":
      return "nodetool.input.VideoInput";
    case "audio":
      return "nodetool.input.AudioInput";
    case "document":
      return "nodetool.input.DocumentInput";
    default:
      return null;
  }
};

/**
 * Maps internal types to output node types
 */
export const outputForType = (type: TypeName) => {
  switch (type) {
    case "str":
      return "nodetool.output.StringOutput";
    case "text":
      return "nodetool.output.TextOutput";
    case "int":
      return "nodetool.output.IntegerOutput";
    case "float":
      return "nodetool.output.FloatOutput";
    case "bool":
      return "nodetool.output.BooleanOutput";
    case "image":
      return "nodetool.output.ImageOutput";
    case "video":
      return "nodetool.output.VideoOutput";
    case "audio":
      return "nodetool.output.AudioOutput";
    case "dataframe":
      return "nodetool.output.DataFrameOutput";
    case "tensor":
      return "nodetool.output.TensorOutput";
    case "document":
      return "nodetool.output.DocumentOutput";
    default:
      return null;
  }
};

/**
 * Maps internal types to constant/input node types for drag and drop
 */
export const constantForType = (type: TypeName) => {
  switch (type) {
    case "str":
      return "nodetool.constant.String";
    case "text":
      return "nodetool.constant.Text";
    case "dataframe":
      return "nodetool.dataframe.Dataframe";
    case "int":
      return "nodetool.constant.Integer";
    case "float":
      return "nodetool.constant.Float";
    case "bool":
      return "nodetool.constant.Boolean";
    case "image":
      return "nodetool.constant.Image";
    case "video":
      return "nodetool.constant.Video";
    case "audio":
      return "nodetool.constant.Audio";
    case "list":
      return "nodetool.constant.List";
    case "folder":
      return "nodetool.input.Folder";
    case "document":
      return "nodetool.constant.Document";
    default:
      return null;
  }
};
