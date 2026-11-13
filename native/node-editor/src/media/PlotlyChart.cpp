#include "PlotlyChart.h"

#include <QFontMetricsF>
#include <QPainter>
#include <QPainterPath>
#include <QRegularExpression>
#include <QtQml/qqml.h>
#include <algorithm>
#include <array>
#include <cmath>
#include <limits>
#include <optional>

namespace nodetool::node_editor {
namespace {
// plotly.js's default colorway (D3 category10), used when layout.colorway is absent.
constexpr std::array<QRgb, 10> DefaultColorway{0x1f77b4, 0xff7f0e, 0x2ca02c, 0xd62728, 0x9467bd,
                                               0x8c564b, 0xe377c2, 0x7f7f7f, 0xbcbd22, 0x17becf};
// plotly.js's default heatmap colorscale (scales.RdBu).
const QList<QPair<double, QColor>> &defaultColorscale() {
  static const QList<QPair<double, QColor>> scale{{0, QColor(5, 10, 172)}, {0.35, QColor(106, 137, 247)},
    {0.5, QColor(190, 190, 190)}, {0.6, QColor(220, 170, 132)}, {0.7, QColor(230, 145, 90)}, {1, QColor(178, 10, 28)}};
  return scale;
}
constexpr qsizetype MaxPoints = 20000;
constexpr double HitRadius = 8;

QColor parseColor(const QVariant &value) {
  const auto text = value.toString().trimmed();
  if (text.isEmpty()) { return {}; }
  static const QRegularExpression rgb(QStringLiteral(R"(^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$)"));
  if (const auto match = rgb.match(text); match.hasMatch()) {
    QColor color(qBound(0, int(match.captured(1).toDouble()), 255), qBound(0, int(match.captured(2).toDouble()), 255),
                 qBound(0, int(match.captured(3).toDouble()), 255));
    if (!match.captured(4).isEmpty()) { color.setAlphaF(float(qBound(0.0, match.captured(4).toDouble(), 1.0))); }
    return color;
  }
  return QColor::fromString(text);
}
QString titleText(const QVariant &value) {
  if (value.typeId() == QMetaType::QVariantMap) { return value.toMap().value("text").toString(); }
  return value.toString();
}
std::optional<double> number(const QVariant &value) {
  if (value.typeId() == QMetaType::Bool || !value.isValid() || value.isNull()) { return std::nullopt; }
  bool ok = false;
  const double result = value.toString().trimmed().isEmpty() ? 0 : value.toDouble(&ok);
  if (!ok || !std::isfinite(result)) { return std::nullopt; }
  return result;
}
QString label(const QVariant &value) {
  if (const auto n = number(value); n && value.typeId() != QMetaType::QString) { return QString::number(*n, 'g', 6); }
  return value.toString();
}
QVariantList listOf(const QVariant &value) {
  auto list = value.toList();
  if (list.size() > MaxPoints) { list = list.mid(0, MaxPoints); }
  return list;
}
QVariantList indices(qsizetype count) {
  QVariantList result;
  for (qsizetype i = 0; i < count; ++i) { result.append(double(i)); }
  return result;
}
// The step between ticks: 1, 2 or 5 times a power of ten, for about `count` ticks.
double niceStep(double span, int count) {
  if (span <= 0) { return 1; }
  const double raw = span / std::max(1, count);
  const double magnitude = std::pow(10, std::floor(std::log10(raw)));
  const double fraction = raw / magnitude;
  return (fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10) * magnitude;
}
QString tickLabel(double value, double step) {
  if (std::abs(value) < step * 1e-9) { value = 0; }
  const int decimals = std::max(0, int(-std::floor(std::log10(step))));
  if (std::abs(value) >= 1e6 || (std::abs(value) > 0 && std::abs(value) < 1e-4)) { return QString::number(value, 'g', 4); }
  return QString::number(value, 'f', decimals);
}

// One axis: linear over numbers, or one slot per category in first-seen order.
struct Axis {
  bool categorical = false;
  QStringList categories;
  double low = std::numeric_limits<double>::max();
  double high = std::numeric_limits<double>::lowest();
  std::optional<std::pair<double, double>> fixed;
  QString title;
  void include(double value) { low = std::min(low, value); high = std::max(high, value); }
  double position(const QVariant &value) {
    if (!categorical) { return number(value).value_or(std::numeric_limits<double>::quiet_NaN()); }
    const auto key = label(value);
    auto index = categories.indexOf(key);
    if (index < 0) { categories.append(key); index = categories.size() - 1; }
    return double(index);
  }
  std::pair<double, double> range(bool pad) const {
    if (fixed) { return *fixed; }
    if (categorical) { return {-0.5, std::max<double>(0, categories.size() - 1) + 0.5}; }
    double a = low, b = high;
    if (a > b) { return {0, 1}; }
    if (a == b) { a -= 1; b += 1; }
    if (pad) {
      const double margin = (b - a) * 0.05;
      if (a != 0) { a -= margin; }
      if (b != 0) { b += margin; }
    }
    return {a, b};
  }
};
bool categoricalValues(const QVariantList &values) {
  return std::any_of(values.begin(), values.end(), [](const QVariant &value) { return !value.isNull() && !number(value); });
}
QColor scaleColor(const QList<QPair<double, QColor>> &scale, double t) {
  t = qBound(0.0, t, 1.0);
  for (qsizetype i = 1; i < scale.size(); ++i) {
    if (t <= scale[i].first) {
      const double span = scale[i].first - scale[i - 1].first;
      const double f = span > 0 ? (t - scale[i - 1].first) / span : 0;
      const auto &a = scale[i - 1].second;
      const auto &b = scale[i].second;
      return QColor::fromRgbF(float(a.redF() + (b.redF() - a.redF()) * f), float(a.greenF() + (b.greenF() - a.greenF()) * f),
                              float(a.blueF() + (b.blueF() - a.blueF()) * f));
    }
  }
  return scale.isEmpty() ? QColor() : scale.last().second;
}
QList<QPair<double, QColor>> colorscaleOf(const QVariant &value) {
  QList<QPair<double, QColor>> scale;
  for (const auto &stop : value.toList()) {
    const auto pair = stop.toList();
    if (pair.size() == 2 && number(pair[0]) && parseColor(pair[1]).isValid()) { scale.append({*number(pair[0]), parseColor(pair[1])}); }
  }
  return scale.size() >= 2 ? scale : defaultColorscale();
}

// A parsed trace, with its values placed on the axes.
struct Trace {
  QString type, name, mode, fill;
  QVariantList x, y, z, values, labels;
  QColor color;
  QVariantList pointColors;
  QVariant colorscale;
  bool horizontal = false;
  double hole = 0;
  double width = 0;        // a bar's slot width in axis units, 0 for automatic
  QVariantList histogram;  // bin edges, for a histogram drawn as bars
  QList<QPair<double, double>> points;  // (category axis, value axis) for bars, (x, y) otherwise
};
}  // namespace

PlotlyChart::PlotlyChart(QQuickItem *parent) : QQuickPaintedItem(parent) {
  setAntialiasing(true);
  setAcceptHoverEvents(false);
}
void PlotlyChart::setFigure(const QVariantMap &figure) {
  figure_ = figure;
  unsupported_.clear();
  traceCount_ = 0;
  for (const auto &value : figure.value("data").toList()) {
    const auto type = value.toMap().value("type", QStringLiteral("scatter")).toString();
    if (QStringList{"scatter", "scattergl", "bar", "histogram", "pie", "heatmap"}.contains(type)) { ++traceCount_; }
    else if (!unsupported_.contains(type)) { unsupported_.append(type); }
  }
  title_ = titleText(figure.value("layout").toMap().value("title"));
  hits_.clear();
  emit figureChanged();
  update();
}
void PlotlyChart::setTextColor(const QColor &color) { if (text_ != color) { text_ = color; emit styleChanged(); update(); } }
void PlotlyChart::setGridColor(const QColor &color) { if (grid_ != color) { grid_ = color; emit styleChanged(); update(); } }
void PlotlyChart::setFont(const QFont &font) { if (font_ != font) { font_ = font; emit styleChanged(); update(); } }

QVariantMap PlotlyChart::pointAt(qreal x, qreal y) const {
  const QPointF at(x, y);
  const Hit *best = nullptr;
  double bestDistance = HitRadius;
  for (const auto &hit : hits_) {
    if (!hit.area.isEmpty() && hit.area.contains(at)) { best = &hit; break; }
    const double distance = QLineF(hit.at, at).length();
    if (hit.area.isEmpty() && distance <= bestDistance) { best = &hit; bestDistance = distance; }
  }
  if (!best) { return {}; }
  QStringList parts;
  if (!best->trace.isEmpty()) { parts << best->trace; }
  parts << (best->x.isEmpty() ? best->y : "(" + best->x + ", " + best->y + ")");
  return {{"trace", best->trace}, {"x", best->x}, {"y", best->y}, {"label", parts.join(": ")}};
}

void PlotlyChart::paint(QPainter *painter) {
  hits_.clear();
  const auto layout = figure_.value("layout").toMap();
  const QRectF bounds(0, 0, width(), height());
  if (bounds.width() < 40 || bounds.height() < 40) { return; }
  painter->setRenderHint(QPainter::Antialiasing);
  if (const auto paper = parseColor(layout.value("paper_bgcolor")); paper.isValid()) { painter->fillRect(bounds, paper); }
  QList<QColor> colorway;
  for (const auto &entry : layout.value("colorway").toList()) { if (const auto c = parseColor(entry); c.isValid()) { colorway.append(c); } }
  if (colorway.isEmpty()) { for (const auto rgb : DefaultColorway) { colorway.append(QColor(rgb)); } }

  // Read the drawable traces.
  QList<Trace> traces;
  for (const auto &value : figure_.value("data").toList()) {
    const auto map = value.toMap();
    Trace trace;
    trace.type = map.value("type", QStringLiteral("scatter")).toString();
    if (trace.type == "scattergl") { trace.type = "scatter"; }
    if (!QStringList{"scatter", "bar", "histogram", "pie", "heatmap"}.contains(trace.type)) { continue; }
    trace.name = map.value("name").toString();
    trace.x = listOf(map.value("x"));
    trace.y = listOf(map.value("y"));
    trace.z = map.value("z").toList().mid(0, 500);
    trace.values = listOf(map.value("values"));
    trace.labels = listOf(map.value("labels"));
    trace.fill = map.value("fill").toString();
    trace.horizontal = map.value("orientation").toString() == "h";
    trace.hole = qBound(0.0, map.value("hole").toDouble(), 0.95);
    const auto marker = map.value("marker").toMap();
    const auto line = map.value("line").toMap();
    trace.color = parseColor(marker.value("color").typeId() == QMetaType::QVariantList ? QVariant() : marker.value("color"));
    if (!trace.color.isValid()) { trace.color = parseColor(line.value("color")); }
    if (!trace.color.isValid()) { trace.color = colorway[traces.size() % colorway.size()]; }
    if (marker.value("color").typeId() == QMetaType::QVariantList) { trace.pointColors = marker.value("color").toList(); }
    else if (trace.type == "pie") { trace.pointColors = marker.value("colors").toList(); }
    trace.colorscale = map.value("colorscale");
    trace.mode = map.value("mode").toString();
    if (trace.mode.isEmpty()) { trace.mode = std::max(trace.x.size(), trace.y.size()) < 20 ? "lines+markers" : "lines"; }
    if (trace.type == "histogram") {
      // Bin the samples into equal bins, nbinsx or about sqrt(n) of them.
      trace.horizontal = trace.x.isEmpty() && !trace.y.isEmpty();
      QList<double> samples;
      for (const auto &sample : trace.horizontal ? trace.y : trace.x) { if (const auto n = number(sample)) { samples.append(*n); } }
      if (samples.isEmpty()) { continue; }
      const auto [lo, hi] = std::minmax_element(samples.begin(), samples.end());
      const int requested = map.value(trace.horizontal ? "nbinsy" : "nbinsx").toInt();
      const int bins = qBound(1, requested > 0 ? requested : int(std::ceil(std::sqrt(double(samples.size())))), 200);
      const double low = *lo, span = *hi > *lo ? *hi - *lo : 1;
      const double size = span / bins;
      QList<double> counts(bins, 0);
      for (const double sample : samples) { counts[std::min(bins - 1, int((sample - low) / size))] += 1; }
      trace.x.clear(); trace.y.clear();
      for (int bin = 0; bin < bins; ++bin) { trace.x.append(low + size * (bin + 0.5)); trace.y.append(counts[bin]); }
      trace.width = size;
      trace.type = "bar";
      if (trace.horizontal) { std::swap(trace.x, trace.y); }
    }
    traces.append(trace);
  }

  QFont font = font_;
  const QFontMetricsF metrics(font);
  QFont titleFont = font;
  titleFont.setPointSizeF(font.pointSizeF() > 0 ? font.pointSizeF() * 1.3 : 13);
  const QFontMetricsF titleMetrics(titleFont);
  QRectF area = bounds.adjusted(6, 6, -6, -6);
  painter->setPen(text_);
  if (!title_.isEmpty()) {
    painter->setFont(titleFont);
    painter->drawText(QRectF(area.left(), area.top(), area.width(), titleMetrics.height()), Qt::AlignHCenter | Qt::AlignVCenter,
                      titleMetrics.elidedText(title_, Qt::ElideRight, area.width()));
    area.setTop(area.top() + titleMetrics.height() + 4);
  }
  painter->setFont(font);
  if (traces.isEmpty()) { return; }

  // Legend entries: one per named or multiple trace, one per slice for a pie.
  const bool pies = std::all_of(traces.begin(), traces.end(), [](const Trace &t) { return t.type == "pie"; });
  QList<QPair<QString, QColor>> legend;
  const bool showLegend = layout.contains("showlegend") ? layout.value("showlegend").toBool() : (pies || traces.size() > 1);
  auto sliceColor = [&](const Trace &trace, qsizetype index) {
    const auto custom = index < trace.pointColors.size() ? parseColor(trace.pointColors[index]) : QColor();
    return custom.isValid() ? custom : colorway[index % colorway.size()];
  };
  if (showLegend) {
    for (const auto &trace : traces) {
      if (trace.type == "pie") {
        for (qsizetype i = 0; i < trace.values.size(); ++i) {
          legend.append({i < trace.labels.size() ? label(trace.labels[i]) : QString::number(i), sliceColor(trace, i)});
        }
      } else if (trace.type != "heatmap") {
        legend.append({trace.name.isEmpty() ? "trace " + QString::number(legend.size()) : trace.name, trace.color});
      }
    }
  }
  if (!legend.isEmpty()) {
    double widest = 0;
    for (const auto &entry : legend) { widest = std::max(widest, metrics.horizontalAdvance(entry.first)); }
    const double legendWidth = std::min(area.width() * 0.35, widest + 22);
    const QRectF box(area.right() - legendWidth, area.top(), legendWidth, area.height());
    double y = box.top();
    for (const auto &entry : legend) {
      if (y + metrics.height() > box.bottom()) { break; }
      painter->fillRect(QRectF(box.left(), y + metrics.height() / 2 - 4, 12, 8), entry.second);
      painter->setPen(text_);
      painter->drawText(QRectF(box.left() + 16, y, box.width() - 16, metrics.height()), Qt::AlignLeft | Qt::AlignVCenter,
                        metrics.elidedText(entry.first, Qt::ElideRight, box.width() - 16));
      y += metrics.height() + 2;
    }
    area.setRight(box.left() - 8);
  }

  if (pies) {
    // Side by side pies, each sliced clockwise from twelve o'clock as plotly does.
    const double slot = area.width() / traces.size();
    for (qsizetype p = 0; p < traces.size(); ++p) {
      const auto &trace = traces[p];
      double total = 0;
      for (const auto &v : trace.values) { total += std::max(0.0, number(v).value_or(0)); }
      if (total <= 0) { continue; }
      const double radius = std::min(slot, area.height()) / 2 - 4;
      const QPointF center(area.left() + slot * (p + 0.5), area.center().y());
      const QRectF circle(center.x() - radius, center.y() - radius, radius * 2, radius * 2);
      double start = 90;
      for (qsizetype i = 0; i < trace.values.size(); ++i) {
        const double share = std::max(0.0, number(trace.values[i]).value_or(0)) / total;
        const double span = -share * 360;
        QPainterPath slice;
        slice.moveTo(center);
        slice.arcTo(circle, start, span);
        slice.closeSubpath();
        painter->setPen(QPen(Qt::white, 1));
        painter->setBrush(sliceColor(trace, i));
        painter->drawPath(slice);
        const double middle = qDegreesToRadians(start + span / 2);
        const QPointF labelAt = center + QPointF(std::cos(middle), -std::sin(middle)) * radius * (trace.hole > 0 ? (1 + trace.hole) / 2 : 0.62);
        const auto name = i < trace.labels.size() ? label(trace.labels[i]) : QString::number(i);
        hits_.append({labelAt, {}, name, {}, QString::number(share * 100, 'f', 1) + "%"});
        if (share >= 0.05) {
          painter->setPen(Qt::white);
          const auto percent = QString::number(share * 100, 'f', 1) + "%";
          painter->drawText(QRectF(labelAt.x() - 30, labelAt.y() - metrics.height() / 2, 60, metrics.height()), Qt::AlignCenter, percent);
        }
        start += span;
      }
      if (trace.hole > 0) {
        painter->setCompositionMode(QPainter::CompositionMode_Clear);
        painter->setPen(Qt::NoPen);
        painter->setBrush(Qt::black);
        painter->drawEllipse(center, radius * trace.hole, radius * trace.hole);
        painter->setCompositionMode(QPainter::CompositionMode_SourceOver);
      }
    }
    return;
  }

  // Cartesian traces: place every value on the two axes.
  traces.removeIf([](const Trace &t) { return t.type == "pie"; });
  Axis xAxis, yAxis;
  xAxis.title = titleText(layout.value("xaxis").toMap().value("title"));
  yAxis.title = titleText(layout.value("yaxis").toMap().value("title"));
  for (auto *axis : {&xAxis, &yAxis}) {
    const auto range = layout.value(axis == &xAxis ? "xaxis" : "yaxis").toMap().value("range").toList();
    if (range.size() == 2 && number(range[0]) && number(range[1])) { axis->fixed = std::make_pair(*number(range[0]), *number(range[1])); }
    const auto type = layout.value(axis == &xAxis ? "xaxis" : "yaxis").toMap().value("type").toString();
    axis->categorical = type == "category";
  }
  for (auto &trace : traces) {
    if (trace.type == "heatmap") {
      const auto rows = trace.z.size();
      const auto cols = rows > 0 ? trace.z.first().toList().size() : 0;
      if (trace.x.isEmpty()) { trace.x = indices(cols); }
      if (trace.y.isEmpty()) { trace.y = indices(rows); }
    } else if (trace.x.isEmpty() && !trace.y.isEmpty()) {
      trace.x = indices(trace.y.size());
    } else if (trace.y.isEmpty() && !trace.x.isEmpty()) {
      trace.y = indices(trace.x.size());
      if (trace.type == "bar") { std::swap(trace.x, trace.y); trace.horizontal = true; }
    }
    if (categoricalValues(trace.x)) { xAxis.categorical = true; }
    if (categoricalValues(trace.y)) { yAxis.categorical = true; }
  }
  const auto barmode = layout.value("barmode", QStringLiteral("group")).toString();
  const auto barTraces = std::count_if(traces.begin(), traces.end(), [](const Trace &t) { return t.type == "bar"; });
  QHash<double, double> stackPositive, stackNegative;
  qsizetype barIndex = 0;
  bool hasBars = false;
  for (auto &trace : traces) {
    const auto count = std::min(trace.x.size(), trace.y.size());
    if (trace.type == "heatmap") {
      for (const auto &v : trace.x) { xAxis.include(xAxis.position(v)); }
      for (const auto &v : trace.y) { yAxis.include(yAxis.position(v)); }
      xAxis.include(xAxis.low - 0.5); xAxis.include(xAxis.high + 0.5);
      yAxis.include(yAxis.low - 0.5); yAxis.include(yAxis.high + 0.5);
      continue;
    }
    for (qsizetype i = 0; i < count; ++i) {
      const double px = xAxis.position(trace.x[i]);
      const double py = yAxis.position(trace.y[i]);
      if (std::isnan(px) || std::isnan(py)) { continue; }
      trace.points.append({px, py});
    }
    if (trace.type == "bar") {
      hasBars = true;
      auto &category = trace.horizontal ? yAxis : xAxis;
      auto &valueAxis = trace.horizontal ? xAxis : yAxis;
      double slot = trace.width;
      if (slot <= 0) {
        slot = 1;
        QList<double> positions;
        for (const auto &[a, b] : trace.points) { positions.append(trace.horizontal ? b : a); }
        std::sort(positions.begin(), positions.end());
        for (qsizetype i = 1; i < positions.size(); ++i) { if (positions[i] > positions[i - 1]) { slot = std::min(slot, positions[i] - positions[i - 1]); } }
      }
      const bool grouped = barmode == "group" && barTraces > 1;
      const double barWidth = slot * (trace.width > 0 ? 1.0 : 0.8) / (grouped ? barTraces : 1);
      const double offset = grouped ? (barIndex - (barTraces - 1) / 2.0) * barWidth : 0;
      trace.width = barWidth;
      QList<QPair<double, double>> bars;
      for (const auto &[a, b] : trace.points) {
        const double position = (trace.horizontal ? b : a) + offset;
        const double value = trace.horizontal ? a : b;
        double base = 0;
        if (barmode == "stack" || barmode == "relative") {
          auto &stack = value >= 0 ? stackPositive : stackNegative;
          base = stack.value(position, 0);
          stack[position] = base + value;
        }
        category.include(position - barWidth / 2);
        category.include(position + barWidth / 2);
        valueAxis.include(base);
        valueAxis.include(base + value);
        bars.append({position, base});
        trace.histogram.append(value);
      }
      trace.points = bars;  // (position, base); the values are in trace.histogram
      ++barIndex;
    } else {
      for (const auto &[a, b] : trace.points) { xAxis.include(a); yAxis.include(b); }
      if (trace.fill == "tozeroy") { yAxis.include(0); }
    }
  }
  const auto [x0, x1] = xAxis.range(!hasBars);
  const auto [y0, y1] = yAxis.range(true);

  // Tick labels and axis titles take room out of the plot area.
  const int yTicks = std::max(2, int(area.height() / (metrics.height() * 2.5)));
  const double yStep = yAxis.categorical ? std::max(1.0, std::ceil(yAxis.categories.size() / double(yTicks))) : niceStep(y1 - y0, yTicks);
  QList<QPair<double, QString>> yLabels;
  if (yAxis.categorical) {
    for (qsizetype i = 0; i < yAxis.categories.size(); i += qsizetype(yStep)) { yLabels.append({double(i), yAxis.categories[i]}); }
  } else {
    for (double v = std::ceil(y0 / yStep) * yStep; v <= y1 + yStep * 1e-9; v += yStep) { yLabels.append({v, tickLabel(v, yStep)}); }
  }
  double yLabelWidth = 0;
  for (const auto &entry : yLabels) { yLabelWidth = std::max(yLabelWidth, metrics.horizontalAdvance(entry.second)); }
  yLabelWidth = std::min(yLabelWidth, area.width() * 0.3);
  QRectF plot = area.adjusted(yLabelWidth + 6 + (yAxis.title.isEmpty() ? 0 : metrics.height() + 4), 4, -4,
                              -(metrics.height() + 6 + (xAxis.title.isEmpty() ? 0 : metrics.height() + 4)));
  if (plot.width() < 20 || plot.height() < 20) { return; }
  if (const auto background = parseColor(layout.value("plot_bgcolor")); background.isValid()) { painter->fillRect(plot, background); }
  auto mapX = [&](double v) { return plot.left() + (v - x0) / (x1 - x0) * plot.width(); };
  auto mapY = [&](double v) { return plot.bottom() - (v - y0) / (y1 - y0) * plot.height(); };

  // Grid, ticks and titles.
  painter->setPen(QPen(grid_, 1));
  for (const auto &[value, text] : yLabels) {
    const double y = mapY(value);
    if (y < plot.top() - 1 || y > plot.bottom() + 1) { continue; }
    painter->setPen(QPen(grid_, 1));
    painter->drawLine(QPointF(plot.left(), y), QPointF(plot.right(), y));
    painter->setPen(text_);
    painter->drawText(QRectF(plot.left() - yLabelWidth - 6, y - metrics.height() / 2, yLabelWidth, metrics.height()),
                      Qt::AlignRight | Qt::AlignVCenter, metrics.elidedText(text, Qt::ElideRight, yLabelWidth));
  }
  QList<QPair<double, QString>> xLabels;
  if (xAxis.categorical) {
    double widest = 0;
    for (const auto &c : xAxis.categories) { widest = std::max(widest, metrics.horizontalAdvance(c)); }
    const double slotWidth = plot.width() / std::max<qsizetype>(1, xAxis.categories.size());
    const auto every = std::max<qsizetype>(1, qsizetype(std::ceil((std::min(widest, 120.0) + 8) / std::max(1.0, slotWidth))));
    for (qsizetype i = 0; i < xAxis.categories.size(); i += every) { xLabels.append({double(i), xAxis.categories[i]}); }
  } else {
    const double xStep = niceStep(x1 - x0, std::max(2, int(plot.width() / 80)));
    for (double v = std::ceil(x0 / xStep) * xStep; v <= x1 + xStep * 1e-9; v += xStep) { xLabels.append({v, tickLabel(v, xStep)}); }
  }
  for (const auto &[value, text] : xLabels) {
    const double x = mapX(value);
    if (x < plot.left() - 1 || x > plot.right() + 1) { continue; }
    if (!xAxis.categorical) { painter->setPen(QPen(grid_, 1)); painter->drawLine(QPointF(x, plot.top()), QPointF(x, plot.bottom())); }
    painter->setPen(text_);
    painter->drawText(QRectF(x - 60, plot.bottom() + 4, 120, metrics.height()), Qt::AlignHCenter | Qt::AlignTop, metrics.elidedText(text, Qt::ElideRight, 120));
  }
  painter->setPen(text_);
  if (!xAxis.title.isEmpty()) {
    painter->drawText(QRectF(plot.left(), plot.bottom() + metrics.height() + 8, plot.width(), metrics.height()), Qt::AlignCenter,
                      metrics.elidedText(xAxis.title, Qt::ElideRight, plot.width()));
  }
  if (!yAxis.title.isEmpty()) {
    painter->save();
    painter->translate(area.left() + metrics.height() / 2, plot.center().y());
    painter->rotate(-90);
    painter->drawText(QRectF(-plot.height() / 2, -metrics.height() / 2, plot.height(), metrics.height()), Qt::AlignCenter,
                      metrics.elidedText(yAxis.title, Qt::ElideRight, plot.height()));
    painter->restore();
  }

  // Marks, clipped to the plot area.
  painter->save();
  painter->setClipRect(plot);
  auto xText = [&](double v) { return xAxis.categorical && v >= 0 && v < xAxis.categories.size() ? xAxis.categories[qsizetype(v)] : QString::number(v, 'g', 6); };
  auto yText = [&](double v) { return yAxis.categorical && v >= 0 && v < yAxis.categories.size() ? yAxis.categories[qsizetype(v)] : QString::number(v, 'g', 6); };
  for (const auto &trace : traces) {
    if (trace.type == "heatmap") {
      double zLow = std::numeric_limits<double>::max(), zHigh = std::numeric_limits<double>::lowest();
      for (const auto &row : trace.z) { for (const auto &cell : row.toList()) { if (const auto n = number(cell)) { zLow = std::min(zLow, *n); zHigh = std::max(zHigh, *n); } } }
      const auto scale = colorscaleOf(trace.colorscale);
      for (qsizetype r = 0; r < trace.z.size() && r < trace.y.size(); ++r) {
        const auto row = trace.z[r].toList();
        const double py = yAxis.position(trace.y[r]);
        for (qsizetype c = 0; c < row.size() && c < trace.x.size(); ++c) {
          const auto n = number(row[c]);
          if (!n) { continue; }
          const double px = xAxis.position(trace.x[c]);
          const QRectF cell(QPointF(mapX(px - 0.5), mapY(py + 0.5)), QPointF(mapX(px + 0.5), mapY(py - 0.5)));
          painter->fillRect(cell.normalized(), scaleColor(scale, zHigh > zLow ? (*n - zLow) / (zHigh - zLow) : 0.5));
          hits_.append({cell.center(), cell.normalized(), trace.name, xText(px) + ", " + yText(py), QString::number(*n, 'g', 6)});
        }
      }
    } else if (trace.type == "bar") {
      for (qsizetype i = 0; i < trace.points.size(); ++i) {
        const auto [position, base] = trace.points[i];
        const double value = trace.histogram[i].toDouble();
        const QRectF bar = trace.horizontal
          ? QRectF(QPointF(mapX(base), mapY(position + trace.width / 2)), QPointF(mapX(base + value), mapY(position - trace.width / 2))).normalized()
          : QRectF(QPointF(mapX(position - trace.width / 2), mapY(base + value)), QPointF(mapX(position + trace.width / 2), mapY(base))).normalized();
        const auto custom = i < trace.pointColors.size() ? parseColor(trace.pointColors[i]) : QColor();
        painter->fillRect(bar, custom.isValid() ? custom : trace.color);
        hits_.append({bar.center(), bar, trace.name, trace.horizontal ? yText(position) : xText(position), QString::number(value, 'g', 6)});
      }
    } else {
      QPolygonF line;
      for (const auto &[a, b] : trace.points) { line.append(QPointF(mapX(a), mapY(b))); }
      if (trace.fill == "tozeroy" || trace.fill == "tonexty") {
        QPolygonF fill = line;
        fill.append(QPointF(line.isEmpty() ? 0 : line.last().x(), mapY(std::max(y0, std::min(0.0, y1)))));
        fill.append(QPointF(line.isEmpty() ? 0 : line.first().x(), mapY(std::max(y0, std::min(0.0, y1)))));
        QColor tint = trace.color;
        tint.setAlphaF(0.5f);
        painter->setPen(Qt::NoPen);
        painter->setBrush(tint);
        painter->drawPolygon(fill);
      }
      if (trace.mode.contains("lines")) {
        painter->setPen(QPen(trace.color, 2, Qt::SolidLine, Qt::RoundCap, Qt::RoundJoin));
        painter->setBrush(Qt::NoBrush);
        painter->drawPolyline(line);
      }
      if (trace.mode.contains("markers")) {
        painter->setPen(Qt::NoPen);
        for (qsizetype i = 0; i < line.size(); ++i) {
          const auto custom = i < trace.pointColors.size() ? parseColor(trace.pointColors[i]) : QColor();
          painter->setBrush(custom.isValid() ? custom : trace.color);
          painter->drawEllipse(line[i], 3.5, 3.5);
        }
      }
      for (qsizetype i = 0; i < line.size(); ++i) {
        hits_.append({line[i], {}, trace.name, xText(trace.points[i].first), yText(trace.points[i].second)});
      }
    }
  }
  painter->restore();
}

void registerPlotlyChart() {
  static const auto registration = qmlRegisterType<PlotlyChart>("NodeTool.NodeEditor.Media", 1, 0, "PlotlyChart");
  Q_UNUSED(registration)
}
}  // namespace nodetool::node_editor
