// The Linux hardware path's frame completion marks (VulkanInterop.h) on a
// Vulkan QRhi with no window: a mark recorded in a frame is freed when the
// interop goes before the frame completes.

#include "preview/hw/VulkanInterop.h"
#include "preview/hw/HwInterop.h"

extern "C" {
#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libavutil/hwcontext.h>
}

#include <QFileInfo>
#include <QGuiApplication>
#include <QTest>
#include <QVulkanInstance>
#include <rhi/qrhi.h>

#include <memory>
#include <utility>
#include <vector>

using namespace nt::hw;

namespace {
struct FormatFree {
    void operator()(AVFormatContext* p) const { avformat_close_input(&p); }
};
struct CodecFree {
    void operator()(AVCodecContext* p) const { avcodec_free_context(&p); }
};
struct BufferFree {
    void operator()(AVBufferRef* p) const { av_buffer_unref(&p); }
};
struct FrameFree {
    void operator()(AVFrame* p) const { av_frame_free(&p); }
};
struct PacketFree {
    void operator()(AVPacket* p) const { av_packet_free(&p); }
};

// Keep the decoder alive beyond interop teardown: returning an unreleased
// mapping here could put the surface straight back into this decoder's pool.
struct VaapiFixture {
    std::unique_ptr<AVFormatContext, FormatFree> format;
    std::unique_ptr<AVBufferRef, BufferFree> device;
    std::unique_ptr<AVCodecContext, CodecFree> decoder;
    std::unique_ptr<AVFrame, FrameFree> frame{av_frame_alloc()};
    std::unique_ptr<AVPacket, PacketFree> packet{av_packet_alloc()};

    std::string decode(const std::string& path) {
        AVFormatContext* input = nullptr;
        const int opened = avformat_open_input(&input, path.c_str(), nullptr, nullptr);
        format.reset(input);
        if (opened < 0 || avformat_find_stream_info(format.get(), nullptr) < 0) return "cannot open fixture";
        const AVCodec* codec = nullptr;
        const int stream = av_find_best_stream(format.get(), AVMEDIA_TYPE_VIDEO, -1, -1, &codec, 0);
        if (stream < 0 || !codec) return "no fixture video decoder";
        decoder.reset(avcodec_alloc_context3(codec));
        if (!decoder || !frame || !packet) return "cannot allocate decoder resources";
        if (avcodec_parameters_to_context(decoder.get(), format->streams[stream]->codecpar) < 0) {
            return "cannot copy fixture codec parameters";
        }
        AVBufferRef* nativeDevice = nullptr;
        const auto why = setUpDecoder(decoder.get(), codec, codec->name, &nativeDevice);
        device.reset(nativeDevice);
        if (!why.empty()) return why;
        if (avcodec_open2(decoder.get(), codec, nullptr) < 0) return "cannot open VAAPI decoder";
        for (;;) {
            const int received = avcodec_receive_frame(decoder.get(), frame.get());
            if (received == 0) {
                if (frame->format != AV_PIX_FMT_VAAPI) return "decoder returned a software frame";
                if (syncFrame(frame.get()) < 0) return "cannot sync the VAAPI frame";
                return {};
            }
            if (received != AVERROR(EAGAIN)) return "VAAPI decode produced no frame";
            if (av_read_frame(format.get(), packet.get()) < 0) {
                avcodec_send_packet(decoder.get(), nullptr);
            } else {
                const int sent = packet->stream_index == stream ? avcodec_send_packet(decoder.get(), packet.get()) : 0;
                av_packet_unref(packet.get());
                if (sent < 0) return "VAAPI packet submission failed";
            }
        }
    }
};

struct RestoreReleaseSubmissions {
    ~RestoreReleaseSubmissions() { testing::setReleaseFailures(0); }
};
struct RestoreReadbackObserver {
    ~RestoreReadbackObserver() { testing::setReadbackObserver({}); }
};
struct RestoreFenceWaits {
    ~RestoreFenceWaits() { testing::setFenceWaitFailures(0); }
};
}  // namespace

