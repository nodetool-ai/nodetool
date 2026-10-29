#include "ClipDelta.h"
#include <QJsonDocument>
#include <QJsonObject>
#include <QtTest>
static QJsonArray array(const char* json) { return QJsonDocument::fromJson(json).array(); }
class TestClipDelta : public QObject {
    Q_OBJECT
  private slots:
    void documentDelta() {
        const auto b = QJsonDocument::fromJson(R"({"clips":[{"id":"a","x":4}],"unknown":{"a":1},"markers":[1]})").object();
        const auto p = QJsonDocument::fromJson(R"({"clips":[{"id":"a","x":8}],"unknown":{"a":1},"markers":[1]})").object();
        const auto g = QJsonDocument::fromJson(R"({"clips":[{"id":"a","x":8,"y":5}],"unknown":{"a":2},"markers":[2]})").object();
        const auto result = nt::motion::rebaseDocumentDelta(b,p,g);
        QCOMPARE(result["clips"].toArray()[0].toObject()["x"].toInt(),4);
        QCOMPARE(result["clips"].toArray()[0].toObject()["y"].toInt(),5);
        QCOMPARE(result["unknown"].toObject()["a"].toInt(),2);
        QCOMPARE(result["markers"].toArray()[0].toInt(),2);
    }
    void previewCreatedObjects() {
        const auto before = array(R"([{"id":"a","motion":{"rotation":1}}])");
        const auto after = array(R"([{"id":"a","motion":{"rotation":1,"opacity":0.5}}])");
        for (const auto& base : {array(R"([{"id":"a"}])"), array(R"([{"id":"a","motion":null}])"), array(R"([{"id":"a","motion":7}])")}) {
            QCOMPARE(nt::motion::rebaseClipDelta(base,before,after), array(R"([{"id":"a","motion":{"opacity":0.5}}])"));
        }
        const auto scalar = array(R"([{"id":"a","motion":null}])");
        QCOMPARE(nt::motion::rebaseClipDelta(array(R"([{"id":"a"}])"),before,scalar),scalar);
    }
    void unchangedArrayRestoresBase() {
        const auto base = array(R"([{"id":"a","list":[1],"obj":{"left":1,"right":2}}])");
        const auto before = array(R"([{"id":"a","list":[9],"obj":{"left":8,"right":2}}])");
        const auto after = array(R"([{"id":"a","list":[9],"obj":{"left":8,"right":3}}])");
        QCOMPARE(nt::motion::rebaseClipDelta(base,before,after), array(R"([{"id":"a","list":[1],"obj":{"left":1,"right":3}}])"));
    }
    void large() {
        QJsonArray base, before, after;
        for (int i = 0; i < 32000; ++i) {
            const QJsonObject clip{{"id",QString::number(i)},{"x",i}};
            base.append(clip); before.append(clip); after.append(clip);
        }
        QCOMPARE(nt::motion::rebaseClipDelta(base,before,after), base);
    }
    void rebase() {
        const auto base = array(R"([{"id":"a","motion":{"samples":4,"unknown":1},"list":[1],"deleteMe":1},{"id":"b","x":0}])");
        const auto before = array(R"([{"id":"a","motion":{"samples":8,"unknown":1},"list":[1],"deleteMe":1},{"id":"b","x":0}])");
        const auto external = array(R"([{"id":"b","x":1},{"id":"a","motion":{"samples":8,"unknown":2},"list":[1],"added":null},{"id":"c","motion":{"samples":8}}])");
        const auto result = nt::motion::rebaseClipDelta(base,before,external);
        QCOMPARE(result, array(R"([{"id":"b","x":1},{"id":"a","motion":{"samples":4,"unknown":2},"list":[1],"added":null},{"id":"c","motion":{"samples":8}}])"));
        auto changed = array(R"([{"id":"a","motion":{"samples":9,"unknown":1},"list":[2],"deleteMe":1}])");
        QCOMPARE(nt::motion::rebaseClipDelta(base,before,changed), changed);
        QCOMPARE(nt::motion::rebaseClipDelta(base,before,before), base);
    }
};
QTEST_APPLESS_MAIN(TestClipDelta)
#include "tst_clipdelta.moc"
