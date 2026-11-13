#include "TypeStyle.h"

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
      {"any", "help"}, {"preview", "visibility"}};
  return icons.value(type, QStringLiteral("help"));
}

}  // namespace nodetool
