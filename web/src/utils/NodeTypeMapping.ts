import { TypeName } from "../stores/ApiTypes";

/**
 * Maps content types (MIME types) to internal node types
 */
export const contentTypeToNodeType = (contentType: string): TypeName | null => {
  switch (contentType) {
    case "application/json":
    case "text/plain":
    case "text/html":
    case "text/markdown":
    case "text/xml":
    case "application/xml":
    case "text/javascript":
    case "application/javascript":
    case "text/css":
      return "text";
    case "text/csv":
    case "application/vnd.ms-excel.sheet.macroEnabled.12":
    case "application/x-yaml":
    case "text/x-yaml":
    case "application/x-parquet":
    case "application/x-hdf5":
      return "dataframe";
    case "image/png":
    case "image/jpeg":
    case "image/gif":
    case "image/webp":
    case "image/svg+xml":
    case "image/tiff":
    case "image/bmp":
    case "image/x-icon":
    case "image/heic":
    case "image/heif":
      return "image";
    case "video/mp4":
    case "video/mpeg":
    case "video/ogg":
    case "video/webm":
    case "video/quicktime":
    case "video/x-msvideo":
    case "video/x-matroska":
    case "video/3gpp":
    case "video/3gpp2":
      return "video";
    case "audio/mpeg":
    case "audio/ogg":
    case "audio/wav":
    case "audio/webm":
    case "audio/mp3":
    case "audio/aac":
    case "audio/midi":
    case "audio/x-midi":
    case "audio/flac":
    case "audio/x-m4a":
      return "audio";
    case "application/pdf":
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/msword":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    case "application/vnd.ms-excel":
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    case "application/vnd.ms-powerpoint":
    case "application/vnd.oasis.opendocument.text":
    case "application/vnd.oasis.opendocument.spreadsheet":
    case "application/vnd.oasis.opendocument.presentation":
    case "application/rtf":
    case "application/x-tex":
    case "application/epub+zip":
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
