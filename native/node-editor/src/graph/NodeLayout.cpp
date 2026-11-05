#include "NodeLayout.h"
#include <QHash>

namespace nodetool {
QColor typeColor(const QString &type) {
  static const QHash<QString, QString> colors{
      {"any", "#6880A0"}, {"none", "#6880A0"}, {"notype", "#A7B1BF"},
      {"str", "#FFA808"}, {"text", "#FFA808"}, {"message", "#FFA808"}, {"thread", "#FFA808"},
      {"bool", "#0DD49A"}, {"float", "#18E0F8"}, {"image_size", "#18E0F8"},
      {"datetime", "#18E0F8"}, {"date", "#18E0F8"}, {"int", "#0891B2"},
      {"image", "#E838FF"}, {"entity", "#E838FF"}, {"video_element", "#E838FF"},
      {"video", "#9460FF"}, {"timeline", "#9460FF"}, {"storyboard", "#9460FF"},
      {"keyframe", "#9460FF"}, {"shot", "#9460FF"}, {"audio", "#08B8FF"}, {"script", "#08B8FF"},
      {"sketch", "#B0F030"}, {"game_slot", "#B0F030"}, {"slot_fill", "#B0F030"},
      {"list", "#FFD612"}, {"dict", "#FFD612"}, {"enum", "#FFD612"}, {"chunk", "#FFD612"},
      {"dataframe", "#FFD612"}, {"collection", "#FFD612"}, {"object", "#FFD612"}, {"json", "#FFD612"},
      {"tensor", "#5B5EFF"}, {"torch_tensor", "#5B5EFF"}, {"np_array", "#5B5EFF"},
      {"task", "#FF3060"}, {"cv", "#FF3060"}};
  if (const auto found = colors.constFind(type); found != colors.cend()) { return QColor(*found); }
  // The web colors its remaining file-like and model reference types blue.
  return QColor(type.isEmpty() ? QStringLiteral("#6880A0") : QStringLiteral("#3888FF"));
}

QString typeIcon(const QString &type) {
  static const QHash<QString, QString> icons{
      {"str", "quote"}, {"text", "quote"}, {"message", "quote"}, {"image", "image"},
      {"video", "movie"}, {"audio", "equalizer"}, {"bool", "toggle"}, {"int", "number"},
      {"float", "number"}, {"list", "list"}, {"dict", "braces"}, {"json", "braces"},
      {"object", "braces"}, {"dataframe", "table"}, {"document", "document"}, {"folder", "folder"},
      {"any", "help"}};
  return icons.value(type, QStringLiteral("help"));
}

QString iconPath(const QString &name) {
  // Material icon paths. See native/ui_primitives/resources/licenses/MATERIAL-ICONS.md.
  static const QHash<QString, QString> paths{
      {"accountTree", "M22 11V3h-7v3H9V3H2v8h7V8h2v12h4v3h7v-8h-7v3h-2V8h2v3z"},
      {"quote", "M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z"},
      {"image", "M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2M8.5 13.5l2.5 3.01L14.5 12l4.5 6H5z"},
      {"movie", "M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H5L3 4H2v14c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4z"},
      {"equalizer", "M7 18h2V6H7zm4 4h2V2h-2zm-8-8h2v-4H3zm12 4h2V6h-2zm4-8v4h2v-4z"},
      {"toggle", "M17 7H7a5 5 0 0 0 0 10h10a5 5 0 0 0 0-10m0 8a3 3 0 1 1 0-6 3 3 0 0 1 0 6"},
      {"number", "M20 10V8h-4V4h-2v4h-4V4H8v4H4v2h4v4H4v2h4v4h2v-4h4v4h2v-4h4v-2h-4v-4zm-6 4h-4v-4h4z"},
      {"list", "M3 13h2v-2H3zm0 4h2v-2H3zm0-8h2V7H3zm4 4h14v-2H7zm0 4h14v-2H7zM7 7v2h14V7z"},
      {"braces", "M4 7v2c0 .55-.45 1-1 1H2v4h1c.55 0 1 .45 1 1v2c0 1.65 1.35 3 3 3h3v-2H7c-.55 0-1-.45-1-1v-2c0-1.3-.84-2.42-2-2.83v-.34C5.16 11.42 6 10.3 6 9V7c0-.55.45-1 1-1h3V4H7C5.35 4 4 5.35 4 7m17 3c-.55 0-1-.45-1-1V7c0-1.65-1.35-3-3-3h-3v2h3c.55 0 1 .45 1 1v2c0 1.3.84 2.42 2 2.83v.34c-1.16.41-2 1.52-2 2.83v2c0 .55-.45 1-1 1h-3v2h3c1.65 0 3-1.35 3-3v-2c0-.55.45-1 1-1h1v-4z"},
      {"table", "M3 3v18h18V3zm8 16H5v-6h6zm0-8H5V5h6zm8 8h-6v-6h6zm0-8h-6V5h6z"},
      {"document", "M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8zm2 16H8v-2h8zm0-4H8v-2h8zm-3-5V3.5L18.5 9z"},
      {"folder", "M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8z"},
      {"help", "M11.07 12.85c.77-1.39 2.25-2.21 3.11-3.44.91-1.29.4-3.7-2.18-3.7-1.69 0-2.52 1.28-2.87 2.34L6.54 6.96C7.25 4.83 9.18 3 11.99 3c2.35 0 3.96 1.07 4.78 2.41.7 1.15 1.11 3.3.03 4.9-1.2 1.77-2.35 2.31-2.97 3.45-.25.46-.35.76-.35 2.24h-2.89c-.01-.78-.13-2.05.48-3.15M14 20c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2"},
      {"search", "M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"},
      {"save", "M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3m3-10H5V5h10z"},
      {"folderOpen", "M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2m0 12H4V8h16z"},
      {"addCircle", "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m5 11h-4v4h-2v-4H7v-2h4V7h2v4h4z"},
      {"hub", "M8.4 18.2c.38.5.6 1.12.6 1.8 0 1.66-1.34 3-3 3s-3-1.34-3-3 1.34-3 3-3c.44 0 .85.09 1.23.26l1.41-1.77c-.92-1.03-1.29-2.39-1.09-3.69l-2.03-.68c-.54.83-1.46 1.38-2.52 1.38-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3c0 .07 0 .14-.01.21l2.03.68c.64-1.21 1.82-2.09 3.22-2.32V5.91C9.96 5.57 9 4.4 9 3c0-1.66 1.34-3 3-3s3 1.34 3 3c0 1.4-.96 2.57-2.25 2.91v2.16c1.4.23 2.58 1.11 3.22 2.32l2.03-.68c-.01-.07-.01-.14-.01-.21 0-1.66 1.34-3 3-3s3 1.34 3 3-1.34 3-3 3c-1.06 0-1.98-.55-2.52-1.38l-2.03.68c.2 1.29-.16 2.65-1.09 3.69l1.41 1.77c.38-.17.79-.26 1.23-.26 1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3c0-.68.22-1.3.6-1.8l-1.41-1.77c-1.35.75-3.01.76-4.37 0z"},
      {"article", "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2m-5 14H7v-2h7zm3-4H7v-2h10zm0-4H7V7h10z"}};
  return paths.value(name);
}

QString displayName(const QString &name) {
  auto result = name;
  result.replace('_', ' ');
  if (!result.isEmpty()) { result[0] = result[0].toUpper(); }
  return result;
}
} // namespace nodetool
