#include "NodePainter.h"
#include "properties/CodeHighlighter.h"
#include <QAbstractTextDocumentLayout>
#include <QConicalGradient>
#include <QJsonArray>
#include <QJsonDocument>
#include <QPainter>
#include <QSvgRenderer>
#include <QTextBlock>
#include <QTextCursor>
#include <QTextDocument>
#include <algorithm>
#include <cmath>

namespace nodetool::canvas {
namespace {
namespace nm = node_metrics;

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
void paintCodeField(QPainter *painter, const CanvasTheme &theme, const NodeRow &row) {
  const auto field = row.rect;
  painter->save();
  painter->setPen(Qt::NoPen);
  painter->setBrush(theme.field);
  painter->drawRoundedRect(field, nm::fieldRadius, nm::fieldRadius);
  painter->setClipRect(field.adjusted(0, 0, -nm::borderWidth, -nm::borderWidth));
  auto font = canvasFont(theme, nm::codeFontSize, QFont::Normal);
  font.setFamily(theme.monoFamily);
  font.setStyleHint(QFont::Monospace);
  const QFontMetricsF metrics(font);
  const auto visible = int(std::ceil((field.height() - nm::codePaddingY) / metrics.lineSpacing())) + 1;
  const auto lines = row.value.split(QLatin1Char('\n'));
  const auto shown = QStringList(lines.mid(0, visible)).join(QLatin1Char('\n'));
  QTextDocument document;
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
  painter->setFont(font);
  painter->setPen(theme.textSecondary);
  const auto top = field.top() + nm::codePaddingY;
  for (int line = 0; line < std::min<int>(visible, lines.size()); ++line) {
    const auto block = document.findBlockByNumber(line);
    const auto y = top + document.documentLayout()->blockBoundingRect(block).top();
    painter->drawText(QRectF(field.left(), y, nm::codeGutterWidth - nm::codeTextGap / 2.0, metrics.lineSpacing()),
                      Qt::AlignRight | Qt::AlignVCenter, QString::number(line + 1));
  }
  painter->translate(field.left() + nm::codeGutterWidth + nm::codeTextGap, top);
  QAbstractTextDocumentLayout::PaintContext context;
  context.palette.setColor(QPalette::Text, theme.textPrimary);
  document.documentLayout()->draw(painter, context);
  painter->restore();
}

void paintIcon(QPainter *painter, const QString &name, const QRectF &rect, QColor color) {
  const auto path = iconPath(name);
  if (path.isEmpty()) { return; }
  const auto svg = QStringLiteral("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path fill=\"%1\" "
                                  "fill-opacity=\"%2\" d=\"%3\"/></svg>")
                       .arg(color.name())
                       .arg(color.alphaF())
                       .arg(path);
  QSvgRenderer(svg.toUtf8()).render(painter, rect);
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

void paintRow(QPainter *painter, const CanvasTheme &theme, const NodeLayout &layout, const NodeRow &row, double inset) {
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
    paintCodeField(painter, theme, row);
  } else if (row.kind == NodeRowKind::Field || row.kind == NodeRowKind::Multiline) {
    const QRectF field(inset, row.fieldY, width, row.height);
    painter->setPen(Qt::NoPen);
    painter->setBrush(theme.field);
    painter->drawRoundedRect(field, nm::fieldRadius, nm::fieldRadius);
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
void paintHandles(QPainter *painter, const CardPaintState &state) {
  const auto &theme = state.theme;
  if (state.zoom <= zoomedOutThreshold) { return; }
  for (const auto &handle : state.handles) {
    const auto [x, y] = std::pair(handle.position.x(), handle.position.y());
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
    painter->setPen(QPen(theme.node, nm::handleRing));
    painter->setBrush(fill);
    const auto r = nm::handleDiameter / 2 - nm::handleRing / 2;
    painter->drawEllipse(QPointF(x, y), r, r);
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
    paintHandles(painter, state);
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
    painter->setPen(group || state.selected ? QPen(state.selected ? theme.primary
                                                   : dropTarget   ? hoverEdge
                                                                  : border,
                                                   group ? 1 / zoom : 1)
                                            : QPen(Qt::NoPen));
    painter->drawRoundedRect(QRectF(QPointF(), layout.size), 4, 4);
    if (group) {
      // The foreground paints the zoom-compensated label outside this item's
      // exposed rectangle, which QtNodes clips before calling the painter.
    } else {
      QTextDocument text;
      text.setDefaultFont(canvasFont(theme, 15, QFont::Normal));
      const auto value = state.comment;
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
      const auto ink =
          layout.accent.isValid()
              ? ((0.299 * color.red() + 0.587 * color.green() + 0.114 * color.blue()) > 127.5 ? QColor(Qt::black)
                                                                                              : QColor(Qt::white))
              : theme.textPrimary;
      text.setDefaultStyleSheet("body { color: " + ink.name() + "; }");
      text.setTextWidth(std::max(1, layout.size.width() - 40));
      painter->translate(8, 16);
      painter->setClipRect(QRectF(0, 0, layout.size.width() - 40, layout.size.height() - 32));
      QAbstractTextDocumentLayout::PaintContext context;
      context.palette.setColor(QPalette::Text, ink);
      text.documentLayout()->draw(painter, context);
    }
    painter->restore();
    if (!state.readOnly) { paintResizeHandle(painter, layout.size, theme.textSecondary); }
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
      painter->setPen(Qt::NoPen);
      painter->setBrush(shade);
      painter->drawRoundedRect(box.adjusted(-spread, 1 - spread, spread, 1 + spread), nm::radius + spread,
                               nm::radius + spread);
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
  painter->setPen(QPen(focused          ? theme.warning
                       : state.selected ? (layout.subgraph ? theme.subgraphAccent : selectedEdge)
                                        : borderColor,
                       layout.subgraph && state.selected ? 2 * nm::borderWidth : nm::borderWidth,
                       disabled || focused ? Qt::DashLine : Qt::SolidLine));
  painter->setBrush(grouped && !loading ? theme.groupFill : theme.node);
  painter->drawRoundedRect(box.adjusted(0.5, 0.5, -0.5, -0.5), nm::radius - 0.5, nm::radius - 0.5);
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
  if (zoomedOut) {
  } else if (layout.subgraph) {
    paintIcon(painter, layout.icon, iconBox, theme.subgraphAccent);
  } else {
    paintCardIcon(painter, layout.typeIcon, layout.icon, iconBox, iconColor);
  }
  const QRectF headerBox(inset, inset, layout.size.width() - 2 * inset, nm::headerHeight);
  const auto chipFont = canvasFont(theme, nm::fontValue, QFont::Normal);
  const auto chipLabel = QObject::tr("Disabled");
  const auto chip = disabledChipRect(headerBox, QFontMetricsF(chipFont).horizontalAdvance(chipLabel));
  painter->setPen(zoomedOut ? theme.zoomedTitle : theme.textPrimary);
  painter->setFont(canvasFont(theme, nm::fontTitle, QFont::Normal));
  // The chip keeps its 6 px left margin (nodes.states.css .bypass-badge).
  const bool headerButton = !layout.headerAction.isEmpty() && !layout.collapsed && !zoomedOut;
  const QRectF title(inset + nm::titleOffset, inset,
                     layout.size.width() - 2 * inset - nm::titleOffset -
                         (disabled ? chip.width() + disabledChipMargin : 0) -
                         (headerButton ? layout.headerActionRect().width() : 0),
                     nm::headerHeight);
  {
    // nodes.states.css: a bypassed title is drawn at 0.8 inside the card's own 0.8.
    const auto cardOpacity = painter->opacity();
    if (disabled && !zoomedOut) { painter->setOpacity(cardOpacity * nm::disabledOpacity); }
    painter->drawText(title, Qt::AlignLeft | Qt::AlignVCenter,
                      painter->fontMetrics().elidedText(layout.title, Qt::ElideRight, int(title.width())));
    painter->setOpacity(cardOpacity);
  }

  if (disabled) { paintDisabledBadge(painter, chip, theme, chipFont, chipLabel); }
  if (headerButton && !state.readOnly) {
    // ComfyWorkflowLoader's ToolbarIconButton: secondary ink, primary ink on an overlay when hovered.
    const auto button = layout.headerActionRect();
    const bool hovered = state.headerActionHovered;
    if (hovered) {
      painter->setPen(Qt::NoPen);
      painter->setBrush(theme.field);
      painter->drawRoundedRect(button, 4, 4);
    }
    paintIcon(painter, QStringLiteral("uploadFile"), button.adjusted(4, 4, -4, -4),
              hovered ? theme.textPrimary : theme.textSecondary);
  }
  for (const auto &row : layout.rows) {
    if (!paintCardBodyRow(painter, theme, layout, row, state.body)) {
      // nodes.zoomed.css hides property rows and their labels at overview zoom.
      if (!zoomedOut) { paintRow(painter, theme, layout, row, inset); }
    }
    if (!row.renameLabelRect.isEmpty() && !zoomedOut) {
      if (row.kind == NodeRowKind::Handle) {
        painter->setPen(theme.textSecondary);
        painter->setFont(canvasFont(theme, nm::fontLabel, QFont::Normal));
        painter->drawText(row.renameLabelRect, Qt::AlignLeft | Qt::AlignVCenter, row.label);
      }
      if (!state.readOnly) { paintIcon(painter, "edit", iconSquare(row.renameButtonRect), theme.textSecondary); }
      if (!row.typeChipRect.isEmpty()) { paintTypeChip(painter, theme, row); }
      if (!row.removeButtonRect.isEmpty()) {
        paintIcon(painter, "close", iconSquare(row.removeButtonRect), theme.textSecondary);
      }
    }
  }
  if (layout.addOutput) {
    painter->setPen(theme.textSecondary);
    painter->setFont(canvasFont(theme, nm::fontValue, QFont::Normal));
    painter->drawText(layout.outputFormRect(), Qt::AlignLeft | Qt::AlignVCenter, QObject::tr("+ Add output"));
  }
  if (layout.subgraph) {
    const auto footer = layout.footerRect();
    if (state.footerHovered) { painter->fillRect(footer.adjusted(1, 1, -1, -1), theme.field); }
    painter->setPen(theme.divider);
    painter->drawLine(footer.topLeft(), footer.topRight());
    painter->setPen(theme.textSecondary);
    painter->setFont(canvasFont(theme, nm::fontValue, QFont::Normal));
    paintIcon(painter, "accountTree", QRectF(inset, footer.y() + 7, 14, 14), theme.textSecondary);
    painter->drawText(footer.adjusted(inset + 18, 0, -32, 0), Qt::AlignLeft | Qt::AlignVCenter,
                      QObject::tr("Open subgraph"));
    painter->drawText(footer.adjusted(inset, 0, -32, 0), Qt::AlignRight | Qt::AlignVCenter, layout.childCount);
  }
  paintHandles(painter, state);
  auto runtime = state.runtime;
  // A collapsed strip keeps its status ring and drops the result body.
  if (layout.collapsed && !runtime.isEmpty()) { runtime = QJsonObject{{"status", runtime["status"]}}; }
  if (!runtime.isEmpty()) {
    // A constant or a content card shows its own value, not the run result.
    const auto output = state.outputRect;
    const auto &image = state.preview;
    if (!output.isEmpty() && !image.isNull()) {
      auto target = QRectF(QPointF(), image.size().scaled(output.size().toSize(), Qt::KeepAspectRatio));
      target.moveCenter(output.center());
      painter->drawImage(target, image);
    } else if (!output.isEmpty()) {
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
    painter->drawText(box.adjusted(inset, 0, -inset, -2 - bottomInset), Qt::AlignRight | Qt::AlignBottom, label);
    if (const auto report = reportErrorRect(state.runtime, layout); !report.isEmpty()) {
      auto font = canvasFont(theme, nm::fontValue, QFont::Medium);
      font.setUnderline(true);
      painter->setFont(font);
      painter->drawText(report, Qt::AlignLeft | Qt::AlignBottom, QObject::tr("Report"));
    }
  }
  if (!state.readOnly && !layout.collapsed) { paintResizeHandle(painter, layout.size, theme.textSecondary); }
  painter->restore();
}

} // namespace

void NodePainter::paint(QPainter *painter, const CardPaintState &state) {
  if (!state.bypassed || state.kind != CardKind::Node) {
    paintCard(painter, state);
    return;
  }
  // Apply the bypass filter to the whole card, including each handle. Keep
  // view zoom in the state because the temporary image has its own scale.
  const auto &bounds = state.bounds;
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
