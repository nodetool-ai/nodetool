// The Linux hardware path's frame completion marks (VulkanInterop.h) on a
// Vulkan QRhi with no window: a mark recorded in a frame is freed when the
// interop goes before the frame completes.

#include "preview/hw/VulkanInterop.h"

#include <QGuiApplication>
#include <QTest>
#include <QVulkanInstance>
#include <rhi/qrhi.h>

#include <memory>

using namespace nt::hw;

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

    void cleanupTestCase() { m_rhi.reset(); }

private:
    QVulkanInstance m_instance;
    std::unique_ptr<QRhi> m_rhi;
};

QTEST_MAIN(TestVulkanInterop)
#include "tst_vulkaninterop.moc"
