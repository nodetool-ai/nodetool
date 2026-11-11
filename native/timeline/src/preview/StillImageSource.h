#pragma once

#include "preview/LayerSource.h"

#include <QImage>
#include <QString>

#include <memory>

namespace nt {

// A still image as one premultiplied RGBA8 texture. It keeps the alpha channel
// that the YUV decoder path rejects (D10a), so a transparent PNG draws as
// the web preview does. A worker thread decodes the file. The render thread
// uploads it once and then reuses the texture.
class StillImageSource final : public LayerSource {
public:
    explicit StillImageSource(const QString& path);
    ~StillImageSource() override;

    QSize frameSize() const override { return m_size; }
    LayerFrame frameAt(const FrameContext& ctx, double sourceTimeMs) override;

    // Whether the file decodes as an image (QImageReader can read it).
    static bool canRead(const QString& path);

private:
    struct Decode;
    std::shared_ptr<Decode> m_decode;
    QSize m_size;
    std::unique_ptr<QRhiTexture> m_texture;
};

}  // namespace nt