class TestVulkanInterop : public QObject {
    Q_OBJECT

private slots:
    void initTestCase() {
        m_instance.setApiVersion(QVersionNumber(1, 1));
        m_instance.setExtensions(QRhiVulkanInitParams::preferredInstanceExtensions());
        if (!m_instance.create()) QSKIP("no Vulkan instance (the render tests run on xcb under Xvfb)");
        QRhiVulkanInitParams params;
        params.inst = &m_instance;
        params.deviceExtensions = VulkanInterop::requiredDeviceExtensions();
        m_rhi.reset(QRhi::create(QRhi::Vulkan, &params));
        if (!m_rhi) QSKIP("no Vulkan QRhi");
        qInfo("device: %s", m_rhi->driverInfo().deviceName.constData());
    }

    // Review L-r1 F1: an interop destroyed while its frame's readback is
    // recorded leaves the mark to the readback's completion, which frees it.
    void markOfAnUnfinishedFrameIsFreed() {
        const int before = VulkanInterop::liveCompletionMarks();
        std::shared_ptr<VulkanInterop> interop = VulkanInterop::create(m_rhi.get());
        if (!interop) QSKIP("the device cannot import DMA-BUF frames");
        QRhiCommandBuffer* cb = nullptr;
        QCOMPARE(m_rhi->beginOffscreenFrame(&cb), QRhi::FrameOpSuccess);
        trackCompletion(cb, 1000);
        interop->flush();
        QCOMPARE(VulkanInterop::liveCompletionMarks(), before + 1);
        interop.reset();  // as a renderer torn down mid-flight
        QCOMPARE(m_rhi->endOffscreenFrame(), QRhi::FrameOpSuccess);  // completes the readback
        QVERIFY(completedFrame() >= 1000);
        QCOMPARE(VulkanInterop::liveCompletionMarks(), before);
    }

    // Marks of completed frames are freed by the next flush, and the interop
    // frees the rest when it goes.
    void completedMarksAreFreed() {
        const int before = VulkanInterop::liveCompletionMarks();
        std::shared_ptr<VulkanInterop> interop = VulkanInterop::create(m_rhi.get());
        if (!interop) QSKIP("the device cannot import DMA-BUF frames");
        for (int i = 0; i < 4; ++i) {
            QRhiCommandBuffer* cb = nullptr;
            QCOMPARE(m_rhi->beginOffscreenFrame(&cb), QRhi::FrameOpSuccess);
            trackCompletion(cb, 2000 + i);
            interop->flush();
            QCOMPARE(m_rhi->endOffscreenFrame(), QRhi::FrameOpSuccess);
            QVERIFY(VulkanInterop::liveCompletionMarks() <= before + 1);
        }
        QVERIFY(completedFrame() >= 2003);
        interop.reset();
        QCOMPARE(VulkanInterop::liveCompletionMarks(), before);
    }

    void droppedMarkDoesNotBlockCompletedMarks() {
        const int before = VulkanInterop::liveCompletionMarks();
        auto interop = VulkanInterop::create(m_rhi.get());
        if (!interop) {
            QSKIP("the device cannot import DMA-BUF frames");
        }
        QRhiCommandBuffer* cb = nullptr;
        QCOMPARE(m_rhi->beginOffscreenFrame(&cb), QRhi::FrameOpSuccess);
        testing::dropNextReadback();
        trackCompletion(cb, 5000);
        interop->flush();
        trackCompletion(cb, 5000);
        interop->flush();
        QCOMPARE(VulkanInterop::liveCompletionMarks(), before + 2);
        QCOMPARE(m_rhi->endOffscreenFrame(), QRhi::FrameOpSuccess);
        interop->flush();
        // A later callback is not a drain: only its own mark may go away.
        QCOMPARE(VulkanInterop::liveCompletionMarks(), before + 1);
        const int framesInFlight = m_rhi->resourceLimit(QRhi::FramesInFlight);
        for (int i = 1; i <= framesInFlight + 2; ++i) {
            QCOMPARE(m_rhi->beginOffscreenFrame(&cb), QRhi::FrameOpSuccess);
            trackCompletion(cb, 5000 + i);
            interop->flush();
            QCOMPARE(m_rhi->endOffscreenFrame(), QRhi::FrameOpSuccess);
            interop->flush();
            QCOMPARE(VulkanInterop::liveCompletionMarks(), before + (i < framesInFlight ? 1 : 0));
        }
        interop.reset();
        QCOMPARE(VulkanInterop::liveCompletionMarks(), before);
    }

