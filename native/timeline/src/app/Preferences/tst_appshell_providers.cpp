#include "app/startup/DecodeDefault.h"
#include "audio/hooks/OutputDevice.h"
#include <QFileInfo>
#include <QSettings>
#include <QtTest>
#include <array>
#include <string>

class TestAppShellProviders : public QObject {
    Q_OBJECT
    void setPreference(const QString& key, const QVariant& value) {
        QSettings settings(qEnvironmentVariable("NODETOOL_TIMELINE_PREFERENCES"), QSettings::IniFormat);
        if (value.isValid()) {
            settings.setValue(key, value);
        } else {
            settings.remove(key);
        }
        settings.sync();
        QCOMPARE(settings.status(), QSettings::NoError);
    }
private slots:
    void initTestCase() {
        const auto path = qEnvironmentVariable("NODETOOL_TIMELINE_PREFERENCES");
        QVERIFY(!path.isEmpty());
        QVERIFY(QFileInfo::exists(path));
    }
    void cleanupTestCase() {
        setPreference("decoderMode", QStringLiteral("hw"));
        setPreference("audioDevice", QStringLiteral("Studio Output"));
    }
    void decodeDefault() {
        QCOMPARE(nt::app::resolveDecodeMode(), QStringLiteral("hw"));
    }
    void decodeExplicitFlags() {
        QCOMPARE(nt::app::resolveDecodeMode(QStringLiteral("sw")), QStringLiteral("sw"));
        QCOMPARE(nt::app::resolveDecodeMode({}, QStringLiteral("auto")), QStringLiteral("auto"));
        QCOMPARE(nt::app::resolveDecodeMode(QStringLiteral("sw"), QStringLiteral("hw")), QStringLiteral("hw"));
    }
    void decodeHelp() {
        QCOMPARE(nt::app::decodeModeHelp(), QStringLiteral("Default from Preferences"));
    }
    void decodeFallback_data() {
        QTest::addColumn<QVariant>("value");
        QTest::newRow("invalid") << QVariant(QStringLiteral("unsupported"));
        QTest::newRow("empty") << QVariant(QString{});
        QTest::newRow("missing") << QVariant{};
    }
    void decodeFallback() {
        QFETCH(QVariant, value);
        setPreference("decoderMode", value);
        QCOMPARE(nt::app::resolveDecodeMode(), QStringLiteral("sw"));
    }
    void decodeReadsAtCallTime() {
        for (const auto& mode : {QStringLiteral("auto"), QStringLiteral("hw"), QStringLiteral("sw")}) {
            setPreference("decoderMode", mode);
            QCOMPARE(nt::app::resolveDecodeMode(), mode);
        }
    }
    void audioDeviceSelection() {
        const std::array<std::string, 3> names{"Built-in Output", "Studio Output", "Headphones"};
        const auto selected = nt::audio::selectedOutputDevice(names);
        QVERIFY(selected.has_value());
        QCOMPARE(*selected, std::size_t{1});
    }
    void audioReadsAtCallTime_data() {
        QTest::addColumn<QVariant>("value");
        QTest::addColumn<int>("index");
        QTest::newRow("utf8") << QVariant(QStringLiteral("Moniteurs écoutés")) << 2;
        QTest::newRow("different device") << QVariant(QStringLiteral("Built-in Output")) << 0;
        QTest::newRow("unknown") << QVariant(QStringLiteral("Disconnected Output")) << -1;
        QTest::newRow("exact name only") << QVariant(QStringLiteral("studio output")) << -1;
        QTest::newRow("empty") << QVariant(QString{}) << -1;
        QTest::newRow("missing") << QVariant{} << -1;
    }
    void audioReadsAtCallTime() {
        QFETCH(QVariant, value);
        QFETCH(int, index);
        setPreference("audioDevice", value);
        const std::array<std::string, 3> names{"Built-in Output", "Studio Output", "Moniteurs écoutés"};
        const auto selected = nt::audio::selectedOutputDevice(names);
        if (index < 0) {
            QVERIFY(!selected.has_value());
        } else {
            QVERIFY(selected.has_value());
            QCOMPARE(*selected, static_cast<std::size_t>(index));
        }
    }
};
QTEST_GUILESS_MAIN(TestAppShellProviders)
#include "tst_appshell_providers.moc"
