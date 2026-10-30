#include "ProviderSettings.h"
#include <QtTest>
#include <QSemaphore>
#include "../../tests/TestHttpServer.h"
#include <QJsonDocument>
#include <QMutex>
#include <QMutexLocker>
#include <QThread>

class ProviderSettingsTest : public QObject {
    Q_OBJECT
private:
    static nt::server::SaveTarget target(QString token = "fake-account") { return {QUrl("http://127.0.0.1:12345"), token, {}, {}, "fake-instance"}; }
    struct Fixture {
        QMutex mutex;
        QList<QPair<QString, QJsonObject>> writes, reads;
        bool failSave = false;
        QString validationStatus = "valid";
        bool failValidation = false;
        nt::server::QueryResult call(bool write, const QString& procedure, const QJsonObject& input) {
            QMutexLocker lock(&mutex);
            if (write) { writes.append({procedure, input}); }
            else { reads.append({procedure, input}); }
            if (procedure == "settings.list") {
                return {QJsonObject{{"settings", QJsonArray{
                    QJsonObject{{"env_var", "FAKE_KEY"}, {"group", "Fake"}, {"is_secret", true}, {"value", "****"}},
                    QJsonObject{{"env_var", "FAKE_URL"}, {"group", "Fake"}, {"is_secret", false}, {"value", "http://old"}},
                    QJsonObject{{"env_var", "OTHER_KEY"}, {"group", "Other"}, {"is_secret", true}, {"value", "****"}}
                }}}, {}};
            }
            if (procedure == "settings.secrets.list") { return {QJsonObject{{"secrets", QJsonArray{QJsonObject{{"id", "012345678901234567890123456789ab"}, {"key", "FAKE_KEY"}, {"is_configured", true}}, QJsonObject{{"key", "OTHER_KEY"}, {"is_configured", true}}}}}, {}}; }
            if (procedure == "settings.providerCatalog") { return {QJsonArray{QJsonObject{{"provider", "fake"}, {"name", "Fake"}, {"configured", true}, {"keys", QJsonArray{"FAKE_KEY", "FAKE_URL"}}}, QJsonObject{{"provider", "other"}, {"name", "Other"}, {"configured", false}, {"keys", QJsonArray{"OTHER_KEY"}}}}, {}}; }
            if (procedure == "models.llmByProvider") { return {QJsonArray{QJsonObject{{"id", "fake-server-model"}}}, {}}; }
            if (procedure == "models.providers") { return {QJsonArray{QJsonObject{{"provider", "fake"}}}, {}}; }
            if (procedure == "settings.update" && failSave) { return {{}, {"fake-secret-should-never-appear", "FAILED", {}, 500}}; }
            if (procedure == "settings.secrets.validate" && failValidation) { return {{}, {"fake-key-in-error", "UNAUTHORIZED", {}, 401}}; }
            if (procedure == "settings.secrets.validate") { return {QJsonObject{{"status", validationStatus}, {"message", "fake-secret-should-never-appear"}}, {}}; }
            return {QJsonObject{}, {}};
        }
    };
    static void load(ProviderSettings& settings, Fixture& fixture) {
        settings.setTargetForTest(target());
        settings.setCallForTest([&fixture](bool write, const QString& procedure, const QJsonObject& input) { return fixture.call(write, procedure, input); });
        settings.reload();
    }
private slots:
    void safeMetadataAndPartialSave() {
        Fixture fixture; ProviderSettings settings; load(settings, fixture);
        QTRY_VERIFY(!settings.busy()); QTRY_COMPARE(settings.fields().size(), 2);
        const auto secret = settings.fields().first().toMap();
        QCOMPARE(secret.value("value").toString(), QString{}); QVERIFY(secret.value("configured").toBool());
        settings.draft("FAKE_URL", "http://new"); QVERIFY(settings.dirty()); settings.save();
        QTRY_VERIFY(!settings.busy()); QTRY_VERIFY(!settings.dirty());
        QMutexLocker lock(&fixture.mutex); QCOMPARE(fixture.writes.size(), 1);
        const auto patch = fixture.writes.first().second;
        QCOMPARE(patch.value("settings").toObject(), QJsonObject({{"FAKE_URL", "http://new"}}));
        QVERIFY(patch.value("secrets").toObject().isEmpty());
    }
    void failureRetainsDraftAndTestDoesNotSave() {
        Fixture fixture; ProviderSettings settings; load(settings, fixture);
        QTRY_VERIFY(!settings.busy()); settings.draft("FAKE_KEY", "fake-secret-should-never-appear");
        fixture.failSave = true; settings.save(); QTRY_VERIFY(!settings.busy()); QVERIFY(settings.dirty());
        QVERIFY(!settings.message().contains("fake-secret"));
        settings.test("FAKE_KEY"); QTRY_VERIFY(!settings.busy()); QCOMPARE(settings.testMessage(), "Credential accepted."); QVERIFY(settings.dirty());
        fixture.failSave = false; settings.save(); QTRY_VERIFY(!settings.busy()); QTRY_VERIFY(!settings.dirty());
        QMutexLocker lock(&fixture.mutex);
        QCOMPARE(fixture.writes.at(1).first, "settings.secrets.validate");
        QCOMPARE(fixture.writes.at(1).second.value("value").toString(), "fake-secret-should-never-appear");
        QCOMPARE(fixture.writes.at(2).second.value("secrets").toObject().value("FAKE_KEY").toString(), "fake-secret-should-never-appear");
    }
    void savedCredentialValidationStates() {
        Fixture fixture; ProviderSettings settings; load(settings, fixture); QTRY_VERIFY(!settings.busy());
        settings.test("FAKE_KEY"); QTRY_VERIFY(!settings.busy()); QCOMPARE(settings.testMessage(), "Credential accepted.");
        { QMutexLocker lock(&fixture.mutex); QVERIFY(!fixture.writes.last().second.contains("value")); }
        fixture.validationStatus = "invalid"; settings.test("FAKE_KEY"); QTRY_VERIFY(!settings.busy()); QVERIFY(settings.testMessage().contains("rejected"));
        fixture.validationStatus = "unverifiable"; settings.test("FAKE_KEY"); QTRY_VERIFY(!settings.busy()); QVERIFY(settings.testMessage().contains("cannot be verified"));
        fixture.failValidation = true; settings.test("FAKE_KEY"); QTRY_VERIFY(!settings.busy()); QVERIFY(settings.testMessage().isEmpty()); QVERIFY(!settings.message().contains("fake-key"));
        QVERIFY(!settings.dirty());
    }
    void savedModelAvailabilityIsReadOnly() {
        Fixture fixture; ProviderSettings settings; load(settings, fixture); QTRY_VERIFY(!settings.busy());
        settings.checkModels(); QTRY_VERIFY(!settings.busy()); QVERIFY(settings.testMessage().contains("reports 1 language"));
        QMutexLocker lock(&fixture.mutex); QVERIFY(fixture.writes.isEmpty());
        QCOMPARE(fixture.reads.last().first, "models.llmByProvider");
        QCOMPARE(fixture.reads.last().second.value("provider").toString(), "fake");
    }
    void explicitRemovalAndSwitch() {
        Fixture fixture; ProviderSettings settings; load(settings, fixture); QTRY_VERIFY(!settings.busy());
        settings.draft("FAKE_KEY", "fake-draft"); settings.selectGroup("Other"); QCOMPARE(settings.selectedGroup(), "Fake");
        settings.remove("FAKE_KEY"); { QMutexLocker lock(&fixture.mutex); QVERIFY(fixture.writes.isEmpty()); }
        settings.discard(); settings.remove("FAKE_KEY"); QTRY_VERIFY(!settings.busy());
        { QMutexLocker lock(&fixture.mutex); QCOMPARE(fixture.writes.first().first, "settings.secrets.delete"); QCOMPARE(fixture.writes.first().second, QJsonObject({{"key", "FAKE_KEY"}})); }
        settings.selectGroup("Other"); QCOMPARE(settings.selectedGroup(), "Other"); QVERIFY(!settings.dirty());
        QVERIFY(settings.fields().first().toMap().value("configured").toBool());
        QVERIFY(!settings.fields().first().toMap().value("removable").toBool());
        settings.remove("OTHER_KEY");
        { QMutexLocker lock(&fixture.mutex); QCOMPARE(fixture.writes.size(), 1); }
    }
    void authenticatedTransportAndIdentity() {
        TestHttpServer server;
        Fixture fixture;
        const auto envelope = [](const QJsonValue& data) { return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", data}}}}).toJson(QJsonDocument::Compact); };
        server.setJson([&](const QByteArray& path, const QUrl&) {
            return envelope(fixture.call(false, QString::fromLatin1(path.mid(6)), {}).data);
        });
        server.setPost([&](const QByteArray& path, const QByteArray& body) {
            return envelope(fixture.call(true, QString::fromLatin1(path.mid(6)), QJsonDocument::fromJson(body).object()).data);
        });
        server.setInstanceSecret("expected-test-instance");
        server.setFile("/ready", ServedFile("{}"));
        ProviderSettings settings;
        settings.setTargetForTest({server.base(), "fake-auth-token", {}, {}, "expected-test-instance"});
        settings.reload(); QTRY_VERIFY(!settings.busy()); QTRY_COMPARE(settings.fields().size(), 2);
        settings.draft("FAKE_KEY", "fake-scoped-test-key"); settings.save(); QTRY_VERIFY(!settings.busy()); QTRY_VERIFY(!settings.dirty());
        QCOMPARE(server.countRequests("POST", "/trpc/settings.update"), 1);
        bool sawWrite = false;
        for (const auto& req : server.requests()) {
            if (req.target.startsWith("/trpc/")) { QCOMPARE(req.headers.value("authorization"), QByteArray("Bearer fake-auth-token")); }
            QVERIFY(!req.target.contains("fake-scoped-test-key"));
            if (req.method == "POST") { sawWrite = true; QVERIFY(req.body.contains("fake-scoped-test-key")); }
            QVERIFY(!req.target.startsWith("/trpc/settings.secrets.get"));
        }
        QVERIFY(sawWrite);
        server.clearRequests();
        settings.setTargetForTest({server.base(), "fake-auth-token", {}, {}, "wrong-instance"});
        settings.reload(); QTRY_VERIFY(!settings.busy()); QTRY_COMPARE(settings.fields().size(), 2);
        settings.draft("FAKE_KEY", "another-fake-key"); settings.save(); QTRY_VERIFY(!settings.busy()); QVERIFY(settings.dirty());
        QCOMPARE(server.countRequests("POST", "/trpc/settings.update"), 0);
        for (const auto& req : server.requests()) { QVERIFY(!req.body.contains("another-fake-key")); }
    }
    void staleAccountCompletion_data() {
        QTest::addColumn<QString>("scope");
        QTest::newRow("account") << QString("account");
        QTest::newRow("server") << QString("server");
        QTest::newRow("instance") << QString("instance");
    }
    void staleAccountCompletion() {
        QFETCH(QString, scope);
        Fixture fixture; ProviderSettings settings; load(settings, fixture); QTRY_VERIFY(!settings.busy());
        QSemaphore entered, release;
        bool completed = false;
        settings.setCallForTest([&](bool, const QString&, const QJsonObject&) {
            connect(QThread::currentThread(), &QThread::finished, &settings, [&] { completed = true; }, Qt::QueuedConnection);
            entered.release(); release.acquire();
            return nt::server::QueryResult{QJsonObject{{"status", "valid"}}, {}};
        });
        settings.test("FAKE_KEY"); QVERIFY(entered.tryAcquire(1, 2000));
        auto switched = target();
        if (scope == "account") { switched.token = "another-fake-account"; }
        else if (scope == "server") { switched.server = QUrl("http://127.0.0.1:12346"); }
        else { switched.expectedInstance = "another-instance"; }
        settings.setTargetForTest(switched);
        QVERIFY(settings.fields().isEmpty()); QVERIFY(!settings.dirty()); QVERIFY(!settings.busy());
        release.release(); QTRY_VERIFY(completed); QVERIFY(settings.testMessage().isEmpty()); QVERIFY(settings.fields().isEmpty());
    }
};
QTEST_GUILESS_MAIN(ProviderSettingsTest)
#include "tst_providersettings.moc"
