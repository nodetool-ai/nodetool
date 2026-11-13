// nodetool-gpu-preview-demo: a WGSL compute shader on the wgpu engine,
// shown in a Qt Quick item with QML content moving over it.
//
//   nodetool-gpu-preview-demo [--size WxH] [--float] [--free] [--frames N]
//
// --size    render frames at this size instead of the item's size
// --float   use the rgba16float module and texture
// --free    render as fast as slots allow, not one frame per displayed frame
// --frames  quit after N displayed frames and print the counters as JSON
#include "DemoCatalog.h"
#include "GpuPreview.h"
#include "GpuPreviewItem.h"
#include "ShaderFrameSource.h"

#include <QCommandLineParser>
#include <QElapsedTimer>
#include <QFile>
#include <QGuiApplication>
#include <QJsonDocument>
#include <QJsonObject>
#include <QQmlApplicationEngine>
#include <QQuickWindow>

#include <cstdio>

int main(int argc, char** argv) {
    QGuiApplication app(argc, argv);
    QCommandLineParser parser;
    parser.addHelpOption();
    parser.addOption({"size", "Frame size in pixels.", "WxH"});
    parser.addOption({"float", "Use the rgba16float module."});
    parser.addOption({"free", "Render without waiting for the display."});
    parser.addOption({"frames", "Quit after this many displayed frames.", "N"});
    parser.process(app);

    QSize frameSize;
    if (parser.isSet("size")) {
        const QStringList parts = parser.value("size").split('x');
        if (parts.size() == 2) frameSize = QSize(parts[0].toInt(), parts[1].toInt());
        if (frameSize.isEmpty()) {
            std::fprintf(stderr, "--size expects WxH\n");
            return 2;
        }
    }
    const qulonglong frameLimit = parser.value("frames").toULongLong();

    QFile wgsl(QStringLiteral(":/qt/qml/NodeTool/GpuPreviewDemo/demo/plasma.wgsl"));
    if (!wgsl.open(QIODevice::ReadOnly)) {
        std::fprintf(stderr, "the demo shader is missing from the resources\n");
        return 1;
    }
    using nt::preview::ShaderFrameSource;
    const bool useFloat = parser.isSet("float");

    QQmlApplicationEngine engine;
    engine.setInitialProperties({
        {"demoCatalog", nt::preview::demo::catalogJson(QString::fromUtf8(wgsl.readAll()))},
        {"demoModule", useFloat ? QStringLiteral("demo.plasma16@1") : QStringLiteral("demo.plasma@1")},
        {"demoFormat", int(useFloat ? ShaderFrameSource::Rgba16Float : ShaderFrameSource::Rgba8)},
        {"demoPacing", int(parser.isSet("free") ? ShaderFrameSource::Free : ShaderFrameSource::Display)},
        {"demoFrameSize", QSizeF(frameSize)},
        {"visible", false},
    });
    engine.loadFromModule("NodeTool.GpuPreviewDemo", "Main");
    if (engine.rootObjects().isEmpty()) return 1;
    auto* window = qobject_cast<QQuickWindow*>(engine.rootObjects().constFirst());
    if (!window) return 1;
    // Before the first expose: Qt then creates its device with what sharing needs.
    nt::preview::prepareWindow(window);
    window->show();

    auto* preview = window->property("preview").value<nt::preview::GpuPreviewItem*>();
    auto* source = window->property("source").value<ShaderFrameSource*>();
    if (!preview || !source) return 1;
    QElapsedTimer clock;
    if (frameLimit > 0) {
        QObject::connect(preview, &nt::preview::GpuPreviewItem::frameShown, &app, [&] {
            if (preview->framesShown() == 1) clock.start();  // skip start-up and pipeline creation
            if (preview->framesShown() < frameLimit + 1) return;
            QVariantMap stats = source->stats();
            const double seconds = double(clock.nsecsElapsed()) / 1e9;
            stats["frames"] = frameLimit;
            stats["seconds"] = seconds;
            stats["framesPerSecond"] = seconds > 0 ? double(frameLimit) / seconds : 0.0;
            stats["frameWidth"] = preview->frameSize().width();
            stats["frameHeight"] = preview->frameSize().height();
            stats["device"] = source->device();
            std::printf("%s\n", QJsonDocument(QJsonObject::fromVariantMap(stats)).toJson(QJsonDocument::Compact).constData());
            app.quit();
        });
        auto fail = [&] {
            const QString reason = preview->statusText().isEmpty() ? source->error() : preview->statusText();
            if (reason.isEmpty()) return;
            std::fprintf(stderr, "%s\n", qPrintable(reason));
            app.exit(3);
        };
        QObject::connect(preview, &nt::preview::GpuPreviewItem::statusChanged, &app, fail);
        QObject::connect(source, &nt::preview::GpuFrameSource::errorChanged, &app, fail);
    }
    return app.exec();
}
