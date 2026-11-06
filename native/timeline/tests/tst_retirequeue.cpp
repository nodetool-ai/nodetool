#include "preview/RetireQueue.h"

#include <QTest>

using namespace nt;

class TestRetireQueue : public QObject {
    Q_OBJECT

private slots:
    void releasesAfterFramesInFlight() {
        RetireQueue q;
        auto resource = std::make_shared<int>(1);
        std::weak_ptr<int> alive = resource;
        q.retire(resource, 10);
        resource.reset();
        // Frames in flight 2: frame 10's command buffer may run until frame
        // 12 begins.
        QCOMPARE(q.collect(11, 2), 0);
        QVERIFY(!alive.expired());
        QCOMPARE(q.collect(12, 2), 1);
        QVERIFY(alive.expired());
        QVERIFY(q.empty());
    }

    void releasesInOrder() {
        RetireQueue q;
        q.retire(std::make_shared<int>(1), 5);
        q.retire(std::make_shared<int>(2), 7);
        QCOMPARE(q.collect(8, 3), 1);
        QCOMPARE(q.size(), size_t(1));
        QCOMPARE(q.collect(10, 3), 1);
    }

    void ignoresNull() {
        RetireQueue q;
        q.retire(nullptr, 1);
        QVERIFY(q.empty());
    }
};

QTEST_APPLESS_MAIN(TestRetireQueue)
#include "tst_retirequeue.moc"
