#include "NodePainter.h"
#include "properties/CodeHighlighter.h"
#include <QAbstractTextDocumentLayout>
#include <QConicalGradient>
#include <QJsonArray>
#include <QJsonDocument>
#include <QPainter>
#include <QTextBlock>
#include <QTextCursor>
#include <QTextDocument>
#include <algorithm>
#include <cmath>

namespace nodetool::canvas {
namespace {
namespace nm = node_metrics;

inline QRgb scalePremul(QRgb pixel, int alpha255) {
  if (alpha255 <= 0) { return 0; }
  if (alpha255 >= 255) { return pixel; }
  return qRgba((qRed(pixel) * alpha255 + 127) / 255, (qGreen(pixel) * alpha255 + 127) / 255,
               (qBlue(pixel) * alpha255 + 127) / 255, (qAlpha(pixel) * alpha255 + 127) / 255);
}

inline QRgb sourceOverPremul(QRgb dst, QRgb src) {
  const int sa = qAlpha(src);
  if (sa == 0) { return dst; }
  if (sa == 255 || dst == 0) { return src; }
  const int inv = 255 - sa;
  return qRgba(std::min(255, qRed(src) + (qRed(dst) * inv + 127) / 255),
               std::min(255, qGreen(src) + (qGreen(dst) * inv + 127) / 255),
               std::min(255, qBlue(src) + (qBlue(dst) * inv + 127) / 255),
               std::min(255, sa + (qAlpha(dst) * inv + 127) / 255));
}

// Fast software rasterization of a solid-border (or borderless) rounded rectangle.
// Qt's QPainter::drawRoundedRect runs QPainterPathStroker over the full outline
// even when only one 512px tile of a zoomed card or group is being painted.
// Partitioning along integer device-pixel lines lets straight bands hit SIMD
// fillRect and rasterizes only the intersecting corner quadrants with an analytic
// signed-distance field, producing identical pixels across tiled and full renders.
void paintSolidRoundedRect(QPainter *painter, const QRectF &rect, double radius, const QColor &fill,
                           const QColor &border, double borderWidth) {
  const bool hasFill = !fill.isValid() || fill.alpha() > 0;
  const bool hasBorder = borderWidth > 0 && (!border.isValid() || border.alpha() > 0);
  if (!hasFill && !hasBorder) { return; }

  const auto fallback = [&] {
    painter->setPen(hasBorder ? QPen(border, borderWidth) : QPen(Qt::NoPen));
    painter->setBrush(hasFill ? QBrush(fill) : QBrush(Qt::NoBrush));
    painter->drawRoundedRect(rect, radius, radius);
  };

  if (!fill.isValid() || (borderWidth > 0 && !border.isValid())) {
    fallback();
    return;
  }

  const auto *dev = painter->device();
  const auto devTx = painter->deviceTransform();
  const double dpr = dev ? dev->devicePixelRatio() : 1.0;
  if (!dev || dpr <= 0 || devTx.type() > QTransform::TxScale || devTx.m11() <= 0 ||
      !qFuzzyCompare(devTx.m11(), devTx.m22()) || !painter->testRenderHint(QPainter::Antialiasing)) {
    fallback();
    return;
  }

  const double s = devTx.m11(), dx = devTx.dx(), dy = devTx.dy();
  const double halfPen = hasBorder ? borderWidth * 0.5 : 0.0;
  const double devL = rect.left() * s + dx;
  const double devT = rect.top() * s + dy;
  const double devR = rect.right() * s + dx;
  const double devB = rect.bottom() * s + dy;
  const double devFillR = radius * s;
  const double devHalfPen = halfPen * s;
  const double cxL = devL + devFillR;
  const double cxR = devR - devFillR;
  const double cyT = devT + devFillR;
  const double cyB = devB - devFillR;

  const int devX1 = int(std::ceil(cxL));
  const int devX2 = int(std::floor(cxR));
  const int devY1 = int(std::ceil(cyT));
  const int devY2 = int(std::floor(cyB));
  if (devX1 >= devX2 || devY1 >= devY2 || devFillR < 1.5) {
    fallback();
    return;
  }

  QRect clipDev(0, 0, dev->width(), dev->height());
  if (painter->hasClipping()) {
    const auto clipLocal = painter->clipBoundingRect();
    if (clipLocal.isEmpty()) { return; }
    clipDev &= devTx.mapRect(clipLocal).toAlignedRect();
  }
  if (clipDev.isEmpty()) { return; }

  const double devOuterL = devL - devHalfPen;
  const double devOuterT = devT - devHalfPen;
  const double devOuterR = devR + devHalfPen;
  const double devOuterB = devB + devHalfPen;
  const double devStrokeW = borderWidth * s;
  const double invDpr = 1.0 / dpr;
  const double opacity = painter->opacity();

  painter->save();
  painter->setWorldTransform(QTransform());
  painter->setRenderHint(QPainter::Antialiasing, false);

  const auto fillDeviceRect = [&](double x0, double y0, double x1, double y1, const QColor &color) {
    if (x1 <= x0 || y1 <= y0 || color.alpha() == 0) { return; }
    const int cx0 = std::max(clipDev.left(), int(std::floor(x0)));
    const int cx1 = std::min(clipDev.right() + 1, int(std::ceil(x1)));
    const int cy0 = std::max(clipDev.top(), int(std::floor(y0)));
    const int cy1 = std::min(clipDev.bottom() + 1, int(std::ceil(y1)));
    if (cx0 >= cx1 || cy0 >= cy1) { return; }
    const int ix0 = std::clamp(int(std::ceil(x0)), cx0, cx1);
    const int ix1 = std::clamp(int(std::floor(x1)), ix0, cx1);
    const int iy0 = std::clamp(int(std::ceil(y0)), cy0, cy1);
    const int iy1 = std::clamp(int(std::floor(y1)), iy0, cy1);
    const auto fillScaled = [&](int rx, int ry, int rw, int rh, double cov) {
      if (rw <= 0 || rh <= 0 || cov <= 0.0) { return; }
      const QRectF r(rx * invDpr, ry * invDpr, rw * invDpr, rh * invDpr);
      if (cov >= 1.0 - 1e-6) {
        painter->fillRect(r, color);
      } else {
        QColor scaled = color;
        scaled.setAlphaF(color.alphaF() * cov);
        if (scaled.alpha() > 0) { painter->fillRect(r, scaled); }
      }
    };
    if (cx1 - cx0 == 1 || cy1 - cy0 == 1) {
      for (int y = cy0; y < cy1; ++y) {
        const double yCov = std::clamp(std::min(y1, double(y + 1)) - std::max(y0, double(y)), 0.0, 1.0);
        for (int x = cx0; x < cx1; ++x) {
          const double xCov = std::clamp(std::min(x1, double(x + 1)) - std::max(x0, double(x)), 0.0, 1.0);
          fillScaled(x, y, 1, 1, xCov * yCov);
        }
      }
      return;
    }
    fillScaled(ix0, iy0, ix1 - ix0, iy1 - iy0, 1.0);
    if (cy0 < iy0) {
      fillScaled(ix0, cy0, ix1 - ix0, 1, std::clamp(std::min(y1, double(cy0 + 1)) - std::max(y0, double(cy0)), 0.0, 1.0));
    }
    if (iy1 < cy1) {
      fillScaled(ix0, iy1, ix1 - ix0, 1, std::clamp(std::min(y1, double(iy1 + 1)) - std::max(y0, double(iy1)), 0.0, 1.0));
    }
    if (cx0 < ix0) {
      fillScaled(cx0, iy0, 1, iy1 - iy0, std::clamp(std::min(x1, double(cx0 + 1)) - std::max(x0, double(cx0)), 0.0, 1.0));
    }
    if (ix1 < cx1) {
      fillScaled(ix1, iy0, 1, iy1 - iy0, std::clamp(std::min(x1, double(ix1 + 1)) - std::max(x0, double(ix1)), 0.0, 1.0));
    }
    const int xs[2] = {cx0 < ix0 ? cx0 : -1, ix1 < cx1 ? ix1 : -1};
    const int ys[2] = {cy0 < iy0 ? cy0 : -1, iy1 < cy1 ? iy1 : -1};
    for (int y : ys) {
      if (y < 0) { continue; }
      const double yCov = std::clamp(std::min(y1, double(y + 1)) - std::max(y0, double(y)), 0.0, 1.0);
      for (int x : xs) {
        if (x < 0) { continue; }
        const double xCov = std::clamp(std::min(x1, double(x + 1)) - std::max(x0, double(x)), 0.0, 1.0);
        fillScaled(x, y, 1, 1, xCov * yCov);
      }
    }
  };

  if (hasFill) {
    fillDeviceRect(devX1, devT, devX2, devY1, fill);
    fillDeviceRect(devL, devY1, devR, devY2, fill);
    fillDeviceRect(devX1, devY2, devX2, devB, fill);
  }
  if (hasBorder) {
    fillDeviceRect(devX1, devOuterT, devX2, devOuterT + devStrokeW, border);
    fillDeviceRect(devX1, devB - devHalfPen, devX2, devOuterB, border);
    fillDeviceRect(devOuterL, devY1, devOuterL + devStrokeW, devY2, border);
    fillDeviceRect(devR - devHalfPen, devY1, devOuterR, devY2, border);
  }

  const int boxL = int(std::floor(devOuterL));
  const int boxT = int(std::floor(devOuterT));
  const int boxR = int(std::ceil(devOuterR));
  const int boxB = int(std::ceil(devOuterB));
  const double devInnerStrokeR = std::max(0.0, devFillR - devHalfPen);
  const double devOuterStrokeR = devFillR + devHalfPen;
  QColor opFill = fill, opBorder = border;
  if (opacity < 1.0 - 1e-6) {
    opFill.setAlphaF(fill.alphaF() * opacity);
    opBorder.setAlphaF(border.alphaF() * opacity);
  }
  const QRgb fillPm = qPremultiply(opFill.rgba());
  const QRgb borderPm = qPremultiply(opBorder.rgba());

  struct CornerSpec {
    QRect devBox;
    double cx, cy;
    bool right, bottom;
  };
  const CornerSpec corners[4] = {
      {QRect(boxL, boxT, devX1 - boxL, devY1 - boxT), cxL, cyT, false, false},
      {QRect(devX2, boxT, boxR - devX2, devY1 - boxT), cxR, cyT, true, false},
      {QRect(boxL, devY2, devX1 - boxL, boxB - devY2), cxL, cyB, false, true},
      {QRect(devX2, devY2, boxR - devX2, boxB - devY2), cxR, cyB, true, true},
  };

  bool resetOpacity = false;
  for (const auto &c : corners) {
    const QRect box = c.devBox.intersected(clipDev);
    if (box.isEmpty()) { continue; }
    if (!resetOpacity && opacity < 1.0 - 1e-6) {
      painter->setOpacity(1.0);
      resetOpacity = true;
    }
    QImage cornerImg(box.size(), QImage::Format_ARGB32_Premultiplied);
    cornerImg.setDevicePixelRatio(dpr);
    const int w = box.width(), h = box.height();
    for (int py = 0; py < h; ++py) {
      auto *scan = reinterpret_cast<QRgb *>(cornerImg.scanLine(py));
      const double y = box.top() + py + 0.5;
      const double qy = c.bottom ? std::max(0.0, y - c.cy) : std::max(0.0, c.cy - y);
      const double qy2 = qy * qy;
      for (int px = 0; px < w; ++px) {
        const double x = box.left() + px + 0.5;
        const double qx = c.right ? std::max(0.0, x - c.cx) : std::max(0.0, c.cx - x);
        const double dist = (qx > 0 && qy > 0) ? std::sqrt(qx * qx + qy2) : std::max(qx, qy);
        QRgb out = 0;
        if (hasFill) {
          const double cov = std::clamp(devFillR - dist + 0.5, 0.0, 1.0);
          if (cov > 0.0) { out = scalePremul(fillPm, int(cov * 255.0 + 0.5)); }
        }
        if (hasBorder) {
          const double covOut = std::clamp(devOuterStrokeR - dist + 0.5, 0.0, 1.0);
          const double covIn = std::clamp(dist - devInnerStrokeR + 0.5, 0.0, 1.0);
          const double cov = std::min(covOut, covIn);
          if (cov > 0.0) { out = sourceOverPremul(out, scalePremul(borderPm, int(cov * 255.0 + 0.5))); }
        }
        scan[px] = out;
      }
    }
    painter->drawImage(QPointF(box.topLeft()) * invDpr, cornerImg);
  }
  painter->restore();
}

// BaseNode's .loading::before: a 3px conic ring 4px outside the card with the
// xl radius, its stops evenly spaced and closed on the first color.
void paintRunningRing(QPainter *painter, const QRectF &box, const QVector<QColor> &colors, double cssAngle) {
  if (colors.isEmpty()) { return; }
  constexpr double offset = 4, ring = 3, outerRadius = 12;
  const auto outer = box.adjusted(-offset, -offset, offset, offset);
  QPainterPath path;
  path.addRoundedRect(outer, outerRadius, outerRadius);
  path.addRoundedRect(outer.adjusted(ring, ring, -ring, -ring), outerRadius - ring, outerRadius - ring);
  path.setFillRule(Qt::OddEvenFill);
  // CSS turns clockwise from 12 o'clock and Qt counterclockwise from 3 o'clock,
  // so the start angle is mirrored and each stop sits at 1 - position.
  QConicalGradient gradient(outer.center(), 90 - cssAngle);
  const auto count = colors.size();
  for (qsizetype i = 0; i <= count; ++i) { gradient.setColorAt(1 - double(i) / count, colors[i % count]); }
  painter->save();
  painter->setPen(Qt::NoPen);
  painter->setBrush(gradient);
  painter->drawPath(path);
  painter->restore();
}

// The painted twin of CodePropertyEditor.qml: the field fill, a right-aligned
// line gutter and highlighted monospace text, with the same font and offsets.
// Only the lines that fit are laid out, so a long source paints in constant time.
void paintCodeField(QPainter *painter, const CanvasTheme &theme, const NodeRow &row, const QRectF &paintClip,
                    CanvasIconCache *icons) {
  const auto field = row.rect;
  painter->save();
  paintSolidRoundedRect(painter, field, nm::fieldRadius, theme.field, Qt::transparent, 0);
  painter->setClipRect(field.adjusted(0, 0, -nm::borderWidth, -nm::borderWidth));
  auto font = canvasFont(theme, nm::codeFontSize, QFont::Normal);
  font.setFamily(theme.monoFamily);
  font.setStyleHint(QFont::Monospace);
  const QFontMetricsF metrics(font);
  const auto visible = int(std::ceil((field.height() - nm::codePaddingY) / metrics.lineSpacing())) + 1;
  const auto lines = row.value.split(QLatin1Char('\n'));
  const auto shownCount = std::min<int>(visible, int(lines.size()));
  const auto shown = QStringList(lines.mid(0, shownCount)).join(QLatin1Char('\n'));
  auto populate = [&](QTextDocument &document) {
    document.setDocumentMargin(0);
    document.setDefaultFont(font);
    document.setUndoRedoEnabled(false);
    QTextOption option;
    option.setWrapMode(QTextOption::NoWrap);
    document.setDefaultTextOption(option);
    document.setPlainText(shown);
    node_editor::CodeHighlighter highlighter;
    highlighter.setKeyword(theme.info);
    highlighter.setLiteral(theme.success);
    highlighter.setComment(theme.textSecondary);
    highlighter.setDocument(&document);
    highlighter.rehighlight();
  };
  QTextDocument localDoc;
  QTextDocument *docPtr = &localDoc;
  if (icons) {
    const auto key = QStringLiteral("code|%1|%2|%3|%4|%5|%6")
                         .arg(theme.monoFamily)
                         .arg(nm::codeFontSize)
                         .arg(theme.info.rgba(), 0, 16)
                         .arg(theme.success.rgba(), 0, 16)
                         .arg(theme.textSecondary.rgba(), 0, 16)
                         .arg(shown);
    docPtr = icons->textDocument(key, populate);
  } else {
    populate(localDoc);
  }
  painter->setFont(font);
  painter->setPen(theme.textSecondary);
  const auto top = field.top() + nm::codePaddingY;
  const QRectF gutterBounds(field.left(), top, nm::codeGutterWidth - nm::codeTextGap / 2.0, field.height());
  if (gutterBounds.intersects(paintClip)) {
    for (int line = 0; line < shownCount; ++line) {
      const auto block = docPtr->findBlockByNumber(line);
      const auto y = top + docPtr->documentLayout()->blockBoundingRect(block).top();
      const QRectF lineRect(field.left(), y, nm::codeGutterWidth - nm::codeTextGap / 2.0, metrics.lineSpacing());
      if (lineRect.intersects(paintClip)) {
        painter->drawText(lineRect, Qt::AlignRight | Qt::AlignVCenter, QString::number(line + 1));
      }
    }
  }
  const double textOriginX = field.left() + nm::codeGutterWidth + nm::codeTextGap;
  painter->translate(textOriginX, top);
  QAbstractTextDocumentLayout::PaintContext context;
  context.palette.setColor(QPalette::Text, theme.textPrimary);
  context.clip = paintClip.translated(-textOriginX, -top);
  docPtr->documentLayout()->draw(painter, context);
  painter->restore();
}

// Visible paint area in card-local coordinates, so tiled rasters skip rows,
// icons and text that lie completely outside the current 512px tile.
QRectF localPaintClip(const QPainter *painter, const QRectF &fallback) {
  if (!painter || !painter->device()) { return fallback; }
  const double dpr = painter->device()->devicePixelRatio();
  const QRectF device(QPointF(), QSizeF(painter->device()->width(), painter->device()->height()) / (dpr > 0 ? dpr : 1.0));
  bool invertible = false;
  const auto inverse = painter->worldTransform().inverted(&invertible);
  if (!invertible) { return fallback; }
  QRectF clip = inverse.mapRect(device).adjusted(-2, -2, 2, 2);
  if (painter->hasClipping()) {
    const auto painterClip = painter->clipBoundingRect();
    if (!painterClip.isEmpty()) { clip &= painterClip.adjusted(-2, -2, 2, 2); }
  }
  return clip;
}

// Conservative card-local bounds of a row across all generic and bespoke kinds.
QRectF rowPaintBounds(const NodeLayout &layout, const NodeRow &row) {
  QRectF bounds;
  const auto unite = [&](const QRectF &r) {
    if (!r.isEmpty()) { bounds = bounds.isEmpty() ? r : bounds.united(r); }
  };
  unite(row.rect);
  for (const auto &part : row.parts) { unite(part); }
  unite(row.renameLabelRect);
  unite(row.renameButtonRect);
  unite(row.typeChipRect);
  unite(row.removeButtonRect);
  unite(row.listZone);
  if (row.kind != NodeRowKind::Handle || row.conditionalUnavailable) {
    const double w = layout.size.width();
    const double rowH = row.conditionalUnavailable ? 2 * nm::rowHeight : nm::rowHeight;
    unite(QRectF(0, row.y, w, rowH));
    if (row.height > 0) { unite(QRectF(0, row.fieldY, w, row.height)); }
  }
  if (row.kind == NodeRowKind::ModelChip && !row.bare && !row.rect.isEmpty()) {
    unite(QRectF(row.rect.x(), row.rect.y() - nm::rowHeight, row.rect.width(), nm::rowHeight));
  } else if (row.kind == NodeRowKind::ImageSize && !row.rect.isEmpty()) {
    unite(QRectF(0, row.y, layout.size.width(), row.rect.bottom() + nm::imageSizeCaptionHeight - row.y));
  } else if (row.kind == NodeRowKind::DropZone && !row.rect.isEmpty()) {
    unite(QRectF(0, row.y, layout.size.width(), nm::rowHeight));
  } else if (row.kind == NodeRowKind::Preview) {
    const double inset = nm::borderWidth + nm::padding;
    unite(QRectF(inset, row.y, layout.size.width() - 2 * inset,
                 layout.body == CardBody::Preview ? layout.size.height() - inset - row.y : row.height));
  } else if (row.kind == NodeRowKind::Knob && !row.rect.isEmpty()) {
    unite(row.rect.adjusted(-nm::padding, 0, nm::padding, nm::fontValue * 2 + nm::micro * 2));
  } else if (row.kind == NodeRowKind::Field && !row.bare && !row.rect.isEmpty()) {
    unite(QRectF(0, row.rect.y(), row.rect.right(), row.rect.height()));
  }
  return bounds.adjusted(-2, -2, 2, 2);
}

void paintIcon(QPainter *painter, const QString &name, const QRectF &rect, QColor color, CanvasIconCache *icons) {
  paintMaterialIcon(painter, name, rect, color, icons);
}

// A square icon centered in a row control, as the web's 14 px action icons.
QRectF iconSquare(const QRectF &rect) {
  const auto side = std::min({rect.width(), rect.height(), 14.0});
  return QRectF(rect.center() - QPointF(side / 2, side / 2), QSizeF(side, side));
}

// DynamicSlotTypePicker's compact Chip: the slot type color as text, a half
// opacity border and a 12 percent fill.
// NodeProgress.tsx: "3 / 10", with "(eta 12s)" once a rate is known.
QString progressLabel(const QJsonObject &runtime) {
  const auto progress = runtime["progress"].toDouble(), total = runtime["total"].toDouble();
  auto label = QStringLiteral("%1 / %2").arg(progress).arg(total);
  const auto elapsed = double(QDateTime::currentMSecsSinceEpoch()) - runtime["progressStarted"].toDouble();
  if (runtime.contains("progressStarted") && elapsed > 0 && progress > 0) {
    const auto eta = std::lround((total - progress) / (progress / elapsed) / 1000);
    if (eta > 0) { label += QStringLiteral(" (eta %1s)").arg(eta); }
  }
  return label;
}
void paintTypeChip(QPainter *painter, const CanvasTheme &theme, const NodeRow &row) {
  painter->save();
  const auto accent =
      typeColor(row.typeChip.startsWith("list[") ? row.typeChip.mid(5, row.typeChip.size() - 6) : row.typeChip);
  auto border = accent;
  border.setAlphaF(0.5);
  auto fill = accent;
  fill.setAlphaF(0.12);
  painter->setPen(QPen(border, 1));
  painter->setBrush(fill);
  painter->drawRoundedRect(row.typeChipRect.adjusted(0.5, 0.5, -0.5, -0.5), nm::chipHeight / 2.0, nm::chipHeight / 2.0);
  QFont mono(theme.monoFamily);
  mono.setPixelSize(nm::fontValue);
  painter->setFont(mono);
  painter->setPen(accent);
  painter->drawText(row.typeChipRect, Qt::AlignCenter, row.typeChip);
  painter->restore();
}

void paintResizeHandle(QPainter *painter, const QSize &size, const QColor &color) {
  painter->save();
  painter->setPen(QPen(color, 1.5, Qt::SolidLine, Qt::RoundCap));
  const auto corner = QPointF(size.width() - 6, size.height() - 6);
  painter->drawLine(corner + QPointF(-8, 0), corner + QPointF(0, -8));
  painter->drawLine(corner + QPointF(-4, 0), corner + QPointF(0, -4));
  painter->restore();
}

// nodes.states.css `.bypassed .base-node`: repeating-linear-gradient(45deg, transparent 0 5px,
// action-hover 5px 10px). The palette's hover tint is 2% white on dark and 4% ink on light.
void paintBypassStripes(QPainter *painter, const QRectF &box, const CanvasTheme &theme) {
  painter->save();
  QPainterPath clip;
  clip.addRoundedRect(box.adjusted(0.5, 0.5, -0.5, -0.5), nm::radius - 0.5, nm::radius - 0.5);
  painter->setClipPath(clip, Qt::IntersectClip);
  auto tint = theme.textPrimary;
  tint.setAlphaF(theme.node.lightness() < 128 ? 0.02 : 0.04);
  painter->setPen(Qt::NoPen);
  painter->setBrush(tint);
  const double band = 5 * std::sqrt(2.0), pitch = 2 * band;
  for (double c = -box.height() + std::fmod(box.height(), pitch) - pitch; c < box.width(); c += pitch) {
    painter->drawPolygon(QPolygonF{{c + band, 0},
                                   {c + 2 * band, 0},
                                   {c + 2 * band + box.height(), box.height()},
                                   {c + band + box.height(), box.height()}});
  }
  painter->restore();
}

// NodeHeader.tsx: the compact outlined warning MuiChip labelled Disabled. The theme's
// MuiChip override fills it with the tone at 12 percent and edges it at 50 percent.
void paintDisabledBadge(QPainter *painter, const QRectF &chip, const CanvasTheme &theme, const QFont &font,
                        const QString &label) {
  painter->save();
  painter->setFont(font);
  auto fill = theme.warning, border = theme.warning;
  fill.setAlphaF(0.12);
  border.setAlphaF(0.5);
  painter->setPen(QPen(border, nm::borderWidth));
  painter->setBrush(fill);
  painter->drawRoundedRect(chip.adjusted(0.5, 0.5, -0.5, -0.5), chip.height() / 2, chip.height() / 2);
  painter->setPen(theme.warning);
  painter->drawText(chip, Qt::AlignCenter, label);
  painter->restore();
}

// The CSS saturate() filter matrix on premultiplied pixels. The filter is linear in
// the color channels, so premultiplied values need no unpremultiply.
void saturate(QImage &image, double amount) {
  const double rr = 0.213 + 0.787 * amount, rg = 0.715 - 0.715 * amount, rb = 0.072 - 0.072 * amount;
  const double gr = 0.213 - 0.213 * amount, gg = 0.715 + 0.285 * amount, gb = rb;
  const double br = gr, bg = rg, bb = 0.072 + 0.928 * amount;
  for (int y = 0; y < image.height(); ++y) {
    auto *line = reinterpret_cast<QRgb *>(image.scanLine(y));
    for (int x = 0; x < image.width(); ++x) {
      const double r = qRed(line[x]), g = qGreen(line[x]), b = qBlue(line[x]);
      line[x] = qRgba(int(std::clamp(rr * r + rg * g + rb * b, 0.0, 255.0) + 0.5),
                      int(std::clamp(gr * r + gg * g + gb * b, 0.0, 255.0) + 0.5),
                      int(std::clamp(br * r + bg * g + bb * b, 0.0, 255.0) + 0.5), qAlpha(line[x]));
    }
  }
}

QColor mixColors(const QColor &first, const QColor &second, double firstShare) {
  QColor mixed;
  mixed.setRgbF(first.redF() * firstShare + second.redF() * (1 - firstShare),
                first.greenF() * firstShare + second.greenF() * (1 - firstShare),
                first.blueF() * firstShare + second.blueF() * (1 - firstShare));
  return mixed;
}

QColor withOpacity(QColor color, double opacity) {
  color.setAlphaF(opacity);
  return color;
}

void paintRow(QPainter *painter, const CanvasTheme &theme, const NodeLayout &layout, const NodeRow &row, double inset,
              const QRectF &paintClip, CanvasIconCache *icons) {
  const auto width = layout.size.width() - 2 * inset;
  if (row.conditionalUnavailable) {
    painter->setPen(theme.textSecondary);
    painter->setFont(canvasFont(theme, nm::fontValue, QFont::Normal));
    const auto top = row.y + nm::rowHeight;
    painter->drawText(QRectF(inset, top, width, nm::rowHeight), Qt::AlignLeft | Qt::AlignVCenter,
                      painter->fontMetrics().elidedText(QObject::tr("Unavailable for the selected settings"),
                                                        Qt::ElideRight, int(width)));
  }
  if (row.kind == NodeRowKind::Handle) { return; }
  if (!row.bare) {
    painter->setPen(theme.textSecondary);
    painter->setFont(canvasFont(theme, nm::fontLabel, QFont::Normal));
    const auto labelWidth = row.renameLabelRect.isEmpty() ? width : row.renameLabelRect.width();
    painter->drawText(QRectF(inset, row.y, labelWidth, nm::rowHeight), Qt::AlignLeft | Qt::AlignVCenter,
                      painter->fontMetrics().elidedText(row.label, Qt::ElideRight, int(labelWidth)));
  }
  if (row.kind == NodeRowKind::Number) {
    painter->setPen(theme.textPrimary);
    painter->setFont(canvasFont(theme, nm::fontValue, QFont::Normal));
    painter->drawText(QRectF(inset, row.y, width, nm::rowHeight), Qt::AlignRight | Qt::AlignVCenter, row.value);
  } else if (row.kind == NodeRowKind::Toggle) {
    const QRectF track(inset + width - 28, row.y + 2, 28, 14);
    painter->setPen(Qt::NoPen);
    painter->setBrush(row.checked ? theme.primary : theme.divider);
    painter->drawRoundedRect(track, 7, 7);
    painter->setBrush(row.checked ? QColor(Qt::white) : theme.textSecondary);
    painter->drawEllipse(QPointF(track.x() + (row.checked ? 21 : 7), track.center().y()), 5, 5);
  } else if (row.code) {
    paintCodeField(painter, theme, row, paintClip, icons);
  } else if (row.kind == NodeRowKind::Field || row.kind == NodeRowKind::Multiline) {
    const QRectF field(inset, row.fieldY, width, row.height);
    paintSolidRoundedRect(painter, field, nm::fieldRadius, theme.field, Qt::transparent, 0);
    painter->setPen(row.placeholder ? theme.textSecondary : theme.textPrimary);
    painter->setFont(canvasFont(theme, nm::fontValue, QFont::Normal));
    const auto text = field.adjusted(8, row.kind == NodeRowKind::Multiline ? 6 : 0, row.choice ? -24 : -8,
                                     row.kind == NodeRowKind::Multiline ? -6 : 0);
    if (row.kind == NodeRowKind::Multiline) {
      painter->drawText(text, Qt::AlignLeft | Qt::AlignTop | Qt::TextWordWrap, row.value);
    } else {
      painter->drawText(text, Qt::AlignLeft | Qt::AlignVCenter,
                        painter->fontMetrics().elidedText(row.value, Qt::ElideRight, int(text.width())));
    }
    if (row.choice) {
      QPainterPath chevron;
      const auto c = QPointF(field.right() - 12, field.center().y());
      chevron.moveTo(c + QPointF(-3, -1.5));
      chevron.lineTo(c + QPointF(0, 1.5));
      chevron.lineTo(c + QPointF(3, -1.5));
      painter->setBrush(Qt::NoBrush);
      painter->setPen(QPen(theme.textSecondary, 1.2));
      painter->drawPath(chevron);
    }
  }
}
void paintHandles(QPainter *painter, const CardPaintState &state, const QRectF &paintClip) {
  const auto &theme = state.theme;
  if (state.zoom <= zoomedOutThreshold) { return; }
  const double hitMargin = nm::handleDiameter / 2 * handleConnectableScale + 4;
  for (const auto &handle : state.handles) {
    const auto [x, y] = std::pair(handle.position.x(), handle.position.y());
    if (!QRectF(x - hitMargin, y - hitMargin, 2 * hitMargin, 2 * hitMargin).intersects(paintClip)) { continue; }
    const auto &color = handle.color;
    auto fill = color;
    painter->save();
    if (handle.connectable > 0) {
      // The web glow: a 4 px halo at 40% of the handle color.
      painter->setPen(Qt::NoPen);
      painter->setBrush(withOpacity(color, 0.4));
      painter->drawEllipse(QPointF(x, y), nm::handleDiameter / 2 * handleConnectableScale + 2,
                           nm::handleDiameter / 2 * handleConnectableScale + 2);
      painter->translate(x, y);
      painter->scale(handleConnectableScale, handleConnectableScale);
      painter->translate(-x, -y);
    } else if (handle.connectable < 0) {
      painter->translate(x, y);
      painter->scale(handleBlockedScaleX, handleBlockedScaleY);
      painter->translate(-x, -y);
      painter->setOpacity(painter->opacity() * handleBlockedOpacity);
      const auto gray = qGray(color.rgb());
      fill = QColor(gray, gray, gray, color.alpha());
    } else if (handle.hovered) {
      painter->translate(x, y);
      painter->scale(handleHoverScale, handleHoverScale);
      painter->translate(-x, -y);
      painter->setOpacity(painter->opacity() * handleHoverOpacity);
    }
    if (theme.node.alpha() == 255 && fill.alpha() == 255 && painter->opacity() >= 1.0 - 1e-6) {
      painter->setPen(Qt::NoPen);
      painter->setBrush(theme.node);
      const double outerR = nm::handleDiameter / 2.0;
      painter->drawEllipse(QPointF(x, y), outerR, outerR);
      painter->setBrush(fill);
      const double innerR = outerR - nm::handleRing;
      painter->drawEllipse(QPointF(x, y), innerR, innerR);
    } else {
      painter->setPen(QPen(theme.node, nm::handleRing));
      painter->setBrush(fill);
      const auto r = nm::handleDiameter / 2 - nm::handleRing / 2;
      painter->drawEllipse(QPointF(x, y), r, r);
    }
    if (handle.collect) {
      // .collect-handle: a card-colored core, radial-gradient(bg 0 2px, transparent 2.5px).
      QRadialGradient core(QPointF(x, y), handleCollectFeather);
      core.setColorAt(0, theme.node);
      core.setColorAt(handleCollectCore / handleCollectFeather, theme.node);
      core.setColorAt(1, withOpacity(theme.node, 0));
      painter->setPen(Qt::NoPen);
      painter->setBrush(core);
      painter->drawEllipse(QPointF(x, y), handleCollectFeather, handleCollectFeather);
    }
    painter->restore();
    // Tab focus on a handle (HandleTooltip's focusable wrapper) draws a warning
    // ring, the color of the keyboard-focused card's edge.
    if (handle.focused) {
      painter->save();
      // Inside the card's handle margin (handleDiameter / 2 + 2), so the bounds hold it.
      painter->setPen(QPen(theme.warning, 1.5));
      painter->setBrush(Qt::NoBrush);
      painter->drawEllipse(QPointF(x, y), nm::handleDiameter / 2 + 1, nm::handleDiameter / 2 + 1);
      painter->restore();
    }
  }
}

void paintCard(QPainter *painter, const CardPaintState &state) {
  const auto &theme = state.theme;
  const auto &layout = state.layout;
  const auto paintClip = localPaintClip(painter, state.bounds);
  if (state.kind == CardKind::Reroute) {
    painter->save();
    painter->setRenderHint(QPainter::Antialiasing);
    const QRectF box(QPointF(), layout.size);
    if (state.selected) {
      auto glow = theme.primary;
      glow.setAlphaF(0.25);
      painter->setPen(QPen(glow, 6));
      painter->setBrush(Qt::NoBrush);
      painter->drawRoundedRect(box.adjusted(-1, -1, 1, 1), nm::rerouteHeight / 2, nm::rerouteHeight / 2);
    }
    auto background = theme.reroutePaper;
    background.setAlphaF(0.8);
    painter->setBrush(background);
    painter->setPen(QPen(state.selected ? theme.primary : theme.rerouteBorder, nm::borderWidth));
    painter->drawRoundedRect(box.adjusted(0.5, 0.5, -0.5, -0.5), nm::rerouteHeight / 2, nm::rerouteHeight / 2);
    paintHandles(painter, state, paintClip);
    painter->restore();
    return;
  }
  if (state.kind == CardKind::Group || state.kind == CardKind::Comment) {
    painter->save();
    painter->setRenderHint(QPainter::Antialiasing);
    const bool group = state.kind == CardKind::Group;
    auto color = layout.accent;
    if (!color.isValid()) { color = group ? QColor("#9ca3af") : theme.canvas; }
    color.setAlphaF(1);
    auto fill = color;
    fill.setAlphaF(group ? 0.15 : 0.5);
    auto border = color;
    border.setAlphaF(state.selected ? 1 : 0.5);
    painter->setBrush(fill);
    const auto zoom = std::clamp(state.zoom, 0.08, 8.0);
    // GroupNode.tsx draws a group a card is over at 0.8 opacity, edged in 60 percent primary.
    const bool dropTarget = group && state.groupDropTarget;
    auto hoverEdge = theme.primary;
    hoverEdge.setAlphaF(0.6);
    painter->setOpacity(painter->opacity() * state.groupOpacity);
    const QRectF groupBox(QPointF(), layout.size);
    const bool drawBorder = group || state.selected;
    const QColor groupBorder = state.selected ? theme.primary
                               : dropTarget   ? hoverEdge
                                              : border;
    paintSolidRoundedRect(painter, groupBox, 4.0, fill, drawBorder ? groupBorder : QColor(Qt::transparent),
                          drawBorder ? (group ? 1.0 / zoom : 1.0) : 0.0);
    if (group) {
      // The foreground paints the zoom-compensated label outside this item's
      // exposed rectangle, which QtNodes clips before calling the painter.
    } else if (QRectF(8, 16, std::max(0, layout.size.width() - 40), std::max(0, layout.size.height() - 32)).intersects(paintClip)) {
      const auto value = state.comment;
      const auto ink =
          layout.accent.isValid()
              ? ((0.299 * color.red() + 0.587 * color.green() + 0.114 * color.blue()) > 127.5 ? QColor(Qt::black)
                                                                                              : QColor(Qt::white))
              : theme.textPrimary;
      const int textWidth = std::max(1, layout.size.width() - 40);
      auto populate = [&](QTextDocument &text) {
        text.setDefaultFont(canvasFont(theme, 15, QFont::Normal));
        if (value.isString()) {
          text.setMarkdown(value.toString());
        } else {
          // Lexical stores formatting on leaf text and block kind on parents.
          struct Frame {
            QJsonObject node;
            bool closing;
          };
          QVector<Frame> pending{{value.toObject()["root"].toObject(), false}};
          QString html;
          while (!pending.isEmpty()) {
            const auto frame = pending.takeLast();
            const auto node = frame.node;
            const auto type = node["type"].toString();
            auto tag = type == "paragraph"  ? QString("p")
                       : type == "quote"    ? QString("blockquote")
                       : type == "listitem" ? QString("li")
                       : type == "list"     ? node["tag"].toString("ul")
                       : type == "heading"  ? node["tag"].toString("h2")
                                            : QString{};
            if (tag != "p" && tag != "blockquote" && tag != "li" && tag != "ul" && tag != "ol" && tag != "h1" &&
                tag != "h2" && tag != "h3" && tag != "h4" && tag != "h5" && tag != "h6") {
              tag.clear();
            }
            if (frame.closing) {
              if (!tag.isEmpty()) { html += "</" + tag + ">"; }
              continue;
            }
            if (!tag.isEmpty()) {
              html += "<" + tag + ">";
              pending.append({node, true});
            }
            if (type == "linebreak") { html += "<br>"; }
            auto leaf = node["text"].toString().toHtmlEscaped();
            const auto format = node["format"].toInt();
            if (format & 1) { leaf = "<b>" + leaf + "</b>"; }
            if (format & 2) { leaf = "<i>" + leaf + "</i>"; }
            if (format & 8) { leaf = "<u>" + leaf + "</u>"; }
            if (format & 4) { leaf = "<s>" + leaf + "</s>"; }
            if (format & 16) { leaf = "<code>" + leaf + "</code>"; }
            html += leaf;
            const auto children = node["children"].toArray();
            for (auto i = children.size(); i > 0; --i) { pending.append({children[i - 1].toObject(), false}); }
          }
          text.setHtml(html);
        }
        text.setDefaultStyleSheet("body { color: " + ink.name() + "; }");
        text.setTextWidth(textWidth);
      };
      QTextDocument localDoc;
      QTextDocument *docPtr = &localDoc;
      if (state.icons) {
        const QString bodyKey = value.isString()
                                    ? QStringLiteral("md:") + value.toString()
                                    : QStringLiteral("lx:") +
                                          QString::fromUtf8(QJsonDocument(value.toObject()).toJson(QJsonDocument::Compact));
        const auto cacheKey = QStringLiteral("comment|%1|%2|%3|%4")
                                  .arg(theme.sansFamily)
                                  .arg(textWidth)
                                  .arg(ink.rgba(), 0, 16)
                                  .arg(bodyKey);
        docPtr = state.icons->textDocument(cacheKey, populate);
      } else {
        populate(localDoc);
      }
      painter->translate(8, 16);
      const QRectF textArea(0, 0, layout.size.width() - 40, layout.size.height() - 32);
      painter->setClipRect(textArea);
      QAbstractTextDocumentLayout::PaintContext context;
      context.palette.setColor(QPalette::Text, ink);
      context.clip = textArea.intersected(paintClip.translated(-8, -16));
      docPtr->documentLayout()->draw(painter, context);
    }
    painter->restore();
    if (!state.readOnly && QRectF(layout.size.width() - 18, layout.size.height() - 18, 18, 18).intersects(paintClip)) {
      paintResizeHandle(painter, layout.size, theme.textSecondary);
    }
    return;
  }
  const bool disabled = state.bypassed;
  const double zoom = state.zoom;
  const bool zoomedOut = zoom <= zoomedOutThreshold;
  const bool grouped = state.grouped;
  // BaseNode.tsx isLoading: the card takes the group tint only while it is not loading.
  const bool loading = !disabled && state.runningShown;
  painter->save();
  painter->setRenderHint(QPainter::Antialiasing);
  painter->setRenderHint(QPainter::TextAntialiasing);
  const QRectF box(QPointF(0, 0), layout.size);
  if (zoomedOut && state.selected) {
    // nodes.zoomed.css: a 4 px ring in the node color over a 0 2px 8px shadow, around the card.
    auto shade = QColor(0, 0, 0);
    for (int layer = 4; layer >= 1; --layer) {
      shade.setAlphaF(0.4 / 8);
      const double spread = 4 + 2 * layer - 2;
      painter->setPen(Qt::NoPen);
      painter->setBrush(shade);
      painter->drawRoundedRect(box.adjusted(-spread, 2 - spread, spread, 2 + spread), nm::radius + spread,
                               nm::radius + spread);
    }
    QPainterPath ring;
    ring.addRoundedRect(box.adjusted(-4, -4, 4, 4), nm::radius + 4, nm::radius + 4);
    ring.addRoundedRect(box, nm::radius, nm::radius);
    ring.setFillRule(Qt::OddEvenFill);
    painter->setBrush(layout.subgraph ? theme.subgraphAccent : layout.accent);
    painter->drawPath(ring);
  }
  // The zoomed-out node body is drawn at 0.85 and keeps no shadow of its own.
  if (zoomedOut) { painter->setOpacity(painter->opacity() * zoomedOutBodyOpacity); }
  const bool previewCard = layout.body == CardBody::Preview;
  const bool outputCard = layout.body == CardBody::Output;
  // selectionStyles.ts: Preview and Output cards carry SHADOW.sm in every state, other cards when selected.
  if ((state.selected || previewCard || outputCard) && !zoomedOut) {
    // SHADOW.sm: 0 1px 3px, stacked outlines in place of a blur.
    for (int spread = 3; spread >= 1; --spread) {
      auto shade = theme.selectionShadow;
      shade.setAlphaF(shade.alphaF() / 3.0);
      paintSolidRoundedRect(painter, box.adjusted(-spread, 1 - spread, spread, 1 + spread), nm::radius + spread, shade,
                            Qt::transparent, 0);
    }
  }
  auto borderColor = theme.divider;
  // selectionStyles.ts: a grouped card's hairline is the group header over 18 percent primary.
  if (grouped) { borderColor = mixColors(theme.groupHeader, theme.primary, 0.82); }
  // DynamicSchemaNodeShell keeps its provider edge inside a group too.
  if (layout.edge.isValid()) { borderColor = layout.edge; }
  if (layout.subgraph) {
    borderColor = theme.subgraphAccent;
    borderColor.setAlpha(64);
  }
  // A selected Preview card is edged in grey 100 and an Output card in info.main over white.
  const auto selectedEdge = previewCard ? theme.previewSelected : outputCard ? theme.outputSelected : layout.accent;
  // selectionStyles.ts: the keyboard-focused card is edged dashed in warning.
  const bool focused = state.focused;
  const QColor edgeColor = focused          ? theme.warning
                           : state.selected ? (layout.subgraph ? theme.subgraphAccent : selectedEdge)
                                            : borderColor;
  const double edgeWidth = layout.subgraph && state.selected ? 2 * nm::borderWidth : nm::borderWidth;
  const QColor fillColor = grouped && !loading ? theme.groupFill : theme.node;
  if (disabled || focused) {
    painter->setPen(QPen(edgeColor, edgeWidth, Qt::DashLine));
    painter->setBrush(fillColor);
    painter->drawRoundedRect(box.adjusted(0.5, 0.5, -0.5, -0.5), nm::radius - 0.5, nm::radius - 0.5);
  } else {
    paintSolidRoundedRect(painter, box.adjusted(0.5, 0.5, -0.5, -0.5), nm::radius - 0.5, fillColor, edgeColor,
                          edgeWidth);
  }
  if (disabled) { paintBypassStripes(painter, box, theme); }
  if (focused) {
    // BaseNode's "Focused" badge, centered 20 px above the card.
    const auto font = canvasFont(theme, nm::fontValue, QFont::DemiBold);
    const auto text = QObject::tr("Focused");
    const auto width = QFontMetricsF(font).horizontalAdvance(text) + 2 * nm::padding;
    const QRectF badge(box.center().x() - width / 2, -focusBadgeOffset, width, focusBadgeOffset - 4);
    painter->save();
    painter->setPen(Qt::NoPen);
    painter->setBrush(theme.warning);
    painter->drawRoundedRect(badge, 4, 4);
    painter->setPen(theme.canvas);
    painter->setFont(font);
    painter->drawText(badge, Qt::AlignCenter, text);
    painter->restore();
  }

  const auto inset = double(nm::borderWidth + nm::padding);
  auto iconColor = theme.textSecondary;
  iconColor.setAlphaF(0.65);
  const QRectF iconBox(inset + 2, inset + 4, nm::iconSize, nm::iconSize);
  // nodes.zoomed.css hides the icon and sets the title to grey 200 at full opacity.
  if (!zoomedOut && iconBox.intersects(paintClip)) {
    if (layout.subgraph) {
      paintIcon(painter, layout.icon, iconBox, theme.subgraphAccent, state.icons);
    } else {
      paintCardIcon(painter, layout.typeIcon, layout.icon, iconBox, iconColor, state.icons);
    }
  }
  const QRectF headerBox(inset, inset, layout.size.width() - 2 * inset, nm::headerHeight);
  QFont chipFont;
  QString chipLabel;
  QRectF chip;
  if (disabled) {
    chipFont = canvasFont(theme, nm::fontValue, QFont::Normal);
    chipLabel = QObject::tr("Disabled");
    chip = disabledChipRect(headerBox, QFontMetricsF(chipFont).horizontalAdvance(chipLabel));
  }
  // The chip keeps its 6 px left margin (nodes.states.css .bypass-badge).
  const bool headerButton = !layout.headerAction.isEmpty() && !layout.collapsed && !zoomedOut;
  const QRectF title(inset + nm::titleOffset, inset,
                     layout.size.width() - 2 * inset - nm::titleOffset -
                         (disabled ? chip.width() + disabledChipMargin : 0) -
                         (headerButton ? layout.headerActionRect().width() : 0),
                     nm::headerHeight);
  if (title.intersects(paintClip)) {
    painter->setPen(zoomedOut ? theme.zoomedTitle : theme.textPrimary);
    painter->setFont(canvasFont(theme, nm::fontTitle, QFont::Normal));
    // nodes.states.css: a bypassed title is drawn at 0.8 inside the card's own 0.8.
    const auto cardOpacity = painter->opacity();
    if (disabled && !zoomedOut) { painter->setOpacity(cardOpacity * nm::disabledOpacity); }
    painter->drawText(title, Qt::AlignLeft | Qt::AlignVCenter,
                      painter->fontMetrics().elidedText(layout.title, Qt::ElideRight, int(title.width())));
    painter->setOpacity(cardOpacity);
  }

  if (disabled && chip.intersects(paintClip)) { paintDisabledBadge(painter, chip, theme, chipFont, chipLabel); }
  if (headerButton && !state.readOnly && layout.headerActionRect().intersects(paintClip)) {
    // ComfyWorkflowLoader's ToolbarIconButton: secondary ink, primary ink on an overlay when hovered.
    const auto button = layout.headerActionRect();
    const bool hovered = state.headerActionHovered;
    if (hovered) {
      painter->setPen(Qt::NoPen);
      painter->setBrush(theme.field);
      painter->drawRoundedRect(button, 4, 4);
    }
    paintIcon(painter, QStringLiteral("uploadFile"), button.adjusted(4, 4, -4, -4),
              hovered ? theme.textPrimary : theme.textSecondary, state.icons);
  }
  for (const auto &row : layout.rows) {
    if (!rowPaintBounds(layout, row).intersects(paintClip)) { continue; }
    if (!paintCardBodyRow(painter, theme, layout, row, state.body)) {
      // nodes.zoomed.css hides property rows and their labels at overview zoom.
      if (!zoomedOut) { paintRow(painter, theme, layout, row, inset, paintClip, state.icons); }
    }
    if (!row.renameLabelRect.isEmpty() && !zoomedOut) {
      if (row.kind == NodeRowKind::Handle) {
        painter->setPen(theme.textSecondary);
        painter->setFont(canvasFont(theme, nm::fontLabel, QFont::Normal));
        painter->drawText(row.renameLabelRect, Qt::AlignLeft | Qt::AlignVCenter, row.label);
      }
      if (!state.readOnly) { paintIcon(painter, "edit", iconSquare(row.renameButtonRect), theme.textSecondary, state.icons); }
      if (!row.typeChipRect.isEmpty()) { paintTypeChip(painter, theme, row); }
      if (!row.removeButtonRect.isEmpty()) {
        paintIcon(painter, "close", iconSquare(row.removeButtonRect), theme.textSecondary, state.icons);
      }
    }
  }
  if (layout.addOutput && layout.outputFormRect().intersects(paintClip)) {
    painter->setPen(theme.textSecondary);
    painter->setFont(canvasFont(theme, nm::fontValue, QFont::Normal));
    painter->drawText(layout.outputFormRect(), Qt::AlignLeft | Qt::AlignVCenter, QObject::tr("+ Add output"));
  }
  if (layout.subgraph && layout.footerRect().adjusted(-1, -1, 1, 1).intersects(paintClip)) {
    const auto footer = layout.footerRect();
    if (state.footerHovered) { painter->fillRect(footer.adjusted(1, 1, -1, -1), theme.field); }
    painter->setPen(theme.divider);
    painter->drawLine(footer.topLeft(), footer.topRight());
    painter->setPen(theme.textSecondary);
    painter->setFont(canvasFont(theme, nm::fontValue, QFont::Normal));
    paintIcon(painter, "accountTree", QRectF(inset, footer.y() + 7, 14, 14), theme.textSecondary, state.icons);
    painter->drawText(footer.adjusted(inset + 18, 0, -32, 0), Qt::AlignLeft | Qt::AlignVCenter,
                      QObject::tr("Open subgraph"));
    painter->drawText(footer.adjusted(inset, 0, -32, 0), Qt::AlignRight | Qt::AlignVCenter, layout.childCount);
  }
  paintHandles(painter, state, paintClip);
  auto runtime = state.runtime;
  // A collapsed strip keeps its status ring and drops the result body.
  if (layout.collapsed && !runtime.isEmpty()) { runtime = QJsonObject{{"status", runtime["status"]}}; }
  if (!runtime.isEmpty()) {
    // A constant or a content card shows its own value, not the run result.
    const auto output = state.outputRect;
    const auto &image = state.preview;
    if (!output.isEmpty() && output.intersects(paintClip) && !image.isNull()) {
      auto target = QRectF(QPointF(), image.size().scaled(output.size().toSize(), Qt::KeepAspectRatio));
      target.moveCenter(output.center());
      painter->drawImage(target, image);
    } else if (!output.isEmpty() && output.intersects(paintClip)) {
      auto outputText = runtime["error"].toString();
      if (outputText.isEmpty()) { outputText = runtime["text"].toString(); }
      if (outputText.isEmpty() && runtime["result"].isObject()) {
        outputText = QString::fromUtf8(QJsonDocument(runtime["result"].toObject()).toJson(QJsonDocument::Compact));
      }
      painter->save();
      painter->setClipRect(output);
      painter->setPen(theme.textSecondary);
      painter->setFont(canvasFont(theme, nm::fontValue, QFont::Normal));
      painter->drawText(output, Qt::AlignLeft | Qt::AlignTop | Qt::TextWordWrap, outputText.left(4096));
      painter->restore();
    }
    const auto status = runtime["status"].toString();
    const bool running = !disabled && state.runningShown;
    auto color = status == "error" || status == "failed" ? QColor("#ff5555") : theme.primary;
    if (running) {
      color.setAlphaF(0.6 + 0.4 * std::sin(state.animationPhase * 6.283185));
      paintRunningRing(painter, box, layout.runningColors, state.runningAngle);
    }
    painter->setPen(color);
    painter->setFont(canvasFont(theme, nm::fontValue, QFont::Normal));
    // The web card shows no status text. Errors and a lost connection keep a label.
    QString label;
    if (status == "error" || status == "failed") { label = status; }
    if (!state.runtimeConnected && running) { label = QObject::tr("Disconnected"); }
    const auto total = runtime["total"].toDouble();
    if (layout.progressBand) {
      const auto fraction = std::clamp(runtime["progress"].toDouble() / total, 0.0, 1.0);
      const QRectF track(nm::progressBarInset, box.height() - nm::progressBarTop,
                         box.width() - 2 * nm::progressBarInset, nm::progressBarHeight);
      painter->setPen(Qt::NoPen);
      painter->setBrush(theme.field);
      painter->drawRoundedRect(track, track.height() / 2, track.height() / 2);
      painter->setBrush(theme.progress);
      painter->drawRoundedRect(QRectF(track.topLeft(), QSizeF(track.width() * fraction, track.height())),
                               track.height() / 2, track.height() / 2);
      QFont mono(theme.monoFamily);
      mono.setPixelSize(nm::fontValue);
      painter->setFont(mono);
      painter->setPen(theme.textSecondary);
      const QRectF count(nm::progressBarInset, box.height() - nm::progressLabelTop, track.width(),
                         nm::progressLabelTop - nm::progressBarTop);
      painter->drawText(count, Qt::AlignLeft | Qt::AlignVCenter, progressLabel(runtime));
      painter->setPen(color);
      painter->setFont(canvasFont(theme, nm::fontValue, QFont::Normal));
    }
    const auto bottomInset = layout.subgraph ? nm::handleRowStep : 0;
    if (layout.subgraph && status == "running" && total > 0) {
      const auto fraction = std::clamp(runtime["progress"].toDouble() / total, 0.0, 1.0);
      const QRectF track(inset, box.height() - bottomInset - nm::rowHeight - nm::padding, box.width() - 2 * inset,
                         nm::micro);
      painter->fillRect(track, theme.field);
      // NodeProgress draws its bar in the secondary color on every card.
      painter->fillRect(QRectF(track.topLeft(), QSizeF(track.width() * fraction, track.height())), theme.progress);
      label = progressLabel(runtime);
    }
    if (!label.isEmpty()) {
      painter->drawText(box.adjusted(inset, 0, -inset, -2 - bottomInset), Qt::AlignRight | Qt::AlignBottom, label);
    }
    if (const auto report = reportErrorRect(state.runtime, layout); !report.isEmpty() && report.intersects(paintClip)) {
      auto font = canvasFont(theme, nm::fontValue, QFont::Medium);
      font.setUnderline(true);
      painter->setFont(font);
      painter->drawText(report, Qt::AlignLeft | Qt::AlignBottom, QObject::tr("Report"));
    }
  }
  if (!state.readOnly && !layout.collapsed &&
      QRectF(layout.size.width() - 18, layout.size.height() - 18, 18, 18).intersects(paintClip)) {
    paintResizeHandle(painter, layout.size, theme.textSecondary);
  }
  painter->restore();
}

} // namespace

QList<QRectF> NodePainter::animatedRegion(const CardPaintState &state) {
  // paintCard draws the ring and the status text from these inputs.
  if (state.kind != CardKind::Node || state.bypassed || !state.runningShown || state.runtime.isEmpty()) { return {}; }
  const auto &layout = state.layout;
  const QRectF box(QPointF(), layout.size);
  QList<QRectF> region;
  const auto &colors = layout.runningColors;
  if (std::ranges::any_of(colors, [&](const QColor &color) { return color != colors.first(); })) {
    // paintRunningRing: 4 outside the card, 3 wide, corners of radius 12,
    // and a unit of antialiasing.
    const auto outer = box.adjusted(-5, -5, 5, 5);
    constexpr double band = 13;
    region = {QRectF(outer.left(), outer.top(), outer.width(), band),
              QRectF(outer.left(), outer.bottom() - band, outer.width(), band),
              QRectF(outer.left(), outer.top(), band, outer.height()),
              QRectF(outer.right() - band, outer.top(), band, outer.height())};
  }
  // The status label and the report link use the pulsing colour.
  const auto status = state.runtime["status"].toString();
  const bool label = !state.runtimeConnected || status == "error" || status == "failed" ||
                     (layout.subgraph && status == "running" && state.runtime["total"].toDouble() > 0);
  if (label) {
    const auto bottom = box.height() - 2 - (layout.subgraph ? nm::handleRowStep : 0);
    region.append(QRectF(0, bottom - nm::rowHeight - 1, box.width(), nm::rowHeight + 3));
  }
  if (const auto report = reportErrorRect(state.runtime, layout); !report.isEmpty()) {
    region.append(report.adjusted(-1, -1, 1, 1));
  }
  return region;
}

void NodePainter::paint(QPainter *painter, const CardPaintState &state) {
  if (!state.bypassed || state.kind != CardKind::Node) {
    paintCard(painter, state);
    return;
  }
  // Apply the bypass filter only to the clipped portion of the card so tiled
  // rasters do not allocate and saturate a full-card temporary buffer per tile.
  const auto bounds = state.bounds.intersected(localPaintClip(painter, state.bounds));
  if (bounds.isEmpty()) { return; }
  const double scale =
      std::max(0.01, std::abs(painter->worldTransform().m11()) * painter->device()->devicePixelRatio());
  QImage image(QSize(int(std::ceil(bounds.width() * scale)), int(std::ceil(bounds.height() * scale))),
               QImage::Format_ARGB32_Premultiplied);
  image.fill(Qt::transparent);
  {
    QPainter inner(&image);
    inner.scale(scale, scale);
    inner.translate(-bounds.topLeft());
    paintCard(&inner, state);
  }
  saturate(image, disabledSaturation);
  painter->save();
  painter->setOpacity(painter->opacity() * nm::disabledOpacity);
  painter->drawImage(QRectF(bounds.topLeft(), QSizeF(image.width() / scale, image.height() / scale)), image);
  painter->restore();
}
} // namespace nodetool::canvas