    void droppedMarkIsFreedAtRhiTeardown() {
        const int before = VulkanInterop::liveCompletionMarks();
        QRhiVulkanInitParams params;
        params.inst = &m_instance;
        params.deviceExtensions = VulkanInterop::requiredDeviceExtensions();
        std::unique_ptr<QRhi> rhi(QRhi::create(QRhi::Vulkan, &params));
        QVERIFY(rhi);
        auto interop = VulkanInterop::create(rhi.get());
        if (!interop) {
            QSKIP("the device cannot import DMA-BUF frames");
        }
        QRhiCommandBuffer* cb = nullptr;
        QCOMPARE(rhi->beginOffscreenFrame(&cb), QRhi::FrameOpSuccess);
        testing::dropNextReadback();
        trackCompletion(cb, 6000);
        interop->flush();
        QCOMPARE(VulkanInterop::liveCompletionMarks(), before + 1);
        interop.reset();
        QCOMPARE(rhi->endOffscreenFrame(), QRhi::FrameOpSuccess);
        QCOMPARE(rhi->finish(), QRhi::FrameOpSuccess);
        rhi.reset();  // cleanup must confirm a drain before reclaiming a dropped mark
        QCOMPARE(VulkanInterop::liveCompletionMarks(), before);
    }

    void orphanedReadbacksCompleteInReverseOrder() {
        const int before = VulkanInterop::liveCompletionMarks();
        const int callbacksBefore = testing::completedReadbacks();
        RestoreReadbackObserver restore;
        auto callbackLiveCounts = std::make_shared<std::vector<int>>();
        testing::setReadbackObserver([callbackLiveCounts](int live) { callbackLiveCounts->push_back(live); });
        auto interop = VulkanInterop::create(m_rhi.get());
        if (!interop) {
            QSKIP("the device cannot import DMA-BUF frames");
        }
        QRhiCommandBuffer* cb = nullptr;
        QCOMPARE(m_rhi->beginOffscreenFrame(&cb), QRhi::FrameOpSuccess);
        for (int i = 0; i < 2; ++i) {
            trackCompletion(cb, 7000);
            interop->flush();
        }
        QCOMPARE(VulkanInterop::liveCompletionMarks(), before + 2);
        QCOMPARE(testing::completedReadbacks(), callbacksBefore);
        interop.reset();
        QCOMPARE(VulkanInterop::liveCompletionMarks(), before + 2);
        // Qt 6.12 invokes both callbacks in reverse recording order here.
        QCOMPARE(m_rhi->finish(), QRhi::FrameOpSuccess);
        QCOMPARE(testing::completedReadbacks(), callbacksBefore + 2);
        QCOMPARE(callbackLiveCounts->size(), size_t{2});
        QCOMPARE(callbackLiveCounts->at(0), before + 2);
        QCOMPARE(callbackLiveCounts->at(1), before + 1);
        QCOMPARE(VulkanInterop::liveCompletionMarks(), before);
        QCOMPARE(m_rhi->endOffscreenFrame(), QRhi::FrameOpSuccess);
    }

    void rendererRestartReleasesRetiredMapping_data() {
        QTest::addColumn<bool>("persistentFailure");
        QTest::newRow("retry-succeeds") << false;
        QTest::newRow("retry-still-fails") << true;
    }

