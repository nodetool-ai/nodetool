#pragma once
#include <QObject>
#include <QPointF>
#include <QString>

namespace nodetool::node_editor {

// What the zoom readout (ViewportIndicator.qml), the mini-map buttons
// (MiniMapControls.qml) and their popups (MiniMapPopups.qml) read and do about
// the canvas view: the zoom, the mini-map color mode, the view commands and
// the popup requests.
//
// View commands go up by name ("Zoom in", "Fit selection"), as the window's
// command menu and headless harness name them, and count as user input. The
// owner fills the state with the setters and handles the *Requested signals.
// A test can use a plain instance and a QSignalSpy. QML gets a non-owning
// pointer through a required property.
//
// UI thread only.
class Viewport : public QObject {
    Q_OBJECT
    Q_PROPERTY(int zoomPercent READ zoomPercent NOTIFY zoomChanged)
    // The zoom is one of the readout's presets (ViewportStatusIndicator.tsx findZoomPreset).
    Q_PROPERTY(bool zoomIsPreset READ zoomIsPreset NOTIFY zoomChanged)
    // "default" or "type", as MiniMapStore.ts colorMode.
    Q_PROPERTY(QString miniMapColorMode READ miniMapColorMode NOTIFY colorModeChanged)
public:
    explicit Viewport(QObject *parent = nullptr);
    ~Viewport() override;

    int zoomPercent() const { return zoomPercent_; }
    bool zoomIsPreset() const { return zoomIsPreset_; }
    QString miniMapColorMode() const { return miniMapColorMode_; }

    void setZoom(int percent, bool preset);
    void setMiniMapColorMode(const QString &mode);

    Q_INVOKABLE void run(const QString &command) { emit commandRequested(command); }
    // "colors" or "legend", anchored at the button's bottom right corner.
    Q_INVOKABLE void showPopup(const QString &kind, const QPointF &global) { emit popupRequested(kind, global); }
    Q_INVOKABLE void chooseColorMode(const QString &mode) { emit colorModeRequested(mode); }
    Q_INVOKABLE void closePopup() { emit closePopupRequested(); }

signals:
    void zoomChanged();
    void colorModeChanged();
    void commandRequested(const QString &command);
    void popupRequested(const QString &kind, const QPointF &global);
    void colorModeRequested(const QString &mode);
    void closePopupRequested();

private:
    int zoomPercent_ = 100;
    bool zoomIsPreset_ = true;
    QString miniMapColorMode_ = QStringLiteral("default");
};

}  // namespace nodetool::node_editor
