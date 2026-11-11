// Behaviour ported from FilmCraft (MIT), see licenses/FilmCraft-MIT.txt.
#pragma once
#include <QObject>
#include <QPointF>
#include <QPointer>
#include <QRectF>
#include <QSizeF>
#include <QStringList>
#include <QVariantList>
#include <QtQmlIntegration/qqmlintegration.h>
#include <optional>

class MonitorViewState : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(QSizeF viewportSize READ viewportSize WRITE setViewportSize NOTIFY viewportSizeChanged)
    Q_PROPERTY(QSizeF canvasSize READ canvasSize WRITE setCanvasSize NOTIFY canvasSizeChanged)
    Q_PROPERTY(qreal devicePixelRatio READ devicePixelRatio WRITE setDevicePixelRatio NOTIFY devicePixelRatioChanged)
    Q_PROPERTY(qreal fitInset READ fitInset WRITE setFitInset NOTIFY fitInsetChanged)
    Q_PROPERTY(int playbackResolution READ playbackResolution WRITE setPlaybackResolution NOTIFY playbackResolutionChanged)
    Q_PROPERTY(int pausedResolution READ pausedResolution WRITE setPausedResolution NOTIFY pausedResolutionChanged)
    Q_PROPERTY(bool safeMargins READ safeMargins WRITE setSafeMargins NOTIFY safeMarginsChanged)
    Q_PROPERTY(bool rulers READ rulers WRITE setRulers NOTIFY rulersChanged)
    Q_PROPERTY(bool guidesVisible READ guidesVisible WRITE setGuidesVisible NOTIFY guidesVisibleChanged)
    Q_PROPERTY(bool guidesLocked READ guidesLocked WRITE setGuidesLocked NOTIFY guidesLockedChanged)
    Q_PROPERTY(bool transparencyGrid READ transparencyGrid WRITE setTransparencyGrid NOTIFY transparencyGridChanged)
    Q_PROPERTY(bool showControls READ showControls WRITE setShowControls NOTIFY showControlsChanged)
    Q_PROPERTY(QString displayMode READ displayMode WRITE setDisplayMode NOTIFY displayModeChanged)
    Q_PROPERTY(bool fit READ fit NOTIFY fitChanged)
    Q_PROPERTY(qreal zoom READ zoom NOTIFY zoomChanged)
    Q_PROPERTY(QPointF pan READ pan NOTIFY panChanged)
    Q_PROPERTY(QRectF pictureRect READ pictureRect NOTIFY pictureRectChanged)
    Q_PROPERTY(QRectF visibleItemRect READ visibleItemRect NOTIFY visibleItemRectChanged)
    Q_PROPERTY(QRectF visibleCanvasRect READ visibleCanvasRect NOTIFY visibleCanvasRectChanged)
    Q_PROPERTY(bool canPan READ canPan NOTIFY canPanChanged)
    Q_PROPERTY(QVariantList guides READ guides NOTIFY guidesChanged)
    // The editor's gesture controller, so a menu acts on the monitor of its own editor.
    Q_PROPERTY(QObject* owner READ owner WRITE setOwner NOTIFY ownerChanged)
public:
    explicit MonitorViewState(QObject* parent = nullptr);
    ~MonitorViewState() override;
    static MonitorViewState* current();
    // The monitor owned by `owner`, or current() when no live monitor has that owner.
    static MonitorViewState* forOwner(const QObject* owner);
    QObject* owner() const { return m_owner; }
    void setOwner(QObject* value);
    QSizeF viewportSize() const { return m_viewportSize; }
    void setViewportSize(QSizeF value);
    QSizeF canvasSize() const { return m_canvasSize; }
    void setCanvasSize(QSizeF value);
    qreal devicePixelRatio() const { return m_devicePixelRatio; }
    void setDevicePixelRatio(qreal value);
    qreal fitInset() const { return m_fitInset; }
    void setFitInset(qreal value);
    int playbackResolution() const { return m_playbackResolution; }
    void setPlaybackResolution(int value);
    int pausedResolution() const { return m_pausedResolution; }
    void setPausedResolution(int value);
    bool safeMargins() const { return m_safeMargins; }
    void setSafeMargins(bool value);
    bool rulers() const { return m_rulers; }
    void setRulers(bool value);
    bool guidesVisible() const { return m_guidesVisible; }
    void setGuidesVisible(bool value);
    bool guidesLocked() const { return m_guidesLocked; }
    void setGuidesLocked(bool value);
    bool transparencyGrid() const { return m_transparencyGrid; }
    void setTransparencyGrid(bool value);
    bool showControls() const { return m_showControls; }
    void setShowControls(bool value);
    QString displayMode() const { return m_displayMode; }
    void setDisplayMode(QString value);
    bool fit() const { return m_fit; }
    qreal zoom() const { return m_zoom; }
    QPointF pan() const { return m_pan; }
    QRectF pictureRect() const { return m_pictureRect; }
    QRectF visibleItemRect() const { return m_visibleItemRect; }
    QRectF visibleCanvasRect() const { return m_visibleCanvasRect; }
    bool canPan() const { return m_canPan; }
    QVariantList guides() const { return m_guides; }
    Q_INVOKABLE void setFit();
    Q_INVOKABLE void setZoomPercent(double percent);
    Q_INVOKABLE void zoomAt(QPointF pointer, double factor);
    Q_INVOKABLE void zoomByWheelNotches(QPointF pointer, double notches);
    Q_INVOKABLE void panBy(QPointF delta);
    Q_INVOKABLE int addGuide(bool vertical, double position);
    Q_INVOKABLE void moveGuide(int index, double position);
    Q_INVOKABLE void removeGuide(int index);
    Q_INVOKABLE void clearGuides();
    // Sets several options at once, for --monitor-state: zoomPercent, the writable properties
    // by name, and guides ([{vertical, position}]). Unknown keys are returned so a caller can refuse them.
    QStringList applyState(const QVariantMap& state);
signals:
    void viewportSizeChanged();
    void canvasSizeChanged();
    void devicePixelRatioChanged();
    void fitInsetChanged();
    void playbackResolutionChanged();
    void pausedResolutionChanged();
    void safeMarginsChanged();
    void rulersChanged();
    void guidesVisibleChanged();
    void guidesLockedChanged();
    void transparencyGridChanged();
    void showControlsChanged();
    void displayModeChanged();
    void fitChanged();
    void zoomChanged();
    void panChanged();
    void pictureRectChanged();
    void visibleItemRectChanged();
    void visibleCanvasRectChanged();
    void canPanChanged();
    void guidesChanged();
    void ownerChanged();
private:
    void recompute(std::optional<QPointF> pan = std::nullopt);
    std::optional<double> m_explicitZoom;
    QSizeF m_viewportSize = QSizeF();
    QSizeF m_canvasSize = QSizeF();
    qreal m_devicePixelRatio = 1;
    qreal m_fitInset = 8;
    int m_playbackResolution = 1;
    int m_pausedResolution = 1;
    bool m_safeMargins = false;
    bool m_rulers = false;
    bool m_guidesVisible = true;
    bool m_guidesLocked = false;
    bool m_transparencyGrid = false;
    bool m_showControls = true;
    QString m_displayMode = QStringLiteral("composite");
    bool m_fit = true;
    qreal m_zoom = 0;
    QPointF m_pan = {};
    QRectF m_pictureRect = {};
    QRectF m_visibleItemRect = {};
    QRectF m_visibleCanvasRect = {};
    bool m_canPan = false;
    QVariantList m_guides = {};
    QPointer<QObject> m_owner;
};
