#pragma once

// A frame source that runs one module of a shader catalog on the wgpu
// compute engine, over and over, on its own thread. Each frame is written
// straight into a shareable texture of the frame ring and published once
// the GPU has finished it.

#include "GpuFrameSource.h"

#include <QString>
#include <QVariantMap>
#include <QtQml/qqmlregistration.h>

#include <memory>
#include <thread>

namespace nt::preview {

struct ShaderWorkerState;

// Thread affinity: GUI thread only. The worker thread shares
// ShaderWorkerState with it, guarded by the mutex inside.
class ShaderFrameSource : public GpuFrameSource {
    Q_OBJECT
    QML_ELEMENT
    // The shader catalog document (graph-runner gpu_catalog.h), as JSON text.
    Q_PROPERTY(QString catalog READ catalog WRITE setCatalog NOTIFY catalogChanged)
    // The module to run, "id@version". Compute and fragment modules work.
    Q_PROPERTY(QString module READ module WRITE setModule NOTIFY moduleChanged)
    // Module params. The source adds "time" (seconds since start) and
    // "frame" (a counter) to each frame's params.
    Q_PROPERTY(QVariantMap params READ params WRITE setParams NOTIFY paramsChanged)
    Q_PROPERTY(bool running READ running WRITE setRunning NOTIFY runningChanged)
    // Rgba8 or Rgba16Float. The module must write that storage format.
    Q_PROPERTY(Format format READ format WRITE setFormat NOTIFY formatChanged)
    // Display: render the next frame when the last one was taken, so no
    // frame is wasted. Free: render as fast as slots allow.
    Q_PROPERTY(Pacing pacing READ pacing WRITE setPacing NOTIFY pacingChanged)
    // The frame size in pixels. Empty: follow the attached item.
    Q_PROPERTY(QSize frameSize READ frameSize WRITE setFrameSize NOTIFY frameSizeChanged)
    Q_PROPERTY(QString device READ device NOTIFY deviceChanged)

public:
    enum Format { Rgba8, Rgba16Float };
    Q_ENUM(Format)
    enum Pacing { Display, Free };
    Q_ENUM(Pacing)

    // `parent` is the QObject parent, which owns the source when set.
    explicit ShaderFrameSource(QObject* parent = nullptr);
    ~ShaderFrameSource() override;

    QString catalog() const { return m_catalog; }
    void setCatalog(const QString& catalog);
    QString module() const { return m_module; }
    void setModule(const QString& module);
    QVariantMap params() const { return m_params; }
    void setParams(const QVariantMap& params);
    bool running() const { return m_running; }
    void setRunning(bool running);
    Format format() const { return m_format; }
    void setFormat(Format format);
    Pacing pacing() const { return m_pacing; }
    void setPacing(Pacing pacing);
    QSize frameSize() const { return m_frameSize; }
    void setFrameSize(const QSize& size);
    QString device() const { return m_device; }

signals:
    void catalogChanged();
    void moduleChanged();
    void paramsChanged();
    void runningChanged();
    void formatChanged();
    void pacingChanged();
    void frameSizeChanged();
    void deviceChanged();

private:
    void pushState();
    void setDevice(const QString& description);

    QString m_catalog;
    QString m_module;
    QVariantMap m_params;
    bool m_running = true;
    Format m_format = Rgba8;
    Pacing m_pacing = Display;
    QSize m_frameSize;
    QString m_device;
    // Shared with the worker thread, which may still be reading it while
    // this object is destroyed (the destructor joins before it lets go).
    std::shared_ptr<ShaderWorkerState> m_state;
    std::jthread m_worker;
};

}  // namespace nt::preview
