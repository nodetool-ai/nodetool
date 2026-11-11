#include "../../src/media/MediaGalleryModel.h"
#include <QMetaProperty>
#include <QSignalSpy>
#include <QtTest>
using nodetool::node_editor::MediaGalleryModel;
namespace {
QVariantMap item(const QString &key) { return {{"kind", "text"}, {"text", key}, {"itemKey", key}}; }
}
class MediaGalleryModelTests final : public QObject {
  Q_OBJECT
private slots:
  void selectedItemMovesWithoutSourceRestart() {
    MediaGalleryModel model;
    model.setItems({item("first"), item("selected")});
    model.open(1);
    const auto selected = model.selected();
    const auto property = model.metaObject()->property(model.metaObject()->indexOfProperty("currentIndex"));
    QSignalSpy indexChanged(&model, property.notifySignal());
    QSignalSpy selectedChanged(&model, &MediaGalleryModel::selectedChanged);
    model.setItems({item("inserted"), item("first"), item("selected")});
    QCOMPARE(model.selected(), selected);
    QCOMPARE(model.currentIndex(), 2);
    QCOMPARE(indexChanged.size(), 1);
    QCOMPARE(selectedChanged.size(), 0);
  }
  void completeVirtualModelAndSelection() {
    MediaGalleryModel model;
    QVariantList items;
    for (int i = 0; i < 10000; ++i) { items.append(item(QString::number(i))); }
    model.setItems(items);
    QCOMPARE(model.gridModel()->rowCount(), 10000);
    QCOMPARE(model.gridModel()->data(model.gridModel()->index(9999, 0), Qt::UserRole).toMap()["text"].toString(), QString("9999"));
    QSignalSpy reset(model.gridModel(), &QAbstractItemModel::modelReset);
    QSignalSpy inserted(model.gridModel(), &QAbstractItemModel::rowsInserted);
    items.append(item("appended")); model.setItems(items);
    QCOMPARE(reset.size(), 0); QCOMPARE(inserted.size(), 1);
    QCOMPARE(model.gridModel()->rowCount(), 10001);
    model.open(9999);
    QCOMPARE(model.selected()["text"].toString(), QString("9999"));
    QVERIFY(model.singleView());
    model.showGrid();
    QVERIFY(!model.singleView());
    model.setItems({});
    QVERIFY(model.selected().isEmpty());
    QCOMPARE(model.gridModel()->rowCount(), 0);
  }
};
QTEST_GUILESS_MAIN(MediaGalleryModelTests)
#include "MediaGalleryModelTests.moc"
