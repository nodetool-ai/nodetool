#include "appearance/AppearanceSettings.h"

#include <QSettings>
#include <QSignalSpy>
#include <QTemporaryDir>
#include <QTest>
#include <limits>

class AppearanceTests : public QObject {
    Q_OBJECT
private slots:
    void defaultsAndPersistence() {
        QTemporaryDir directory;
        QVERIFY(directory.isValid());
        QSettings settings(directory.filePath("appearance.ini"), QSettings::IniFormat);
        nt::chat::AppearanceSettings appearance(settings);
        QCOMPARE(appearance.themePreference(), QStringLiteral("System"));
        QCOMPARE(appearance.uiScale(), 1.0);
        QCOMPARE(appearance.textScale(), 1.0);
        QCOMPARE(appearance.motionPreference(), QStringLiteral("System"));
        QVERIFY(!appearance.reducedMotion());
        QSignalSpy changed(&appearance, &nt::chat::AppearanceSettings::changed);
        appearance.setThemePreference("Light");
        appearance.setUiScale(1.25);
        appearance.setTextScale(1.5);
        appearance.setMotionPreference("Reduce");
        QCOMPARE(changed.size(), 4);
        QVERIFY(appearance.reducedMotion());
        nt::chat::AppearanceSettings reopened(settings);
        QCOMPARE(reopened.themePreference(), QStringLiteral("Light"));
        QCOMPARE(reopened.uiScale(), 1.25);
        QCOMPARE(reopened.textScale(), 1.5);
        QCOMPARE(reopened.motionPreference(), QStringLiteral("Reduce"));
        reopened.setMotionPreference("Full");
        QVERIFY(!reopened.reducedMotion());
    }
    void invalidValuesAndBounds() {
        QTemporaryDir directory;
        QVERIFY(directory.isValid());
        QSettings settings(directory.filePath("appearance.ini"), QSettings::IniFormat);
        settings.setValue("appearance/themePreference", "unexpected");
        settings.setValue("appearance/uiScale", "invalid");
        settings.setValue("appearance/textScale", -1);
        settings.setValue("appearance/motionPreference", "unexpected");
        nt::chat::AppearanceSettings appearance(settings);
        QCOMPARE(appearance.themePreference(), QStringLiteral("System"));
        QCOMPARE(appearance.uiScale(), 1.0);
        QCOMPARE(appearance.textScale(), 1.0);
        QCOMPARE(appearance.motionPreference(), QStringLiteral("System"));
        appearance.setThemePreference("invalid");
        appearance.setUiScale(std::numeric_limits<double>::infinity());
        QCOMPARE(appearance.themePreference(), QStringLiteral("System"));
        QCOMPARE(appearance.uiScale(), 1.0);
        appearance.setUiScale(0.1);
        appearance.setTextScale(3.0);
        QCOMPARE(appearance.uiScale(), 1.0);
        QCOMPARE(appearance.textScale(), 1.0);
    }
};
QTEST_MAIN(AppearanceTests)
#include "AppearanceTests.moc"
