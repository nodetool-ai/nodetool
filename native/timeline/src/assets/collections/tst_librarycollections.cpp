#include "LibraryCollections.h"
#include "app/Preferences/PreferencesSettings.h"

#include <QCryptographicHash>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QRegularExpression>
#include <QSettings>
#include <QTemporaryDir>
#include <QtTest>

class TestLibraryCollections : public QObject {
  Q_OBJECT
private:
  QTemporaryDir settingsDirectory;
  static QString key(const QString &scope) {
    return QStringLiteral("libraryCollections/v1/") +
           QString::fromLatin1(QCryptographicHash::hash(
                                   scope.toUtf8(), QCryptographicHash::Sha256)
                                   .toHex());
  }
private slots:
  void initTestCase() {
    QVERIFY(settingsDirectory.isValid());
    QCoreApplication::setOrganizationName({});
    QCoreApplication::setApplicationName("LibraryCollections");
    qputenv("NODETOOL_TIMELINE_PREFERENCES",
            settingsDirectory.filePath("preferences.ini").toUtf8());
  }
  void init() { nt::app::openTimelinePreferences()->clear(); }
  void startupWithoutOrganizationPreservesOtherPreferences() {
    QVERIFY(QCoreApplication::organizationName().isEmpty());
    const auto settings = nt::app::openTimelinePreferences();
    settings->setValue("cacheFolder", "existing-cache");
    settings->setValue("decoderMode", "hw");
    settings->sync();
    LibraryCollections library;
    library.setScope("startup");
    const auto id = library.create("Saved at startup");
    QVERIFY(!id.isEmpty());
    QVERIFY(library.error().isEmpty());
    LibraryCollections reloaded;
    reloaded.setScope("startup");
    QCOMPARE(reloaded.collections().first().toMap().value("id").toString(), id);
    const auto preferences = nt::app::openTimelinePreferences();
    QCOMPARE(preferences->value("cacheFolder").toString(), "existing-cache");
    QCOMPARE(preferences->value("decoderMode").toString(), "hw");
    QCOMPARE(preferences->fileName(),
             settingsDirectory.filePath("preferences.ini"));
  }
  void reloadPreservesNamesAndFullIdentifiers() {
    LibraryCollections original;
    original.setScope("server/account/project");
    const auto id = original.create("  First selection  ");
    QVERIFY(QRegularExpression("^[0-9a-f]{32}$").match(id).hasMatch());
    const QString full = "0123456789abcdef0123456789abcdef";
    QVERIFY(original.addAssets(id, {full, "legacy:asset/folder", full}));
    QVERIFY(original.rename(id, "Saved selection"));
    LibraryCollections restored;
    restored.setScope(original.scope());
    QCOMPARE(restored.collections().size(), 1);
    QCOMPARE(restored.collections().first().toMap().value("name").toString(),
             "Saved selection");
    restored.setSelectedId(id);
    QCOMPARE(restored.assetIds(), QStringList({full, "legacy:asset/folder"}));
    QVERIFY(restored.error().isEmpty());
  }
  void namespacesAndLogoutNeverReuseSelection() {
    LibraryCollections library;
    library.setScope("a/b");
    const auto first = library.create("Account A");
    library.setSelectedId(first);
    library.setScope("a%2Fb");
    QVERIFY(library.collections().isEmpty());
    QVERIFY(library.selectedId().isEmpty());
    const auto second = library.create("Account B");
    library.setSelectedId(second);
    library.setScope({});
    QVERIFY(library.collections().isEmpty());
    QVERIFY(library.assetIds().isEmpty());
    QVERIFY(library.selectedId().isEmpty());
    QVERIFY(library.create("Logged out").isEmpty());
    library.setScope("a/b");
    QCOMPARE(library.collections().size(), 1);
    QCOMPARE(library.collections().first().toMap().value("id").toString(),
             first);
    QVERIFY(library.selectedId().isEmpty());
  }
  void membershipMaintainsOrderAndEmptySelection() {
    LibraryCollections library;
    library.setScope("membership");
    const auto first = library.create("One");
    const auto second = library.create("Two");
    library.setSelectedId(first);
    QVERIFY(library.addAssets(first, {"c", "a", "b", "a"}));
    QVERIFY(library.addAssets(first, {"a", "d", "c"}));
    QCOMPARE(library.assetIds(), QStringList({"c", "a", "b", "d"}));
    QVERIFY(library.addAssets(second, {"b"}));
    QVERIFY(library.removeAssets(first, {"a", "absent", "c", "a"}));
    QCOMPARE(library.assetIds(), QStringList({"b", "d"}));
    QVERIFY(library.removeAssets(first, {"b", "d"}));
    QVERIFY(library.assetIds().isEmpty());
    QCOMPARE(library.selectedId(), first);
    QVERIFY(library.remove(second));
    QCOMPARE(library.selectedId(), first);
    QVERIFY(library.remove(first));
    QVERIFY(library.selectedId().isEmpty());
  }
  void invalidMutationsKeepSavedData() {
    LibraryCollections library;
    library.setScope("validation");
    const auto id = library.create("Valid");
    library.setSelectedId(id);
    QVERIFY(library.addAssets(id, {"kept"}));
    QVERIFY(!library.rename(id, " \n "));
    QVERIFY(!library.addAssets(id, {"new", ""}));
    QVERIFY(!library.addAssets(id, {QString(4097, 'a')}));
    QVERIFY(!library.remove("absent"));
    library.setSelectedId("absent");
    QCOMPARE(library.selectedId(), id);
    QCOMPARE(library.assetIds(), QStringList({"kept"}));
    QVERIFY(!library.error().isEmpty());
    LibraryCollections reloaded;
    reloaded.setScope(library.scope());
    reloaded.setSelectedId(id);
    QCOMPARE(reloaded.assetIds(), QStringList({"kept"}));
  }
  void membershipLimitRejectsTheWholeMutation() {
    LibraryCollections library;
    library.setScope("large-membership");
    const auto id = library.create("Many assets");
    library.setSelectedId(id);
    QStringList ids;
    for (int i = 0; i < 10000; ++i) {
      ids.append(QString::number(i));
    }
    QVERIFY(library.addAssets(id, ids));
    QCOMPARE(library.assetIds(), ids);
    QVERIFY(!library.addAssets(id, {"overflow"}));
    QCOMPARE(library.assetIds(), ids);
    QVERIFY(library.removeAssets(id, ids));
    QCOMPARE(library.selectedId(), id);
    QVERIFY(library.assetIds().isEmpty());
  }
  void corruptedSettingsAreRejected_data() {
    QTest::addColumn<QByteArray>("payload");
    QTest::newRow("empty") << QByteArray{};
    QTest::newRow("syntax") << QByteArray("{broken");
    QTest::newRow("version") << QByteArray(R"({"version":2,"collections":[]})");
    QTest::newRow("wrong-membership") << QByteArray(
        R"({"version":1,"collections":[{"id":"legacy","name":"One","assetIds":[42]}]})");
    QTest::newRow("duplicate-collection") << QByteArray(
        R"({"version":1,"collections":[{"id":"a","name":"One","assetIds":[]},{"id":"a","name":"Two","assetIds":[]}]})");
    QTest::newRow("size") << QByteArray(8 * 1024 * 1024 + 1, ' ');
  }
  void corruptedSettingsAreRejected() {
    QFETCH(QByteArray, payload);
    const auto settings = nt::app::openTimelinePreferences();
    settings->setValue(key("corrupted"), payload);
    settings->sync();
    LibraryCollections library;
    library.setScope("corrupted");
    QVERIFY(library.collections().isEmpty());
    QVERIFY(!library.error().isEmpty());
    library.setScope("fresh");
    QVERIFY(library.error().isEmpty());
  }
  void persistedMembershipDeduplicatesWithoutNormalizingIds() {
    const auto settings = nt::app::openTimelinePreferences();
    settings->setValue(
        key("legacy"),
        QByteArray(
            R"({"version":1,"collections":[{"id":"legacy-list","name":"Legacy","assetIds":["ABC-old"," asset ","ABC-old"]}]})"));
    settings->sync();
    LibraryCollections library;
    library.setScope("legacy");
    library.setSelectedId("legacy-list");
    QCOMPARE(library.assetIds(), QStringList({"ABC-old", " asset "}));
  }
};

QTEST_GUILESS_MAIN(TestLibraryCollections)
#include "tst_librarycollections.moc"
