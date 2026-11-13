#pragma once
#include <QColor>
#include <QFont>
#include <QList>
#include <QPointF>
#include <QQuickPaintedItem>
#include <QStringList>
#include <QVariantMap>
namespace nodetool::node_editor {
// Draws a Plotly figure ({data, layout}) with QPainter, as the web
// PlotlyChart.tsx draws it with plotly.js. Scatter (lines, markers, filled
// areas), bar, histogram, pie and heatmap traces are drawn. Other trace types
// are listed in unsupportedTypes and left out.
// Thread affinity: UI thread only.
class PlotlyChart : public QQuickPaintedItem {
  Q_OBJECT
  Q_PROPERTY(QVariantMap figure READ figure WRITE setFigure NOTIFY figureChanged)
  Q_PROPERTY(bool supported READ supported NOTIFY figureChanged)
  Q_PROPERTY(int traceCount READ traceCount NOTIFY figureChanged)
  Q_PROPERTY(QStringList unsupportedTypes READ unsupportedTypes NOTIFY figureChanged)
  Q_PROPERTY(QString title READ title NOTIFY figureChanged)
  Q_PROPERTY(QColor textColor READ textColor WRITE setTextColor NOTIFY styleChanged)
  Q_PROPERTY(QColor gridColor READ gridColor WRITE setGridColor NOTIFY styleChanged)
  Q_PROPERTY(QFont font READ font WRITE setFont NOTIFY styleChanged)
public:
  explicit PlotlyChart(QQuickItem *parent = nullptr);
  QVariantMap figure() const { return figure_; }
  void setFigure(const QVariantMap &figure);
  bool supported() const { return traceCount_ > 0; }
  int traceCount() const { return traceCount_; }
  QStringList unsupportedTypes() const { return unsupported_; }
  QString title() const { return title_; }
  QColor textColor() const { return text_; }
  void setTextColor(const QColor &color);
  QColor gridColor() const { return grid_; }
  void setGridColor(const QColor &color);
  QFont font() const { return font_; }
  void setFont(const QFont &font);
  // The drawn point nearest to (x, y) within a few pixels, as the web hover
  // label: {trace, x, y, label}. Empty when no point is near.
  Q_INVOKABLE QVariantMap pointAt(qreal x, qreal y) const;
  void paint(QPainter *painter) override;
signals:
  void figureChanged();
  void styleChanged();
private:
  struct Hit { QPointF at; QRectF area; QString trace, x, y; };
  QVariantMap figure_;
  QStringList unsupported_;
  QString title_;
  int traceCount_ = 0;
  QColor text_{Qt::black};
  QColor grid_{Qt::lightGray};
  QFont font_;
  QList<Hit> hits_;
};
void registerPlotlyChart();
}
