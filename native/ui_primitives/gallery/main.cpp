#include <QCommandLineParser>
#include <QGuiApplication>
#include <QFontInfo>
#include <QTextLayout>
#include <QTextStream>
#include <QGlyphRun>
#include <QImage>
#include <algorithm>
#include <cmath>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickWindow>
#include <QTimer>
#include <QUrl>

int main(int argc, char **argv) {
    QGuiApplication app(argc, argv);
    QCommandLineParser parser;
    parser.addOption({QStringLiteral("screenshot"), QStringLiteral("Save a gallery frame"), QStringLiteral("path")});
    parser.addOption({QStringLiteral("ui-scale"), QStringLiteral("UI scale"), QStringLiteral("scale"), QStringLiteral("1")});
    parser.addOption({QStringLiteral("text-scale"), QStringLiteral("Text scale"), QStringLiteral("scale"), QStringLiteral("1")});
    parser.addOption({QStringLiteral("scheme"), QStringLiteral("dark or light"), QStringLiteral("scheme"), QStringLiteral("dark")});
    parser.addOption({QStringLiteral("width"), QStringLiteral("Window width"), QStringLiteral("pixels"), QStringLiteral("720")});
    parser.addOption({QStringLiteral("rtl"), QStringLiteral("Mirror the gallery layout")});
    parser.addOption({QStringLiteral("compare-expected"), QStringLiteral("Reference image"), QStringLiteral("path")});
    parser.addOption({QStringLiteral("compare-actual"), QStringLiteral("Captured image"), QStringLiteral("path")});
    parser.addOption({QStringLiteral("qt-version"), QStringLiteral("Print the Qt runtime version")});
    parser.process(app);
    if (parser.isSet(QStringLiteral("qt-version"))) {
        QTextStream(stdout) << qVersion() << Qt::endl;
        return 0;
    }
    if (parser.isSet(QStringLiteral("compare-expected"))) {
        const QImage expected(parser.value(QStringLiteral("compare-expected")));
        const QImage actual(parser.value(QStringLiteral("compare-actual")));
        if (expected.isNull() || actual.isNull() || expected.size() != actual.size()) return 1;
        int different = 0;
        for (int y = 0; y < expected.height(); ++y) {
            for (int x = 0; x < expected.width(); ++x) {
                const QColor a = expected.pixelColor(x, y), b = actual.pixelColor(x, y);
                if (std::max({std::abs(a.red() - b.red()), std::abs(a.green() - b.green()),
                              std::abs(a.blue() - b.blue()), std::abs(a.alpha() - b.alpha())}) > 2) ++different;
            }
        }
        return different <= expected.width() * expected.height() / 1000 ? 0 : 1;
    }
    QQmlApplicationEngine engine;
    bool validScale = false;
    const double textScale = parser.value(QStringLiteral("text-scale")).toDouble(&validScale);
    if (!validScale || !std::isfinite(textScale) || textScale <= 0) return 1;
    const int width = parser.value(QStringLiteral("width")).toInt();
    if (width < 200) return 1;
    engine.rootContext()->setContextProperty(QStringLiteral("galleryWidth"), width);
    engine.rootContext()->setContextProperty(QStringLiteral("galleryRtl"), parser.isSet(QStringLiteral("rtl")));
    bool validUiScale = false;
    const double uiScale = parser.value(QStringLiteral("ui-scale")).toDouble(&validUiScale);
    if (!validUiScale || !std::isfinite(uiScale) || uiScale <= 0) return 1;
    engine.rootContext()->setContextProperty(QStringLiteral("galleryUiScale"), uiScale);
    engine.rootContext()->setContextProperty(QStringLiteral("galleryTextScale"), textScale);
    engine.rootContext()->setContextProperty(QStringLiteral("galleryLight"), parser.value(QStringLiteral("scheme")) == QStringLiteral("light"));
    engine.load(QUrl(QStringLiteral("qrc:/gallery/Main.qml")));
    if (engine.rootObjects().isEmpty()) return 1;
    if (parser.isSet(QStringLiteral("screenshot"))) {
        QTimer::singleShot(400, &app, [&] {
            auto *window = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
            QVariant bounds;
            if (!window || !QMetaObject::invokeMethod(window, "boundsValid", Q_RETURN_ARG(QVariant, bounds)) || !bounds.toBool()) {
                qWarning("Gallery controls exceed their flow bounds");
                app.exit(1); return;
            }
            auto *title = window->findChild<QObject *>(QStringLiteral("galleryTitle"));
            if (!title) { app.exit(1); return; }
            const QFont font = title->property("font").value<QFont>();
            QTextLayout layout(QStringLiteral("Sample"), font);
            layout.beginLayout(); layout.createLine(); layout.endLayout();
            const auto runs = layout.glyphRuns();
            if (QFontInfo(font).family() != QStringLiteral("Inter") || runs.isEmpty() || runs.first().rawFont().familyName() != QStringLiteral("Inter")) {
                qWarning("Gallery reference font is not Inter");
                app.exit(1); return;
            }
            app.exit(window->grabWindow().save(parser.value(QStringLiteral("screenshot"))) ? 0 : 1);
        });
    }
    return app.exec();
}