    void rendererRestartReleasesRetiredMapping() {
        QFETCH(bool, persistentFailure);
        const QString path = QStringLiteral(NT_FIXTURES_DIR "/media/seek-360p30.mp4");
        if (!QFileInfo::exists(path)) QSKIP("run scripts/make-fixtures.sh for the VAAPI fixture");
        VaapiFixture fixture;
        const auto decodeError = fixture.decode(path.toStdString());
        if (!decodeError.empty()) QSKIP(decodeError.c_str());
        RestoreReleaseSubmissions restore;
        auto interop = VulkanInterop::create(m_rhi.get());
        if (!interop) QSKIP("the device cannot import DMA-BUF frames");
        const auto before = testing::releaseStats();
        std::weak_ptr<VulkanInterop> oldInterop = interop;
        std::string error;
        auto frame = interop->wrap(fixture.frame.get(), &error);
        QVERIFY2(frame, error.c_str());
        // Only the DRM mapping may keep the surface alive after retirement.
        av_frame_unref(fixture.frame.get());
        QRhiCommandBuffer* cb = nullptr;
        QCOMPARE(m_rhi->beginOffscreenFrame(&cb), QRhi::FrameOpSuccess);
        trackCompletion(cb, 3000);
        frame->markUsed(3000);
        interop->flush();
        QCOMPARE(m_rhi->endOffscreenFrame(), QRhi::FrameOpSuccess);
        m_rhi->finish();
        QVERIFY(completedFrame() >= 3000);
        interop.reset();  // restart drops renderer ownership, but a source still holds the frame
        QVERIFY(!oldInterop.expired());
        testing::setReleaseFailures(persistentFailure ? -1 : 1);
        frame.reset();  // failed retire, then the old interop's destructor
        QVERIFY(oldInterop.expired());
        const auto after = testing::releaseStats();
        QCOMPARE(after.freedWithoutRelease, before.freedWithoutRelease);
        QCOMPARE(after.submitted - before.submitted, persistentFailure ? 0 : 1);
        QCOMPARE(after.completed - before.completed, persistentFailure ? 0 : 1);
        QCOMPARE(after.retainedMappings - before.retainedMappings, persistentFailure ? 1 : 0);
    }

    void teardownRequiresConfirmedFenceWait_data() {
        QTest::addColumn<int>("waitFailures");
        QTest::addColumn<int>("frameCount");
        QTest::addColumn<int>("retained");
        QTest::newRow("persistent-wait-failure") << -1 << 1 << 1;
        QTest::newRow("transient-wait-failure") << 1 << 1 << 0;
        QTest::newRow("later-pending-entry-completes") << 3 << 2 << 1;
    }

    void teardownRequiresConfirmedFenceWait() {
        QFETCH(int, waitFailures);
        QFETCH(int, frameCount);
        QFETCH(int, retained);
        const QString path = QStringLiteral(NT_FIXTURES_DIR "/media/seek-360p30.mp4");
        if (!QFileInfo::exists(path)) {
            QSKIP("run scripts/make-fixtures.sh for the VAAPI fixture");
        }
        std::vector<VaapiFixture> fixtures(static_cast<size_t>(frameCount));
        for (auto& fixture : fixtures) {
            const auto error = fixture.decode(path.toStdString());
            if (!error.empty()) {
                QSKIP(error.c_str());
            }
        }
        RestoreFenceWaits restore;
        auto interop = VulkanInterop::create(m_rhi.get());
        if (!interop) {
            QSKIP("the device cannot import DMA-BUF frames");
        }
        const auto before = testing::releaseStats();
        std::weak_ptr<VulkanInterop> oldInterop = interop;
        std::vector<std::shared_ptr<FrameRef>> frames;
        for (auto& fixture : fixtures) {
            std::string error;
            auto frame = interop->wrap(fixture.frame.get(), &error);
            QVERIFY2(frame, error.c_str());
            av_frame_unref(fixture.frame.get());
            frames.push_back(std::move(frame));
        }
        QRhiCommandBuffer* cb = nullptr;
        QCOMPARE(m_rhi->beginOffscreenFrame(&cb), QRhi::FrameOpSuccess);
        trackCompletion(cb, 4000);
        for (const auto& frame : frames) {
            frame->markUsed(4000);
        }
        interop->flush();
        QCOMPARE(m_rhi->endOffscreenFrame(), QRhi::FrameOpSuccess);
        m_rhi->finish();
        QVERIFY(completedFrame() >= 4000);
        // Collect the acquire submissions, leaving only releases for teardown.
        interop->flush();
        interop.reset();
        QVERIFY(!oldInterop.expired());
        testing::setFenceWaitFailures(waitFailures);
        frames.clear();  // successful retire submissions, then interop teardown
        QVERIFY(oldInterop.expired());
        const auto after = testing::releaseStats();
        QCOMPARE(after.submitted - before.submitted, frameCount);
        QCOMPARE(after.freedWithoutRelease, before.freedWithoutRelease);
        // False device loss suppresses freedWithoutRelease, so retention and
        // confirmed completion must also be checked independently.
        QCOMPARE(after.unconfirmedPending - before.unconfirmedPending, retained);
        QCOMPARE(after.retainedMappings - before.retainedMappings, retained);
        QCOMPARE(after.completed - before.completed, frameCount - retained);
    }

