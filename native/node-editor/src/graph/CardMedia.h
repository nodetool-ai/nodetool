#pragma once
#include "NodeLayout.h"
#include <QHash>
#include <QVariant>
class QPainter;

namespace nodetool {
struct CanvasTheme;

// Measurements of the web's media fields on a 280 px card, from
// PropertyDropzone.tsx, the list properties and special_nodes.css.
namespace card_media {
// A loaded value sits in an outlined zone 6 px below its label, padded 4 px.
inline constexpr double zoneGap = 6;
inline constexpr double zonePadding = 4;
// An input's image is at most 200 px tall. A constant Image or Video has no
// label, margin or padding and fills the card width at the media's aspect ratio.
inline constexpr double imageMaxHeight = 200;
// A failed or loading image holds the 44 px "could not be loaded" line, as does
// an empty constant's "Click or drop" zone.
inline constexpr double messageHeight = 44;
// Below a zone: its 6 px margin and the card border. The card adds its 8 px padding.
inline constexpr double zoneBottom = 7;
// The video zone's filename line (32 px) and the 4 px gaps around it.
inline constexpr double videoCaption = 40;
// The audio zone: filename line, 15 px waveform and two 28 px button rows.
inline constexpr double audioZoneHeight = 125;
// List grids: 8 px gaps and margin, tiles at least 80 px (images) or 120 px
// (videos) wide. A tile is square or 16:9 plus the 20 px its remove button adds.
inline constexpr double listGap = 8;
inline constexpr double imageTileMinimum = 80;
inline constexpr double videoTileMinimum = 120;
inline constexpr double tileExtra = 20;
// An audio list row: 8 px padding around a 32 px player, with a 1 px border.
inline constexpr double audioItemHeight = 50;
inline constexpr double listZoneHeight = 80;
inline constexpr double videoAspect = 9.0 / 16.0;
// ImageDimensions.tsx: an 18 px badge 4 px above the image's bottom edge.
inline constexpr double badgeHeight = 18;
inline constexpr double badgeInset = 4;
// The asset actions: 28 px buttons 4 px from the zone's top right corner.
inline constexpr double actionSize = 28;
} // namespace card_media

// Thumbnails and load states of media values, by node, property and item.
class CardMediaStore {
public:
  static QString key(const QString &node, const QString &property, int index);
  // The stored item for a value, or an unrequested one when the value changed.
  CardMediaItem item(const QString &node, const QString &property, int index, const QString &identity) const;
  void set(const QString &node, const QString &property, int index, const CardMediaItem &item);
  // Keeps the entries of the listed nodes.
  void retain(const QSet<QString> &nodes);
  void clear() { items_.clear(); }

private:
  QHash<QString, CardMediaItem> items_;
};

QString cardMediaIdentity(const QVariant &locator);
// The node types whose media field has no label row (special_nodes.css).
bool cardMediaBare(const QString &nodeType);
// A constant Image or Video fills the card and grows with it.
bool cardMediaFills(const QString &nodeType);

struct CardMediaField {
  QString node;
  QString nodeType;
  QString property;
  QString mediaType;
  QVariant value;
  bool list = false;
};

// Lays a media drop zone row out below top and returns the card y after it.
double layoutCardMedia(NodeRow &row, const CardMediaField &field, double top, double inset, double cardWidth,
                       const CardMediaStore &store);
// A filling constant grows with an authored card height.
void stretchCardMedia(NodeLayout &layout, const QString &nodeType);
void paintCardMedia(QPainter *painter, const CanvasTheme &theme, const NodeRow &row, bool hovered);
// PropertyDropzone's hover actions on a loaded image: Copy and Replace. Empty
// for other rows.
enum class CardMediaAction { Copy, Replace };
QRectF cardMediaActionRect(const NodeRow &row, CardMediaAction action);
} // namespace nodetool
