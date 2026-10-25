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

    void cleanupTestCase() { m_rhi.reset(); }

private:
    QVulkanInstance m_instance;
    std::unique_ptr<QRhi> m_rhi;
};

QTEST_MAIN(TestVulkanInterop)
#include "tst_vulkaninterop.moc"