    void teardownRetainsUnreleasedImagesAfterUnconfirmedAcquire() {
        const QString path = QStringLiteral(NT_FIXTURES_DIR "/media/seek-360p30.mp4");
        if (!QFileInfo::exists(path)) {
            QSKIP("run scripts/make-fixtures.sh for the VAAPI fixture");
        }
        VaapiFixture fixture;
        const auto decodeError = fixture.decode(path.toStdString());
        if (!decodeError.empty()) {
            QSKIP(decodeError.c_str());
        }
        RestoreReleaseSubmissions restoreReleases;
        RestoreFenceWaits restoreWaits;
        auto interop = VulkanInterop::create(m_rhi.get());
        if (!interop) {
            QSKIP("the device cannot import DMA-BUF frames");
        }
        const auto before = testing::releaseStats();
        std::weak_ptr<VulkanInterop> oldInterop = interop;
        std::string error;
        auto frame = interop->wrap(fixture.frame.get(), &error);
        QVERIFY2(frame, error.c_str());
        const auto destructionBefore = testing::destructionStats();
        av_frame_unref(fixture.frame.get());
        // Wrap only one frame and never flush: nothing collects its acquire.
        // It is never sampled, so retirement needs no frame completion mark.
        interop.reset();
        QVERIFY(!oldInterop.expired());
        testing::setReleaseFailures(-1);
        testing::setFenceWaitFailures(-1);
        frame.reset();  // failed retire and teardown release, then failed acquire waits
        QVERIFY(oldInterop.expired());
        const auto after = testing::releaseStats();
        const auto destructionAfter = testing::destructionStats();
        QCOMPARE(destructionAfter.images, destructionBefore.images);
        QCOMPARE(destructionAfter.memory, destructionBefore.memory);
        QCOMPARE(after.unconfirmedUnreleased - before.unconfirmedUnreleased, 1);
        QCOMPARE(after.unconfirmedPending - before.unconfirmedPending, 1);
        QCOMPARE(after.retainedMappings - before.retainedMappings, 1);
        QCOMPARE(after.freedWithoutRelease, before.freedWithoutRelease);
        QCOMPARE(after.submitted, before.submitted);
        QCOMPARE(after.completed, before.completed);

        // Abandoned native handles must not invalidate the test's live QRhi.
        QRhiCommandBuffer* cb = nullptr;
        QCOMPARE(m_rhi->beginOffscreenFrame(&cb), QRhi::FrameOpSuccess);
        QCOMPARE(m_rhi->endOffscreenFrame(), QRhi::FrameOpSuccess);
    }

    void cleanupTestCase() { m_rhi.reset(); }

private:
    QVulkanInstance m_instance;
    std::unique_ptr<QRhi> m_rhi;
};

QTEST_MAIN(TestVulkanInterop)
#include "tst_vulkaninterop.moc"
