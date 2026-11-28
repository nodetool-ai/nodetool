#pragma once

#include "SceneLayerItem.h"
#include "model/LaneClipModel.h"
#include <QPointer>
#include <QSet>

// GUI thread snapshots model clips or scalar detail properties into commands.
// SceneLayerItem copies them only in updatePaintNode while the GUI is blocked.
// The scene graph owns geometry and textures, never model pointers or QObjects.
class ClipChromeLayer : public SceneLayerItem {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(QObject* detail READ detail WRITE setDetail NOTIFY detailChanged)
    Q_PROPERTY(bool backgroundOnly MEMBER m_backgroundOnly NOTIFY backgroundOnlyChanged)
    Q_PROPERTY(LaneClipModel* model READ model WRITE setModel NOTIFY modelChanged)
    Q_PROPERTY(TimelineViewState* viewState READ viewState WRITE setViewState NOTIFY viewStateChanged)
    Q_PROPERTY(QColor videoFill MEMBER m_videoFill NOTIFY videoFillChanged)
    Q_PROPERTY(QColor audioFill MEMBER m_audioFill NOTIFY audioFillChanged)
    Q_PROPERTY(QColor overlayFill MEMBER m_overlayFill NOTIFY overlayFillChanged)
    Q_PROPERTY(QColor midiFill MEMBER m_midiFill NOTIFY midiFillChanged)
    Q_PROPERTY(QColor adjustmentFill MEMBER m_adjustmentFill NOTIFY adjustmentFillChanged)
    Q_PROPERTY(QColor fallbackFill MEMBER m_fallbackFill NOTIFY fallbackFillChanged)
    Q_PROPERTY(QColor canvas MEMBER m_canvas NOTIFY canvasChanged)
    Q_PROPERTY(QColor outlineColor MEMBER m_outlineColor NOTIFY outlineColorChanged)
    Q_PROPERTY(QColor ink MEMBER m_ink NOTIFY inkChanged)
    Q_PROPERTY(QColor fxFill MEMBER m_fxFill NOTIFY fxFillChanged)
    Q_PROPERTY(QColor fxInk MEMBER m_fxInk NOTIFY fxInkChanged)
    Q_PROPERTY(QObject* nameStyle READ nameStyle WRITE setNameStyle NOTIFY nameStyleChanged)
    Q_PROPERTY(QObject* durationStyle READ durationStyle WRITE setDurationStyle NOTIFY durationStyleChanged)
    Q_PROPERTY(double bandHeight MEMBER m_bandHeight NOTIFY bandHeightChanged)
    Q_PROPERTY(double small MEMBER m_small NOTIFY smallChanged)
    Q_PROPERTY(double medium MEMBER m_medium NOTIFY mediumChanged)
    Q_PROPERTY(double micro MEMBER m_micro NOTIFY microChanged)
    Q_PROPERTY(bool dark MEMBER m_dark NOTIFY darkChanged)
    Q_PROPERTY(bool coversLane READ coversLane NOTIFY coversLaneChanged)
    Q_PROPERTY(int overlapRevision READ overlapRevision NOTIFY overlapsChanged)
public:
    explicit ClipChromeLayer(QQuickItem* parent = nullptr);
    QObject* detail() const { return m_detail; }
    void setDetail(QObject* detail);
    QObject* nameStyle() const { return m_nameStyle; }
    QObject* durationStyle() const { return m_durationStyle; }
    void setNameStyle(QObject* style);
    void setDurationStyle(QObject* style);
    LaneClipModel* model() const { return m_model; }
    void setModel(LaneClipModel* model);
    TimelineViewState* viewState() const { return m_view; }
    void setViewState(TimelineViewState* view);
    bool coversLane() const { return m_coversLane; }
    int overlapRevision() const { return m_overlapRevision; }
    Q_INVOKABLE bool overlaps(const QString& id) const { return m_overlaps.contains(id); }
    Q_INVOKABLE void setDetailed(const QString& id, bool detailed);
    int buildCount() const { return m_buildCount; }
    int clipCount() const { return m_clipCount; }
signals:
    void detailChanged();
    void backgroundOnlyChanged();
    void modelChanged();
    void viewStateChanged();
    void videoFillChanged();
    void audioFillChanged();
    void overlayFillChanged();
    void midiFillChanged();
    void adjustmentFillChanged();
    void fallbackFillChanged();
    void canvasChanged();
    void outlineColorChanged();
    void inkChanged();
    void fxFillChanged();
    void fxInkChanged();
    void nameStyleChanged();
    void durationStyleChanged();
    void bandHeightChanged();
    void smallChanged();
    void mediumChanged();
    void microChanged();
    void darkChanged();
    void coversLaneChanged();
    void overlapsChanged();
protected:
    void prepare() override;
private:
    // GUI-thread value record used while preparing drawing commands.
    struct Chrome {
        QString name;
        double durationMs = 0, left = 0, width = 0, opacity = 1, borderWidth = 1;
        QColor band, body, border;
        bool hasEffects = false;
    };
    void drawChrome(const Chrome& clip, const QFont& nameFont, const QFont& durationFont, bool background, bool foreground);
    void updateRange();
    QPointer<QObject> m_detail;
    bool m_backgroundOnly = false;
    QPointer<LaneClipModel> m_model;
    QPointer<TimelineViewState> m_view;
    QSet<QString> m_details, m_overlaps;
    int m_overlapRevision = 0;
    QColor m_videoFill, m_audioFill, m_overlayFill, m_midiFill, m_adjustmentFill, m_fallbackFill;
    QColor m_canvas, m_ink, m_fxFill, m_fxInk, m_outlineColor;
    QPointer<QObject> m_nameStyle, m_durationStyle;
    double m_bandHeight = 16, m_small = 4, m_medium = 8, m_micro = 2;
    double m_scale = 0;
    bool m_dark = true;
    bool m_coversLane = false;
    quint64 m_modelRevision = 0;
    int m_buildCount = 0, m_clipCount = 0;
};
