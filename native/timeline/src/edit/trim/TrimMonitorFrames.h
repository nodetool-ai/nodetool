#pragma once

// The two pictures of the Trim Monitor: each side's clip on its own, as a document
// of that clip, at the frame TrimModel chose. One capture runs per side. While
// it runs, newer positions wait, and only the latest is captured when it ends, so a fast
// trim never queues frames. The last frame stays on screen until the next arrives.

#include "export/FrameCapture.h"

#include <QImage>
#include <QObject>
#include <QPointer>
#include <QString>
#include <QtQmlIntegration/qqmlintegration.h>

class TrimMode;

class TrimMonitorFrames : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_MOC_INCLUDE("edit/trim/TrimMode.h")
    Q_PROPERTY(TrimMode* trim READ trim WRITE setTrim NOTIFY inputsChanged)
    Q_PROPERTY(FrameCapture* capture READ capture WRITE setCapture NOTIFY inputsChanged)
    // False while the picture is hidden: nothing is captured.
    Q_PROPERTY(bool enabled READ enabled WRITE setEnabled NOTIFY inputsChanged)
    Q_PROPERTY(QImage outgoingImage READ outgoingImage NOTIFY framesChanged)
    Q_PROPERTY(QImage incomingImage READ incomingImage NOTIFY framesChanged)
    Q_PROPERTY(QString outgoingError READ outgoingError NOTIFY framesChanged)
    Q_PROPERTY(QString incomingError READ incomingError NOTIFY framesChanged)
    // A side's first frame is on its way, with nothing to show yet.
    Q_PROPERTY(bool outgoingLoading READ outgoingLoading NOTIFY framesChanged)
    Q_PROPERTY(bool incomingLoading READ incomingLoading NOTIFY framesChanged)
    // Captures running, for a test to wait on.
    Q_PROPERTY(int pending READ pending NOTIFY framesChanged)

public:
    explicit TrimMonitorFrames(QObject* parent = nullptr);
    ~TrimMonitorFrames() override;
    TrimMode* trim() const { return m_trim; }
    void setTrim(TrimMode* trim);
    FrameCapture* capture() const { return m_capture; }
    void setCapture(FrameCapture* capture);
    bool enabled() const { return m_enabled; }
    void setEnabled(bool enabled);
    QImage outgoingImage() const { return m_sides[0].image; }
    QImage incomingImage() const { return m_sides[1].image; }
    QString outgoingError() const { return m_sides[0].error; }
    QString incomingError() const { return m_sides[1].error; }
    bool outgoingLoading() const { return m_sides[0].busy && m_sides[0].image.isNull(); }
    bool incomingLoading() const { return m_sides[1].busy && m_sides[1].image.isNull(); }
    int pending() const { return int(m_sides[0].busy) + int(m_sides[1].busy); }

signals:
    void inputsChanged();
    void framesChanged();

private:
    struct Side {
        QByteArray key;
        QImage image;
        QString error;
        int requestId = 0;
        int token = 0;
        bool busy = false;
        bool stale = false;
    };
    void update();
    void updateSide(int index, const QVariantMap& side);
    void cancelSide(Side& side);

    QPointer<TrimMode> m_trim;
    QPointer<FrameCapture> m_capture;
    Side m_sides[2];
    bool m_enabled = true;
};
