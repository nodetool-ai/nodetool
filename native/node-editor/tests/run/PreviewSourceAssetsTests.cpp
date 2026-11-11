#include "../../src/run/PreviewSourceAssets.h"
#include <QJsonObject>
#include <QTest>
using nodetool::node_editor::PreviewSourceAssets;
namespace {
QJsonObject asset(const QString &id, const QString &job, const QString &created, const QString &content,
                  const QJsonObject &metadata = {}) {
  return {{"id", id}, {"job_id", job}, {"created_at", created}, {"content_type", content}, {"metadata", metadata}};
}
}
class PreviewSourceAssetsTests final : public QObject {
  Q_OBJECT
private slots:
  void lastJobOnly() {
    const QJsonArray assets{asset("old", "job-1", "2026-01-01T00:00:00Z", "image/png"),
                            asset("new", "job-2", "2026-01-02T00:00:00Z", "image/png")};
    const auto value = PreviewSourceAssets::previewValue(assets, "output").toObject();
    QCOMPARE(value["type"].toString(), "image");
    QCOMPARE(value["uri"].toString(), "asset://new");
  }
  void namedHandlesNarrowTheJob() {
    const QJsonArray assets{asset("a", "job", "2026-01-01T00:00:00Z", "image/png", {{"output_name", "image"}}),
                            asset("b", "job", "2026-01-01T00:00:01Z", "audio/wav", {{"output_name", "audio"}})};
    QCOMPARE(PreviewSourceAssets::previewValue(assets, "audio").toObject()["type"].toString(), "audio");
    QVERIFY(PreviewSourceAssets::previewValue(assets, "video").isUndefined());
  }
  void unnamedAssetsKeepTheWholeJob() {
    const QJsonArray assets{asset("a", "job", "2026-01-01T00:00:00Z", "image/png"),
                            asset("b", "job", "2026-01-01T00:00:01Z", "text/plain", {{"text", "caption"}})};
    const auto value = PreviewSourceAssets::previewValue(assets, "output").toArray();
    QCOMPARE(value.size(), 2);
    QCOMPARE(value[0].toString(), "caption");
  }
  void jsonUsesInlineValue() {
    const QJsonArray assets{asset("a", "job", "2026-01-01T00:00:00Z", "application/json", {{"json", QJsonObject{{"score", 3}}}})};
    QCOMPARE(PreviewSourceAssets::previewValue(assets, {}).toObject()["score"].toInt(), 3);
  }
  void assetsWithoutJobAreIgnored() {
    QVERIFY(PreviewSourceAssets::previewValue({asset("a", {}, "2026-01-01T00:00:00Z", "image/png")}, {}).isUndefined());
  }
};
QTEST_GUILESS_MAIN(PreviewSourceAssetsTests)
#include "PreviewSourceAssetsTests.moc"
