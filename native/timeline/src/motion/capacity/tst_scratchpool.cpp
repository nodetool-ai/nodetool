#include "motion/capacity/ScratchPool.h"
#include <QtTest>
#include <rhi/qrhi_platform.h>

class TestScratchPool : public QObject {
    Q_OBJECT
private slots:
    void sequentialAndNestedLeases() {
        QRhiNullInitParams init;
        auto rhi = std::unique_ptr<QRhi>(QRhi::create(QRhi::Null, &init));
        QVERIFY(rhi);
        nt::motion::ScratchPool pool;
        std::vector<std::shared_ptr<nt::motion::ScratchPool::Surface>> inFlight;
        auto firstLease = pool.beginLease(1);
        auto a = pool.acquire(firstLease, rhi.get(), {64, 32}, 1); QVERIFY(a);
        auto b = pool.acquire(firstLease, rhi.get(), {64, 32}, 1, a->texture.get()); QVERIFY(b);
        QVERIFY(a != b);
        inFlight = {a, b};
        const auto nested = pool.beginLease(1);
        auto nestedA = pool.acquire(nested, rhi.get(), {64, 32}, 1); QVERIFY(nestedA);
        QVERIFY(nestedA != a && nestedA != b);
        auto nestedB = pool.acquire(nested, rhi.get(), {64, 32}, 1, nestedA->texture.get()); QVERIFY(nestedB);
        QVERIFY(nestedB != a && nestedB != b && nestedB != nestedA);
        pool.endLease(nested);
        pool.endLease(firstLease);
        const auto afterNested = pool.size();
        for (int i = 0; i < 100; ++i) {
            const auto lease = pool.beginLease(1);
            auto x = pool.acquire(lease, rhi.get(), {64, 32}, 1); QVERIFY(x);
            auto y = pool.acquire(lease, rhi.get(), {64, 32}, 1, x->texture.get()); QVERIFY(y);
            QVERIFY(x != y);
            pool.endLease(lease);
        }
        QCOMPARE(pool.size(), afterNested);
        QVERIFY(inFlight[0]->texture && inFlight[1]->texture);
    }
    void alternatingSizesReuse() {
        QRhiNullInitParams init;
        auto rhi = std::unique_ptr<QRhi>(QRhi::create(QRhi::Null, &init)); QVERIFY(rhi);
        nt::motion::ScratchPool pool;
        auto lease = pool.beginLease(1);
        auto first = pool.acquire(lease, rhi.get(), {64, 32}, 1); QVERIFY(first);
        pool.endLease(lease);
        lease = pool.beginLease(1);
        auto second = pool.acquire(lease, rhi.get(), {32, 64}, 1); QVERIFY(second);
        pool.endLease(lease);
        lease = pool.beginLease(1);
        auto again = pool.acquire(lease, rhi.get(), {64, 32}, 1); QVERIFY(again);
        QCOMPARE(again, first);
        pool.endLease(lease);
    }
    void softBudgetRetainsCurrentFrameAndInFlight() {
        QRhiNullInitParams init;
        auto rhi = std::unique_ptr<QRhi>(QRhi::create(QRhi::Null, &init)); QVERIFY(rhi);
        nt::motion::ScratchPool pool(8192);
        auto lease = pool.beginLease(1);
        auto a = pool.acquire(lease, rhi.get(), {64, 32}, 1); QVERIFY(a);
        pool.endLease(lease);
        lease = pool.beginLease(1);
        auto b = pool.acquire(lease, rhi.get(), {32, 64}, 1); QVERIFY(b);
        pool.endLease(lease);
        QCOMPARE(pool.size(), size_t(2));
        QCOMPARE(pool.bytes(), size_t(16384));
        const std::weak_ptr<nt::motion::ScratchPool::Surface> retained = a;
        lease = pool.beginLease(2);
        QCOMPARE(pool.size(), size_t(1));
        QVERIFY(!retained.expired());
        a.reset();
        QVERIFY(retained.expired());
        pool.endLease(lease);
    }
    void sizeDeviceAndFailedLease() {
        QRhiNullInitParams init;
        auto first = std::unique_ptr<QRhi>(QRhi::create(QRhi::Null, &init));
        auto second = std::unique_ptr<QRhi>(QRhi::create(QRhi::Null, &init));
        QVERIFY(first); QVERIFY(second);
        nt::motion::ScratchPool pool;
        const auto lease = pool.beginLease(1);
        auto a = pool.acquire(lease, first.get(), {64, 32}, 1); QVERIFY(a);
        QVERIFY(!pool.acquire(lease, nullptr, {64, 32}, 1));
        QVERIFY(!pool.acquire(lease, second.get(), {64, 32}, 1));
        const std::weak_ptr<nt::motion::ScratchPool::Surface> inFlight = a;
        pool.endLease(lease);
        const auto resizedLease = pool.beginLease(1);
        auto resized = pool.acquire(resizedLease, first.get(), {32, 64}, 1); QVERIFY(resized);
        QVERIFY(resized != a);
        QCOMPARE(resized->texture->pixelSize(), QSize(32, 64));
        pool.endLease(resizedLease);
        QCOMPARE(pool.size(), size_t(2));
        QVERIFY(!inFlight.expired());
        const auto deviceLease = pool.beginLease(1);
        auto other = pool.acquire(deviceLease, second.get(), {32, 64}, 1); QVERIFY(other);
        QVERIFY(other != resized);
        pool.endLease(deviceLease);
    }
};
QTEST_GUILESS_MAIN(TestScratchPool)
#include "tst_scratchpool.moc"
