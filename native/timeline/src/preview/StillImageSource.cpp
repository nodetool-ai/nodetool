#include "preview/StillImageSource.h"

#include <QImageReader>

#include <atomic>
#include <mutex>
#include <thread>

namespace nt {

struct StillImageSource::Decode {
    std::mutex mutex;
    QImage image;
    std::atomic<bool> done{false};
};

namespace {
QSize orientedSize(QImageReader& reader) {
    reader.setAutoTransform(true);
    QSize size = reader.size();
    if (reader.transformation() & QImageIOHandler::TransformationRotate90) size.transpose();
    return size;
}
}  // namespace

bool StillImageSource::canRead(const QString& path) {
    QImageReader reader(path);
    return reader.canRead() && reader.size().isValid();
}

StillImageSource::StillImageSource(const QString& path) : m_decode(std::make_shared<Decode>()) {
    // A reader that cannot open its file instantiates every image format
    // plugin. Doing that on the detached worker races with the plugin
    // teardown at exit (ThreadSanitizer). Instantiate them here, once.
    [[maybe_unused]] static const QList<QByteArray> plugins = QImageReader::supportedImageFormats();
    QImageReader reader(path);
    m_size = orientedSize(reader);
    // The thread owns its share of the result, so closing the clip never
    // waits for a decode.
    std::thread([decode = m_decode, path] {
        QImageReader worker(path);
        // EXIF orientation, as the browser applies it.
        worker.setAutoTransform(true);
        QImage image = worker.read().convertToFormat(QImage::Format_RGBA8888_Premultiplied);
        {
            std::lock_guard lock(decode->mutex);
            decode->image = std::move(image);
        }
        decode->done = true;
    }).detach();
}

StillImageSource::~StillImageSource() = default;

LayerFrame StillImageSource::frameAt(const FrameContext& ctx, double) {
    LayerFrame frame;
    if (!m_texture) {
        if (!ctx.rhi || !ctx.updates || !m_decode->done) return frame;
        QImage image;
        {
            std::lock_guard lock(m_decode->mutex);
            image = std::move(m_decode->image);
        }
        if (image.isNull()) return frame;
        m_size = image.size();
        m_texture.reset(ctx.rhi->newTexture(QRhiTexture::RGBA8, m_size));
        if (!m_texture->create()) {
            m_texture.reset();
            return frame;
        }
        ctx.updates->uploadTexture(m_texture.get(), image);
        frame.cpuCopies = 1;
    }
    frame.format = LayerFrame::Format::Rgba8Premultiplied;
    // Encoded sRGB, uploaded without transfer conversion, like raster layers.
    frame.transfer = "iec61966-2-1";
    frame.planes[0] = m_texture.get();
    frame.size = m_size;
    return frame;
}

}  // namespace nt
