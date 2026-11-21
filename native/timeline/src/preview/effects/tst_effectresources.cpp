#include "preview/effects/ClipEffects.h"
#include "preview/effects/Masks.h"
#include "preview/effects/DrawCache.h"
#include "preview/RetireQueue.h"
#include <QCryptographicHash>
#include <QtTest>
#include <rhi/qrhi_platform.h>
#include <algorithm>

namespace nt::effects {
namespace {
struct Target {
    std::unique_ptr<QRhiTexture> texture;
    std::unique_ptr<QRhiRenderPassDescriptor> descriptor;
    std::unique_ptr<QRhiTextureRenderTarget> target;
    bool create(QRhi *rhi, QSize size, QRhiTexture::Format format = QRhiTexture::RGBA8) {
        texture.reset(rhi->newTexture(format, size, 1, QRhiTexture::RenderTarget));
        if (!texture->create()) { return false; }
        target.reset(rhi->newTextureRenderTarget({QRhiColorAttachment(texture.get())}));
        descriptor.reset(target->newCompatibleRenderPassDescriptor());
        target->setRenderPassDescriptor(descriptor.get());
        return target->create();
    }
};
QString cube(int index) {
    QString text = "LUT_3D_SIZE 2\n";
    for (int b = 0; b < 2; ++b) {
        for (int g = 0; g < 2; ++g) {
            for (int r = 0; r < 2; ++r) {
                text += QString("%1 %2 %3\n").arg(r * (index + 1) / 10.0).arg(g).arg(b);
            }
        }
    }
    return text;
}
QByteArray key(int index) { return QCryptographicHash::hash(cube(index).toUtf8(), QCryptographicHash::Sha256); }
} // namespace
class TestEffectResources : public QObject {
    Q_OBJECT
  private slots:
    void adjustmentResources() {
        QRhiNullInitParams init;
        auto rhi = std::unique_ptr<QRhi>(QRhi::create(QRhi::Null, &init)); QVERIFY(rhi);
        Target input, output; QVERIFY(input.create(rhi.get(), {64, 32})); QVERIFY(output.create(rhi.get(), {64, 32}));
        RetireQueue retire;
        QRhiCommandBuffer *commands = nullptr;
        QCOMPARE(rhi->beginOffscreenFrame(&commands), QRhi::FrameOpSuccess);
        const EffectContext context{rhi.get(), commands, 7, &retire};
        LayerFrame frame; frame.format = LayerFrame::Format::Rgba8Premultiplied;
        frame.size = {64, 32}; frame.planes[0] = input.texture.get(); frame.flipV = true;
        auto treatment = std::make_unique<AdjustmentTreatment>();
        SceneAdjustment adjustment;
        adjustment.opacity = 0.5;
        adjustment.wipe = scene::WipeMask{"up", 0.1, 0.4};
        adjustment.ext = {{"adjustmentTreatment", true},
            {"clipEffects", QJsonArray{QJsonObject{{"type", "color"}, {"enabled", true}, {"brightness", 0.3}},
                QJsonObject{{"type", "blur"}, {"enabled", true}, {"radius", 10}}}},
            {"shapeMask", QJsonObject{{"kind", "rect"}, {"width", 0.5}, {"height", 1}, {"invert", true}}}};
        QVERIFY(!treatment->applies({})); QVERIFY(treatment->applies(adjustment.ext));
        QVERIFY(treatment->render(context, frame, *output.target, adjustment));
        const auto queued = retire.size(); QVERIFY(queued > 0);
        adjustment.ext.insert("clipEffects", QJsonArray{QJsonObject{{"type", "lut"}, {"enabled", true}, {"cube", "invalid"}}});
        QTest::ignoreMessage(QtWarningMsg, "Invalid .cube in clip effect");
        QVERIFY(!treatment->render(context, frame, *output.target, adjustment));
        QVERIFY(retire.size() > queued);
        QCOMPARE(rhi->endOffscreenFrame(), QRhi::FrameOpSuccess);
        treatment.reset();
        retire.collect(8, 2); QVERIFY(!retire.empty());
        retire.collect(9, 2); QVERIFY(retire.empty());
    }
    void maskStageResources() {
        QRhiNullInitParams init;
        auto rhi=std::unique_ptr<QRhi>(QRhi::create(QRhi::Null,&init)); QVERIFY(rhi);
        Target a,b,out; QVERIFY(a.create(rhi.get(),{64,32})); QVERIFY(b.create(rhi.get(),{64,32})); QVERIFY(out.create(rhi.get(),{64,32}));
        RetireQueue retire; QRhiCommandBuffer *commands=nullptr;
        QCOMPARE(rhi->beginOffscreenFrame(&commands),QRhi::FrameOpSuccess);
        EffectContext ctx{rhi.get(),commands,1,&retire};
        LayerFrame layer; layer.format=LayerFrame::Format::Rgba8Premultiplied; layer.size={64,32}; layer.planes[0]=a.texture.get();
        auto matte=layer; matte.planes[0]=b.texture.get(); matte.flipV=true;
        {
            ShapeMaskStage shape;
            QVERIFY(!shape.applies({}));
            QVERIFY(!shape.applies({{"shapeMask",QJsonObject{{"kind","rect"}}},{"effectGroupSurface",true}}));
            QVERIFY(shape.render(ctx,layer,*out.target,{{"shapeMask",QJsonObject{{"kind","ellipse"},{"featherPx",4}}}}));
            QVERIFY(shape.render(ctx,layer,*out.target,{{"shapeMask",QJsonObject{{"kind","unknown"}}}}));
            ImageMatteStage stage;
            for (const auto mode : {"alpha","luma"}) { for (const bool invert : {false,true}) {
                const LayerMatte info{mode,invert,{},0.5,9};
                QVERIFY(stage.render(ctx,layer,matte,*out.target,info,{}));
            } }
            GeneratedMatteSourceStage secondary;
            QVERIFY(!secondary.render(ctx,layer,*out.target,{}));
            std::map<std::string,LayerFrame> sources{{"j-generated-matte",matte}}; ctx.sources=&sources;
            QVERIFY(secondary.render(ctx,layer,*out.target,{}));
        }
        QVERIFY(retire.size()>0);
        QCOMPARE(rhi->endOffscreenFrame(),QRhi::FrameOpSuccess);
        retire.collect(3,2); QCOMPARE(retire.size(),size_t{0});
    }
    void compatiblePipelinesAndRetirement() {
        QRhiNullInitParams init;
        auto rhi = std::unique_ptr<QRhi>(QRhi::create(QRhi::Null, &init));
        QVERIFY(rhi);
        Target a, b, c;
        QVERIFY(a.create(rhi.get(), {32, 16}));
        QVERIFY(b.create(rhi.get(), {64, 32}));
        QVERIFY(c.create(rhi.get(), {32, 16}, QRhiTexture::RGBA16F));
        RetireQueue retire;
        QRhiCommandBuffer *commands = nullptr;
        QCOMPARE(rhi->beginOffscreenFrame(&commands), QRhi::FrameOpSuccess);
        const EffectContext ctx{rhi.get(), commands, 7, &retire};
        auto cache = std::make_shared<DrawCache>();
        QVERIFY(cache->initialize(ctx, ":/effects/clip.vert.qsb", ":/effects/clip.frag.qsb", QRhiSampler::Linear));
        auto *vertices = cache->vertices();
        auto *sampler = cache->sampler();
        // Cached initialization must not reload shaders or replace resources.
        QVERIFY(cache->initialize(ctx, ":/missing.vert", ":/missing.frag", QRhiSampler::Nearest));
        QCOMPARE(cache->vertices(), vertices);
        QCOMPARE(cache->sampler(), sampler);
        auto uniforms = std::unique_ptr<QRhiBuffer>(rhi->newBuffer(QRhiBuffer::Dynamic, QRhiBuffer::UniformBuffer, 256));
        QVERIFY(uniforms->create());
        auto bindings = std::unique_ptr<QRhiShaderResourceBindings>(rhi->newShaderResourceBindings());
        bindings->setBindings({QRhiShaderResourceBinding::uniformBuffer(
                                  0, QRhiShaderResourceBinding::VertexStage | QRhiShaderResourceBinding::FragmentStage,
                                  uniforms.get()),
                              QRhiShaderResourceBinding::sampledTexture(1, QRhiShaderResourceBinding::FragmentStage,
                                                                        a.texture.get(), sampler),
                              QRhiShaderResourceBinding::sampledTexture(2, QRhiShaderResourceBinding::FragmentStage,
                                                                        a.texture.get(), sampler),
                              QRhiShaderResourceBinding::sampledTexture(3, QRhiShaderResourceBinding::FragmentStage,
                                                                        a.texture.get(), sampler)});
        QVERIFY(bindings->create());
        auto *first = cache->pipeline(rhi.get(), *a.target, bindings.get());
        QVERIFY(first);
        QCOMPARE(cache->pipeline(rhi.get(), *b.target, bindings.get()), first);
        auto *different = cache->pipeline(rhi.get(), *c.target, bindings.get());
        QVERIFY(different);
        QCOMPARE(different == first, c.descriptor->isCompatible(a.descriptor.get()));
        QCOMPARE(cache->pipeline(rhi.get(), *a.target, bindings.get()), first);
        QCOMPARE(rhi->endOffscreenFrame(), QRhi::FrameOpSuccess);
        const std::weak_ptr<DrawCache> lifetime = cache;
        retire.retire(std::move(cache), 7);
        retire.collect(8, 2);
        QVERIFY(!lifetime.expired());
        retire.collect(9, 2);
        QVERIFY(lifetime.expired());
    }
    void boundedLutsAndRetirement() {
        QRhiNullInitParams init;
        auto rhi = std::unique_ptr<QRhi>(QRhi::create(QRhi::Null, &init));
        QVERIFY(rhi);
        Target source, output;
        QVERIFY(source.create(rhi.get(), {32, 16}));
        QVERIFY(output.create(rhi.get(), {32, 16}));
        RetireQueue retire;
        QRhiCommandBuffer *commands = nullptr;
        QCOMPARE(rhi->beginOffscreenFrame(&commands), QRhi::FrameOpSuccess);
        const EffectContext ctx{rhi.get(), commands, 1, &retire};
        LayerFrame input;
        input.format = LayerFrame::Format::Rgba8Premultiplied;
        input.size = {32, 16};
        input.planes[0] = source.texture.get();
        auto stage = std::make_unique<ClipEffectStage>();
        const auto draw = [&](int index) {
            const QJsonObject effect{{"type", "lut"}, {"enabled", true}, {"cube", cube(index)}, {"intensity", 1}};
            return stage->render(ctx, input, *output.target, {{"clipEffects", QJsonArray{effect}}});
        };
        for (int i = 0; i < 8; ++i) { QVERIFY(draw(i)); }
        QCOMPARE(stage->m_luts.size(), size_t{8});
        const std::weak_ptr<void> oldest = stage->m_luts.back().second;
        QVERIFY(draw(0));
        QCOMPARE(stage->m_luts.front().first, key(0));
        QVERIFY(oldest.lock() == stage->m_luts.front().second);
        const std::weak_ptr<void> evicted = stage->m_luts.back().second;
        QCOMPARE(stage->m_luts.back().first, key(1));
        QVERIFY(draw(8));
        QCOMPARE(stage->m_luts.size(), size_t{8});
        QVERIFY(std::ranges::none_of(stage->m_luts, [](const auto &entry) { return entry.first == key(1); }));
        QVERIFY(!evicted.expired());
        const auto queued = retire.size();
        const QJsonObject badLut{{"type", "lut"}, {"enabled", true}, {"cube", "invalid"}};
        QTest::ignoreMessage(QtWarningMsg, "Invalid .cube in clip effect");
        QVERIFY(!stage->render(ctx, input, *output.target, {{"clipEffects", QJsonArray{badLut}}}));
        QCOMPARE(retire.size(), queued + 1);
        QCOMPARE(stage->m_luts.size(), size_t{8});
        const std::weak_ptr<DrawCache> cache = stage->m_drawCache;
        QCOMPARE(rhi->endOffscreenFrame(), QRhi::FrameOpSuccess);
        stage.reset();
        retire.collect(2, 2);
        QVERIFY(!cache.expired());
        QVERIFY(!evicted.expired());
        retire.collect(3, 2);
        QVERIFY(cache.expired());
        QVERIFY(evicted.expired());
        QVERIFY(oldest.expired());
    }
    void boundedCurveTablesAndRetirement() {
        QRhiNullInitParams init;
        auto rhi=std::unique_ptr<QRhi>(QRhi::create(QRhi::Null,&init)); QVERIFY(rhi);
        Target source,output; QVERIFY(source.create(rhi.get(),{32,16})); QVERIFY(output.create(rhi.get(),{32,16}));
        RetireQueue retire; QRhiCommandBuffer* commands=nullptr;
        QCOMPARE(rhi->beginOffscreenFrame(&commands),QRhi::FrameOpSuccess);
        const EffectContext ctx{rhi.get(),commands,1,&retire};
        LayerFrame input; input.format=LayerFrame::Format::Rgba8Premultiplied;
        input.size={32,16}; input.planes[0]=source.texture.get();
        auto stage=std::make_unique<ClipEffectStage>();
        const auto draw=[&](int value) {
            const QJsonArray points{QJsonObject{{"x",0},{"y",0}},QJsonObject{{"x",0.5},{"y",(value+1)/14.}},QJsonObject{{"x",1},{"y",1}}};
            const QJsonObject effect{{"id","curve"},{"type","curves"},{"enabled",true},{"master",points}};
            return stage->render(ctx,input,*output.target,{{"clipEffects",QJsonArray{effect}}});
        };
        QVERIFY(draw(0)); const std::weak_ptr<void> first=stage->m_luts.front().second;
        for (int i=1;i<12;++i) { QVERIFY(draw(i)); QCOMPARE(stage->m_luts.size(),size_t(std::min(8,i+1))); }
        const std::weak_ptr<void> last=stage->m_luts.front().second;
        QVERIFY(draw(11)); QVERIFY(last.lock()==stage->m_luts.front().second);
        QVERIFY(!first.expired());
        QCOMPARE(rhi->endOffscreenFrame(),QRhi::FrameOpSuccess); stage.reset();
        retire.collect(3,2); QVERIFY(first.expired()); QVERIFY(last.expired());
    }
    void pooledDrawBuffersAndBindingsReuse() {
        QRhiNullInitParams init;
        auto rhi = std::unique_ptr<QRhi>(QRhi::create(QRhi::Null, &init));
        QVERIFY(rhi);
        Target a, b, c, d;
        QVERIFY(a.create(rhi.get(), {32, 16}));
        QVERIFY(b.create(rhi.get(), {32, 16}));
        QVERIFY(c.create(rhi.get(), {32, 16}));
        QVERIFY(d.create(rhi.get(), {32, 16}));
        RetireQueue retire;
        QRhiCommandBuffer *commands = nullptr;
        QCOMPARE(rhi->beginOffscreenFrame(&commands), QRhi::FrameOpSuccess);
        const EffectContext ctx{rhi.get(), commands, 1, &retire};
        auto cache = std::make_shared<DrawCache>();
        QVERIFY(cache->initialize(ctx, ":/effects/clip.vert.qsb", ":/effects/clip.frag.qsb", QRhiSampler::Linear));

        // Two passes in the same frame must never alias the same dynamic uniform buffer.
        const std::array<QRhiTexture *, 3> pairAB{a.texture.get(), b.texture.get(), a.texture.get()};
        const auto s1 = cache->acquireDraw(rhi.get(), 1, 256, pairAB);
        const auto s2 = cache->acquireDraw(rhi.get(), 1, 256, pairAB);
        QVERIFY(s1.uniforms && s1.bindings);
        QVERIFY(s2.uniforms && s2.bindings);
        QVERIFY(s1.uniforms != s2.uniforms);
        QVERIFY(s1.bindings != s2.bindings);
        QCOMPARE(cache->drawBufferCreates(), 2LL);
        QCOMPARE(cache->drawBindingCreates(), 2LL);

        // Steady-state frames reuse exact matches with zero buffer or SRB allocations.
        for (long long frame = 2; frame <= 10; ++frame) {
            const auto r1 = cache->acquireDraw(rhi.get(), frame, 256, pairAB);
            const auto r2 = cache->acquireDraw(rhi.get(), frame, 256, pairAB);
            QVERIFY(r1.uniforms == s1.uniforms && r1.bindings == s1.bindings);
            QVERIFY(r2.uniforms == s2.uniforms && r2.bindings == s2.bindings);
        }
        QCOMPARE(cache->drawBufferCreates(), 2LL);
        QCOMPARE(cache->drawBindingCreates(), 2LL);

        // A new texture while prior slots are still in flight allocates rather than
        // mutating an in-flight SRB.
        const std::array<QRhiTexture *, 3> pairAC{a.texture.get(), c.texture.get(), a.texture.get()};
        const auto s3 = cache->acquireDraw(rhi.get(), 11, 256, pairAC);
        QVERIFY(s3.uniforms && s3.bindings);
        QVERIFY(s3.uniforms != s1.uniforms && s3.uniforms != s2.uniforms);
        QCOMPARE(cache->drawBufferCreates(), 3LL);
        QCOMPARE(cache->drawBindingCreates(), 3LL);

        // Once FramesInFlight have completed, Tier 2 rebinds an idle slot's SRB
        // without allocating a new buffer.
        const int inFlight = std::max(1, rhi->resourceLimit(QRhi::FramesInFlight));
        const long long idleFrame = 11 + inFlight + 2;
        const std::array<QRhiTexture *, 3> pairAD{a.texture.get(), d.texture.get(), a.texture.get()};
        const auto s4 = cache->acquireDraw(rhi.get(), idleFrame, 256, pairAD);
        QVERIFY(s4.uniforms && s4.bindings);
        QCOMPARE(cache->drawBufferCreates(), 3LL);
        QCOMPARE(cache->drawBindingCreates(), 4LL);

        // Replacing a destroyed texture never false-hits via pointer reuse because
        // QRhiResource::globalResourceId() is matched alongside the pointer.
        auto transient = std::unique_ptr<QRhiTexture>(rhi->newTexture(QRhiTexture::RGBA8, {32, 16}));
        QVERIFY(transient->create());
        const std::array<QRhiTexture *, 3> pairT1{transient.get(), a.texture.get(), a.texture.get()};
        QVERIFY(cache->acquireDraw(rhi.get(), idleFrame + 1, 256, pairT1).bindings != nullptr);
        const long long bindsAfterT1 = cache->drawBindingCreates();
        transient.reset(rhi->newTexture(QRhiTexture::RGBA8, {32, 16}));
        QVERIFY(transient->create());
        const std::array<QRhiTexture *, 3> pairT2{transient.get(), a.texture.get(), a.texture.get()};
        QVERIFY(cache->acquireDraw(rhi.get(), idleFrame + 2, 256, pairT2).bindings != nullptr);
        QVERIFY(cache->drawBindingCreates() > bindsAfterT1);

        QCOMPARE(rhi->endOffscreenFrame(), QRhi::FrameOpSuccess);
    }
    void clipEffectPlanCacheAvoidsReplanning() {
        QRhiNullInitParams init;
        auto rhi = std::unique_ptr<QRhi>(QRhi::create(QRhi::Null, &init));
        QVERIFY(rhi);
        Target source, output;
        QVERIFY(source.create(rhi.get(), {32, 16}));
        QVERIFY(output.create(rhi.get(), {56, 40}));
        RetireQueue retire;
        QRhiCommandBuffer *commands = nullptr;
        QCOMPARE(rhi->beginOffscreenFrame(&commands), QRhi::FrameOpSuccess);
        LayerFrame input;
        input.format = LayerFrame::Format::Rgba8Premultiplied;
        input.size = {32, 16};
        input.planes[0] = source.texture.get();

        auto stage = std::make_unique<ClipEffectStage>();
        QVERIFY(!stage->applies({}));
        QCOMPARE(stage->outset({}, {32, 16}), QMargins{});
        QCOMPARE(stage->m_planCacheMisses, 0LL);

        const QJsonArray curvePoints{
            QJsonObject{{"x", 0}, {"y", 0}}, QJsonObject{{"x", 0.5}, {"y", 0.6}}, QJsonObject{{"x", 1}, {"y", 1}}};
        QJsonObject ext{
            {"clipEffects",
             QJsonArray{QJsonObject{{"id", "c1"}, {"type", "color"}, {"enabled", true}, {"brightness", 0.2}},
                        QJsonObject{{"id", "c2"}, {"type", "curves"}, {"enabled", true}, {"master", curvePoints}},
                        QJsonObject{{"id", "c3"}, {"type", "glow"}, {"enabled", true}, {"radius", 4}, {"intensity", 0.5}}}}};

        // applies(), outset(), and repeated render() calls share one cached plan.
        QVERIFY(stage->applies(ext));
        QCOMPARE(stage->outset(ext, {32, 16}), QMargins(12, 12, 12, 12));
        QCOMPARE(stage->m_planCacheMisses, 1LL);

        long long bufsAfterWarmup = 0;
        long long bindsAfterWarmup = 0;
        for (long long frame = 1; frame <= 5; ++frame) {
            const EffectContext ctx{rhi.get(), commands, frame, &retire};
            QVERIFY(stage->applies(ext));
            QCOMPARE(stage->outset(ext, {32, 16}), QMargins(12, 12, 12, 12));
            QVERIFY(stage->render(ctx, input, *output.target, ext));
            if (frame == 1) {
                bufsAfterWarmup = stage->m_drawCache->drawBufferCreates();
                bindsAfterWarmup = stage->m_drawCache->drawBindingCreates();
                QVERIFY(bufsAfterWarmup > 0);
                QVERIFY(bindsAfterWarmup > 0);
            }
        }
        QCOMPARE(stage->m_planCacheMisses, 1LL);
        QCOMPARE(stage->m_drawCache->drawBufferCreates(), bufsAfterWarmup);
        QCOMPARE(stage->m_drawCache->drawBindingCreates(), bindsAfterWarmup);

        // Modifying an effect invalidates the lookup and plans the updated chain.
        QJsonArray updated = ext.value("clipEffects").toArray();
        QJsonObject firstEffect = updated[0].toObject();
        firstEffect.insert("brightness", 0.5);
        updated[0] = firstEffect;
        ext.insert("clipEffects", updated);
        const EffectContext ctx6{rhi.get(), commands, 6, &retire};
        QVERIFY(stage->render(ctx6, input, *output.target, ext));
        QCOMPARE(stage->m_planCacheMisses, 2LL);

        QCOMPARE(rhi->endOffscreenFrame(), QRhi::FrameOpSuccess);
        stage.reset();
        retire.collect(8, 2);
        QVERIFY(retire.empty());
    }
};
} // namespace nt::effects
QTEST_GUILESS_MAIN(nt::effects::TestEffectResources)
#include "tst_effectresources.moc"
