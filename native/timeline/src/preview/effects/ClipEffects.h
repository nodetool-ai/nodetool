#pragma once
#include "preview/layers/LayerRegistry.h"
#include "preview/effects/Masks.h"
#include <QJsonArray>
#include <QRect>
#include <QString>
#include <array>
#include <cstdint>
#include <list>
#include <memory>
#include <optional>
#include <vector>

namespace nt { struct SceneDecorationContext; }

namespace nt::effects {
// Values match the branches in clip.frag. Recipes expand into these primitives.
enum class Op {
    Copy,
    Grade,
    Gaussian,
    Pixelate,
    Posterize,
    Spherize,
    Vignette,
    Sharpen,
    ChromaKey,
    Curves,
    Levels,
    Cdl,
    LiftGammaGain,
    Grain,
    Lut,
    Threshold,
    AlphaMask,
    Add,
    Shadow,
    ToStraight,
    ToPremul,
    VisualFx,
    MaskApply,
    MaskDerive,
    ScaleOpacity,
    MixTreatment
};
struct Pass {
    Op op = Op::Copy;
    std::array<float, 16> params{};
    QString cube;
};
struct CurveKnobs {
    double black = 0, white = 1, shadows = 0, midtones = 0, highlights = 0;
};
struct Cube {
    int size = 0;
    std::array<float, 3> minimum{0, 0, 0}, maximum{1, 1, 1};
    std::vector<float> rgb;
};
std::uint16_t cubeHalfBits(float value);
std::optional<Cube> parseCube(const QString &text);
CurveKnobs fitCurve(const QJsonArray &points);
double channelMidtones(const QJsonArray &points);
std::vector<Pass> planChain(const QJsonArray &effects, const QJsonArray &trackEffects = {});
QMargins chainOutset(const QJsonArray &effects);
QRect cropPixels(const QJsonObject &ext, QSize inputSize);
void decorateEffects(QJsonObject &ext, const Clip &clip, double timeMs = 0);
void decorateEffects(QJsonObject &ext, const Clip &clip, const SceneDecorationContext &context);
void decorateTrackEffects(QJsonObject &ext, const Track *track);
bool decorateAdjustment(SceneAdjustment &, const Clip &, const SceneDecorationContext &);
class DrawCache;
class ClipEffectStage final : public LayerEffectStage {
  public:
    bool applies(const QJsonObject &ext) const override;
    QMargins outset(const QJsonObject &ext, QSize size) const override;
    bool render(const EffectContext &, const LayerFrame &, QRhiTextureRenderTarget &, const QJsonObject &) override;

  private:
    friend class TestEffectResources;
    struct Lut;
    std::shared_ptr<DrawCache> m_drawCache;
    std::list<std::pair<QByteArray, std::shared_ptr<Lut>>> m_luts;
};
class AdjustmentTreatment {
  public:
    bool applies(const QJsonObject &) const;
    bool render(const EffectContext &, const LayerFrame &, QRhiTextureRenderTarget &, const SceneAdjustment &);

  private:
    ClipEffectStage m_chain;
    MaskRasterizer m_rasterizer;
    std::shared_ptr<DrawCache> m_cache;
};
} // namespace nt::effects
