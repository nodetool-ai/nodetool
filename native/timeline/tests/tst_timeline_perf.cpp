#include "measure/StressDocument.h"
#include "DockLayoutStore.h"
#include "measure/ObjectCreations.h"
#include "measure/ValueWriteBacks.h"
#include "measure/OffscreenRhi.h"
#include "preview/hw/HwWindow.h"
#include <QAbstractItemModel>
#include <QSignalSpy>
#include "midi/PianoRollController.h"
#include "midi/NoteLayerItem.h"
// UI-thread-only stress driver. QPA stays offscreen in both render modes.
// Counter/profiler and timing passes run in separate fresh processes.
#include "app/EditRegistry.h"
#include "aiassist/AssistantCommands.h"
#include "edit/ClipGestureController.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "model/LaneClipModel.h"
#include "playback/PlaybackClock.h"
#include "server/AssetCache.h"
#include "server/TimelineAssetCacheContext.h"
#include "ui/TimelineGestureArea.h"
#include "ui/TimelineViewState.h"

#include <QCommandLineParser>
#include <QCoreApplication>
#include <QDir>
#include <QElapsedTimer>
#include <QFile>
#include <QGuiApplication>
#include <QImage>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QMouseEvent>
#include <QNativeGestureEvent>
#include <QPointingDevice>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQmlExpression>
#include <QQuickItem>
#include <QQuickStyle>
#include <QQuickWindow>
#include <QSGRendererInterface>
#include <QTemporaryDir>
#include <QWheelEvent>
#include <qpa/qwindowsysteminterface.h>

#include <private/qqmlengine_p.h>
#include <private/qqmlprofiler_p.h>
#include <private/qv4engine_p.h>
#include <private/qv4profiling_p.h>

#ifdef __APPLE__
#include <malloc/malloc.h>
#endif

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <exception>
#include <map>
#include <memory>
#include <numeric>
#include <string>
#include <tuple>
#include <vector>

// UI thread only. A real gadget setter proves that field writes reach C++.
class ValueWriteProbe : public QObject {
    Q_OBJECT
    Q_PROPERTY(NoteDragValue value READ value WRITE setValue NOTIFY valueChanged)
public:
    using QObject::QObject;
    NoteDragValue value() const { return m_value; }
    void setValue(const NoteDragValue& value) { m_value = value; ++setterCalls; emit valueChanged(); }
    int setterCalls = 0;
signals:
    void valueChanged();
private:
    NoteDragValue m_value;
};

namespace {

double nowMs() {
    using namespace std::chrono;
    return duration<double, std::milli>(steady_clock::now().time_since_epoch()).count();
}

std::uint64_t mallocBytesInUse() {
#ifdef __APPLE__
    malloc_statistics_t st{};
    malloc_zone_statistics(nullptr, &st);
    return static_cast<std::uint64_t>(st.size_in_use);
#else
    return 0;
#endif
}

QQuickItem* findItemByName(QQuickItem* root, const QString& name) {
    if (!root) return nullptr;
    if (root->objectName() == name) return root;
    for (QQuickItem* c : root->childItems()) {
        if (auto* f = findItemByName(c, name)) return f;
    }
    return nullptr;
}

QQuickItem* findFirstVisibleClip(QQuickItem* root) {
    if (!root) return nullptr;
    if (root->objectName().startsWith(QLatin1String("clip-")) && root->isVisible() && root->width() >= 24 && root->height() >= 10) {
        return root;
    }
    for (QQuickItem* c : root->childItems()) {
        if (auto* f = findFirstVisibleClip(c)) return f;
    }
    return nullptr;
}

int countItemsPrefix(QQuickItem* root, const QString& prefix) {
    if (!root) return 0;
    int n = root->objectName().startsWith(prefix) ? 1 : 0;
    for (QQuickItem* c : root->childItems()) n += countItemsPrefix(c, prefix);
    return n;
}

QJsonObject statsOf(std::vector<double> v) {
    if (v.empty()) return {};
    std::sort(v.begin(), v.end());
    double sum = std::accumulate(v.begin(), v.end(), 0.0);
    auto pct = [&](double p) {
        size_t idx = static_cast<size_t>(std::min<double>(v.size() - 1, std::floor(p * (v.size() - 1))));
        return v[idx];
    };
    return {
        {QStringLiteral("count"), static_cast<int>(v.size())},
        {QStringLiteral("mean"), sum / v.size()},
        {QStringLiteral("p50"), pct(0.50)},
        {QStringLiteral("p95"), pct(0.95)},
        {QStringLiteral("max"), v.back()},
        {QStringLiteral("totalMs"), sum},
    };
}

struct SiteStats {
    QString kind;      // "Binding", "HandlingSignal", "Creating", "JavaScript"
    QString file;
    int line = 0;
    int column = 0;
    QString detail;
    qint64 count = 0;
    qint64 totalNs = 0;
    qint64 selfNs = 0;
    qint64 maxNs = 0;
    qint64 allocBytes = 0;
};

struct Interval {
    qint64 start = 0;
    qint64 end = 0;
    std::string key;
};

// UI-thread-only adapter. Registration exposes only const noexcept callbacks.
class PerfObserver final : public TimelineModel::MeasurementObserver {
public:
    std::function<void(const char*, bool)> onPhase;
    std::function<void(const char*, const QJsonValue&)> onCrossing;
    void phase(const char* name, bool begin) const noexcept override { // NOLINT(bugprone-exception-escape): harness callbacks are noexcept, allocation failure terminates the run.
        if (onPhase) { onPhase(name, begin); }
    }
    void crossing(const char* name, const QJsonValue& value) const noexcept override { // NOLINT(bugprone-exception-escape): harness callbacks are noexcept, allocation failure terminates the run.
        if (onCrossing) { onCrossing(name, value); }
    }
};

// Run without constructing the editor or showing any window.
int measurementChecks() {
    TimelineModel model;
    bool evaluated = false;
    model.crossing("disabled", [&] { evaluated = true; return QJsonValue{}; });
    if (evaluated) { return 20; }
    auto observer = std::make_shared<PerfObserver>();
    int enters = 0, exits = 0;
    bool refused = false;
    observer->onPhase = [&](const char*, bool begin) noexcept {
        if (begin) { ++enters; refused = !model.clearMeasurementObserver(); }
        else { ++exits; }
    };
    model.setMeasurementObserver(observer);
    { const TimelineModel::Measurement scope(model, "test"); }
    if (!refused || enters != 1 || exits != 1) { return 21; }
    model.setReadOnly(true);
    enters = exits = 0;
    model.commitEdit("noop", {}, {});
    model.applyEdit("noop", {}, {});
    if (enters || exits) { return 22; }
    model.clearMeasurementObserver();
    observer->onPhase = [&](const char*, bool begin) noexcept { begin ? ++enters : ++exits; };
    auto dying = std::make_unique<TimelineModel>();
    dying->setMeasurementObserver(observer);
    { const TimelineModel::Measurement scope(*dying, "delete"); dying.reset(); }
    if (enters != 1 || exits != 1) { return 23; }

    QQuickItem root, outside;
    QQuickItem existing(&outside);
    ObjectCreations creations;
    creations.delegateNames.insert("delegate");
    creations.observe(root);
    creations.observe(outside);
    existing.setParentItem(&root);
    if (creations.objects) { return 24; }
    {
        QQuickItem transient;
        transient.setObjectName("delegate");
        transient.setParentItem(&root);
    }
    if (creations.delegates != 1) { return 25; }
    QQmlEngine engine;
    QQmlComponent menu(&engine);
    menu.setData("import QtQuick.Controls.Basic; MenuItem {}", QUrl());
    std::unique_ptr<QObject> item(menu.create());
    auto* quick = qobject_cast<QQuickItem*>(item.get());
    if (!quick) { return 26; }
    quick->setParentItem(&root);
    item.reset();
    if (creations.menus != 1) { return 27; }
    auto stale = std::make_unique<QObject>();
    QChildEvent staleEvent(QEvent::ChildAdded, stale.get());
    stale.reset();
    QCoreApplication::sendEvent(&root, &staleEvent);
    const auto before = creations.objects;
    std::vector<std::unique_ptr<QQuickItem>> children;
    children.reserve(5000);
    for (int i = 0; i < 5000; ++i) {
        auto child = std::make_unique<QQuickItem>();
        child->setParentItem(&root);
        children.push_back(std::move(child));
    }
    if (creations.objects - before != 5000) { return 28; }
    qmlRegisterType<ValueWriteProbe>("VC1", 1, 0, "ValueWriteProbe");
    QQmlComponent probe(&engine);
    probe.setData("import VC1; ValueWriteProbe {}", QUrl());
    std::unique_ptr<QObject> probeObject(probe.create());
    if (!probeObject) { return 29; }
    ValueWriteBacks writeBacks;
    writeBacks.observe(*probeObject);
    QQmlExpression fieldWrite(qmlContext(probeObject.get()), probeObject.get(), "value.pitch = 3");
    fieldWrite.evaluate();
    const bool invoked = !fieldWrite.hasError();
    if (!invoked || writeBacks.writes != 1
        || qobject_cast<ValueWriteProbe*>(probeObject.get())->value().pitch != 3
        || qobject_cast<ValueWriteProbe*>(probeObject.get())->setterCalls != 1) { return 30; }
    QQmlComponent repeatedLane(&engine);
    repeatedLane.setData(R"(import QtQuick
import NodeTool.Timeline
Item {
    Repeater {
        model: 1
        delegate: Item {
            objectName: "legacyLane"
            property alias clipModel: rows
            LaneClipModel { id: rows }
        }
    }
})", QUrl());
    std::unique_ptr<QObject> repeatedRoot(repeatedLane.create());
    auto* repeatedItem = qobject_cast<QQuickItem*>(repeatedRoot.get());
    auto* lane = findItemByName(repeatedItem, QStringLiteral("legacyLane"));
    auto* laneModel = lane ? lane->property("clipModel").value<LaneClipModel*>() : nullptr;
    if (!laneModel) { return 31; }
    const bool discovered = repeatedRoot->findChildren<LaneClipModel*>().contains(laneModel);
    std::printf("declarative lane model discovered by QObject traversal: %d\n", discovered);
    if (discovered) { return 32; }
    laneModel->setParent(repeatedRoot.get());
    if (!repeatedRoot->findChildren<LaneClipModel*>().contains(laneModel)) { return 33; }
    std::printf("measurement checks passed\n");
    return 0;
}

}  // namespace

int main(int argc, char* argv[]) try {
    qputenv("QT_QPA_PLATFORM", "offscreen");
    const bool gpu = qEnvironmentVariableIntValue("NT_TIMELINE_PERF_GPU") == 1;
    if (!gpu) {
        qputenv("QT_QUICK_BACKEND", "software");
        QQuickWindow::setGraphicsApi(QSGRendererInterface::Software);
    } else {
        qunsetenv("QT_QUICK_BACKEND");
        if (qEnvironmentVariableIsEmpty("QSG_RHI_BACKEND")) {
#ifdef Q_OS_MACOS
            QQuickWindow::setGraphicsApi(QSGRendererInterface::Metal);
#elif defined(Q_OS_WIN)
            QQuickWindow::setGraphicsApi(QSGRendererInterface::Direct3D11);
#endif
        }
    }
    qputenv("QSG_RENDER_LOOP", "basic");
    QTemporaryDir preferences;
    qputenv("NODETOOL_TIMELINE_PREFERENCES", QFile::encodeName(preferences.filePath("Timeline.ini")));
    QQuickStyle::setStyle(QStringLiteral("Basic"));

    QGuiApplication app(argc, argv);
    auto touchpadDevice = std::make_unique<QPointingDevice>(QStringLiteral("perf touchpad"), 4244,
        QInputDevice::DeviceType::TouchPad, QPointingDevice::PointerType::Finger,
        QPointingDevice::Capability::Position, 2, 0);
    // QPA borrows the device, which outlives the window and unregisters on destruction.
    QWindowSystemInterface::registerInputDevice(touchpadDevice.get());
    app.setOrganizationName(QStringLiteral("NodeToolF6Measure"));
    app.setApplicationName(QStringLiteral("NodeToolTimelineF6"));

    QCommandLineParser parser;
    parser.addOption({QStringLiteral("scenario"), QStringLiteral("playback|scroll|zoom|clip_drag|note_drag|model_change|note_patch"), QStringLiteral("name"), QStringLiteral("playback")});
    parser.addOption({QStringLiteral("frames"), QStringLiteral("Measured frames"), QStringLiteral("n"), QStringLiteral("90")});
    parser.addOption({QStringLiteral("warmup"), QStringLiteral("Warmup frames"), QStringLiteral("n"), QStringLiteral("15")});
    parser.addOption({QStringLiteral("width"), QStringLiteral("Viewport width"), QStringLiteral("px"), QStringLiteral("1920")});
    parser.addOption({QStringLiteral("height"), QStringLiteral("Viewport height"), QStringLiteral("px"), QStringLiteral("1080")});
    parser.addOption({QStringLiteral("selfcheck"), QStringLiteral("Test observer lifetimes and counting boundaries")});
    parser.addOption({QStringLiteral("agent"), QStringLiteral("Use registered assistant edits")});
    parser.addOption({QStringLiteral("profile"), QStringLiteral("Enable in-process QQmlProfiler + QV4::Profiler")});
    parser.addOption({QStringLiteral("prof-out"), QStringLiteral("Write detailed profiler JSON to path"), QStringLiteral("path")});
    parser.process(app);
    if (parser.isSet(QStringLiteral("selfcheck"))) { return measurementChecks(); }

    const QString scenario = parser.value(QStringLiteral("scenario"));
    const int frames = parser.value(QStringLiteral("frames")).toInt();
    const int warmup = parser.value(QStringLiteral("warmup")).toInt();
    const bool enableProfile = parser.isSet(QStringLiteral("profile"));
    const QString profOutPath = parser.value(QStringLiteral("prof-out"));
    const QSize viewSize(parser.value(QStringLiteral("width")).toInt(), parser.value(QStringLiteral("height")).toInt());

    StressStats stress;
    const auto parsed = nt::parseTimeline(buildStressDocument(stress));
    if (!parsed.timeline || stress.tracks != 64 || stress.clips != 2000 || stress.midiNotes != 20000 || stress.markers != 500) { return 2; }

    TimelineModel model;
    model.setTimeline(*parsed.timeline);

    std::int64_t virtualNowNs = 1'000'000'000LL;
    PlaybackClock clock;
    clock.setNowSource([&]() { return virtualNowNs; });
    clock.setDurationMs(model.contentEndMs());
    clock.setFps(30.0);

    QTemporaryDir tempCacheDir;
    nt::server::AssetCacheRoot cacheRoot(tempCacheDir.path());

    std::unique_ptr<QQuickRenderControl> renderControl;
    if (gpu) { renderControl = std::make_unique<QQuickRenderControl>(); }
    QQuickWindow window(renderControl.get());
    std::unique_ptr<OffscreenRhi> rhiTarget;
    if (gpu) { rhiTarget = std::make_unique<OffscreenRhi>(*renderControl, window); }
    window.resize(viewSize);
#ifdef Q_OS_LINUX
    if (gpu) { nt::hw::prepareWindow(&window); }
#endif

    QQmlEngine engine;
    nt::server::TimelineAssetCacheContext::install(engine, cacheRoot);

    // Optional in-process QML & V4 profilers (only attached in --profile pass)
    QElapsedTimer profTimer;
    profTimer.start();
    QQmlProfiler* qmlProf = nullptr;
    QV4::Profiling::Profiler* v4Prof = nullptr;

    std::map<std::string, SiteStats> siteMap;
    std::vector<Interval> v4Intervals;
    qint64 v4HeapPageBytes = 0;
    qint64 v4LargeItemBytes = 0;
    qint64 v4RegularItemBytes = 0;
    qint64 v4AllocEvents = 0;
    QList<QV4::Profiling::MemoryAllocationProperties> memAllocsCaptured;
    QObject profilerContext;

    if (enableProfile) {
        auto* enginePriv = QQmlEnginePrivate::get(&engine);
        auto profiler = std::make_unique<QQmlProfiler>();
        qmlProf = profiler.get();
        qmlProf->setTimer(profTimer);
        // QQmlEnginePrivate owns this pointer and deletes it. QObject parenting
        // would delete it twice during engine teardown.
        enginePriv->profiler = profiler.release();

        auto* v4Engine = engine.handle();
        auto jsProfiler = std::make_unique<QV4::Profiling::Profiler>(v4Engine);
        v4Prof = jsProfiler.get();
        v4Prof->setTimer(profTimer);
        v4Engine->setProfiler(jsProfiler.release()); // V4 owns it through QScopedPointer.

        QObject::connect(qmlProf, &QQmlProfiler::dataReady, &profilerContext,
                         [&](const QList<QQmlProfilerData>& data, const QQmlProfiler::LocationHash& locations) {
                             // Stack per RangeType: (startTime, locationId, childNs)
                             struct Frame { qint64 start; quintptr locId; qint64 childNs; };
                             std::map<int, std::vector<Frame>> stacks;
                             for (const auto& d : data) {
                                 const int rtype = static_cast<int>(d.detailType);
                                 auto& st = stacks[rtype];
                                 const auto messages = static_cast<quint32>(d.messageType);
                                 if (messages & (1U << QQmlProfilerDefinitions::RangeStart)) {
                                     st.push_back({d.time, d.locationId, 0});
                                 } else if (messages & (1U << QQmlProfilerDefinitions::RangeEnd)) {
                                     if (st.empty()) continue;
                                     const Frame fr = st.back();
                                     st.pop_back();
                                     const qint64 dur = std::max<qint64>(0, d.time - fr.start);
                                     const qint64 self = std::max<qint64>(0, dur - fr.childNs);
                                     if (!st.empty()) st.back().childNs += dur;

                                     const auto loc = locations.value(fr.locId);
                                     QString kind = QStringLiteral("Other");
                                     if (d.detailType == QQmlProfilerDefinitions::Binding) kind = QStringLiteral("Binding");
                                     else if (d.detailType == QQmlProfilerDefinitions::HandlingSignal) kind = QStringLiteral("HandlingSignal");
                                     else if (d.detailType == QQmlProfilerDefinitions::Creating) kind = QStringLiteral("Creating");

                                     QString file = loc.url.isEmpty() ? loc.location.sourceFile : loc.url.toString();
                                     if (file.isEmpty()) file = loc.location.sourceFile;
                                     const int line = loc.location.line;
                                     const int col = loc.location.column;
                                     QString detail = (d.detailType == QQmlProfilerDefinitions::Creating) ? loc.location.sourceFile : QString();

                                     const std::string key = (kind + "|" + file + ":" + QString::number(line) + ":" + QString::number(col)).toStdString();
                                     auto& s = siteMap[key];
                                     if (s.count == 0) {
                                         s.kind = kind;
                                         s.file = file;
                                         s.line = line;
                                         s.column = col;
                                         s.detail = detail;
                                     }
                                     s.count += 1;
                                     s.totalNs += dur;
                                     s.selfNs += self;
                                     if (dur > s.maxNs) s.maxNs = dur;
                                     v4Intervals.push_back({fr.start, d.time, key});
                                 }
                             }
                         });

        QObject::connect(v4Prof, &QV4::Profiling::Profiler::dataReady, &profilerContext,
                         [&](const QV4::Profiling::FunctionLocationHash& locs,
                             const QList<QV4::Profiling::FunctionCallProperties>& calls,
                             const QList<QV4::Profiling::MemoryAllocationProperties>& mems) {
                             for (const auto& c : calls) {
                                 const qint64 dur = std::max<qint64>(0, c.end - c.start);
                                 const auto loc = locs.value(c.id);
                                 const std::string key = ("JavaScript|" + loc.file + ":" + QString::number(loc.line) + ":" + QString::number(loc.column) + "|" + loc.name).toStdString();
                                 auto& s = siteMap[key];
                                 if (s.count == 0) {
                                     s.kind = QStringLiteral("JavaScript");
                                     s.file = loc.file;
                                     s.line = loc.line;
                                     s.column = loc.column;
                                     s.detail = loc.name;
                                 }
                                 s.count += 1;
                                 s.totalNs += dur;
                                 s.selfNs += dur;
                                 if (dur > s.maxNs) s.maxNs = dur;
                                 v4Intervals.push_back({c.start, c.end, key});
                             }
                             for (const auto& m : mems) {
                                 if (m.size > 0) {
                                     v4AllocEvents += 1;
                                     if (m.type == QV4::Profiling::HeapPage) v4HeapPageBytes += m.size;
                                     else if (m.type == QV4::Profiling::LargeItem) v4LargeItemBytes += m.size;
                                     else v4RegularItemBytes += m.size;
                                     memAllocsCaptured.append(m);
                                 }
                             }
                         });
    }

    QQmlComponent component(&engine);
    component.loadFromModule("NodeTool.Timeline", "TimelineEditor");
    std::unique_ptr<QObject> rootObj(component.createWithInitialProperties({
        {QStringLiteral("timeline"), QVariant::fromValue(&model)},
        {QStringLiteral("clock"), QVariant::fromValue(&clock)},
    }));
    auto* root = qobject_cast<QQuickItem*>(rootObj.get());
    if (!root) {
        std::fprintf(stderr, "error: TimelineEditor failed: %s\n", qPrintable(component.errorString()));
        return 2;
    }
    root->setParentItem(window.contentItem());
    root->setSize(QSizeF(viewSize));
    if (gpu) {
        if (!rhiTarget->initialize(viewSize)) {
            std::fprintf(stderr, "error: no real offscreen RHI backend available\n");
            // Profilers were attached during component creation. Flush their
            // references while the QML component is still alive.
            if (enableProfile) {
                qmlProf->stopProfiling(); v4Prof->stopProfiling();
                qmlProf->reportData(); v4Prof->reportData();
            }
            return 6;
        }
    } else { window.show(); } // Offscreen QPA only.

    auto renderScene = [&]() {
        if (gpu) { rhiTarget->render(); }
        else { (void)window.grabWindow(); }
    };
    auto renderFrame = [&]() {
        QCoreApplication::processEvents();
        renderScene();
    };

    auto* dockStore = root->findChild<DockLayoutStore*>(QStringLiteral("dockLayoutStore"));
    if (!dockStore) { return 2; }
    dockStore->dispatch({{"type", "reveal"}, {"panelId", "markers"}});
    dockStore->dispatch({{"type", "reveal"}, {"panelId", "effectControls"}});
    if (scenario == "model_change") {
        dockStore->dispatch({{"type", "reveal"}, {"panelId", "inspector"}});
        dockStore->dispatch({{"type", "reveal"}, {"panelId", "mixer"}});
    }
    if (scenario == "note_drag" || scenario == "model_change" || scenario == "note_patch") {
        dockStore->dispatch({{"type", "reveal"}, {"panelId", "pianoRoll"}});
    }

    for (int i = 0; i < 8; ++i) {
        renderFrame();
        QCoreApplication::processEvents();
    }

    auto* area = root->findChild<TimelineGestureArea*>(QStringLiteral("timelineGestureArea"));
    auto* view = root->findChild<TimelineViewState*>(QStringLiteral("timelineViewState"));
    auto* gestures = root->findChild<ClipGestureController*>(QStringLiteral("clipGestures"));
    auto* markerLane = findItemByName(root, QStringLiteral("markerLane"));
    auto* pianoRoll = findItemByName(root, QStringLiteral("pianoRollPanel"));

    if (markerLane) QMetaObject::invokeMethod(markerLane, "attach");
    if (pianoRoll) {
        pianoRoll->setProperty("clipId", QStringLiteral("clip-midi-hero"));
        QMetaObject::invokeMethod(pianoRoll, "attach");
    }
    for (int i = 0; i < 6; ++i) {
        renderFrame();
        QCoreApplication::processEvents();
    }

    if (!area || !view || !gestures) {
        std::fprintf(stderr, "error: missing core timeline items\n");
        return 2;
    }

    const int clipItemCount = countItemsPrefix(root, QStringLiteral("clip-"));
    const int markerFlagCount = countItemsPrefix(root, QStringLiteral("timelineMarker"));
    const int markerBlockCount = countItemsPrefix(root, QStringLiteral("markerBlock"));
    const bool markerLaneShown = markerLane ? markerLane->property("shown").toBool() : false;
    const int pianoRollNotesCount = pianoRoll ? pianoRoll->property("notes").toList().size() : 0;

    view->zoomTo(15.0, 0.0);
    view->setScrollLeftPx(0);
    view->setScrollTopPx(0);
    gestures->setSelection({(scenario == "model_change" || scenario == "note_patch") ? QStringLiteral("clip-midi-hero") : QStringLiteral("clip-v-0-0")});
    for (int i = 0; i < warmup; ++i) renderFrame();
    if (!gpu && window.grabWindow().isNull()) { return 6; }

    auto sendMouse = [&](QPointF scenePos, Qt::MouseButtons buttons, Qt::MouseButton button, QEvent::Type type) {
        QMouseEvent ev(type, scenePos, scenePos, button, buttons, Qt::NoModifier);
        QCoreApplication::sendEvent(&window, &ev);
    };
    auto sendWheel = [&](QPointF scenePos, QPoint pixelDelta, Qt::KeyboardModifiers mods) {
        QWheelEvent ev(scenePos, scenePos, pixelDelta, QPoint(), Qt::NoButton, mods, Qt::NoScrollPhase, false);
        QCoreApplication::sendEvent(&window, &ev);
    };
    auto sendPinch = [&](QPointF scenePos, double value) {
        QNativeGestureEvent ev(Qt::ZoomNativeGesture, touchpadDevice.get(), 2, scenePos, scenePos, scenePos, value, {}, 0);
        QCoreApplication::sendEvent(&window, &ev);
    };

    const QPointF lanesCenter = area->mapToScene(QPointF(area->lanesLeft() + 400, area->rowsTop() + 80));

    QPointF dragStart;
    bool dragActive = false;
    QQuickItem* pianoGrid = pianoRoll ? findItemByName(pianoRoll, QStringLiteral("pianoRollGrid")) : nullptr;

    if (scenario == QLatin1String("playback")) {
        clock.seek(0.0);
        clock.play();
    } else if (scenario == QLatin1String("clip_drag")) {
        if (auto* clipItem = findFirstVisibleClip(root)) {
            dragStart = clipItem->mapToScene(QPointF(clipItem->width() * 0.5, clipItem->height() * 0.5));
            sendMouse(dragStart, Qt::LeftButton, Qt::LeftButton, QEvent::MouseButtonPress);
            renderFrame();
            dragActive = true;
        } else {
            std::fprintf(stderr, "error: no visible clip found for clip_drag\n");
            return 2;
        }
    } else if (scenario == QLatin1String("note_drag")) {
        if (!pianoRoll || !pianoGrid || pianoRollNotesCount == 0) {
            std::fprintf(stderr, "error: pianoRoll not ready for note_drag\n");
            return 2;
        }
        pianoRoll->setProperty("pxPerTick", 0.15);
        pianoRoll->setProperty("scrollTick", 0.0);
        pianoRoll->setProperty("topPitch", 51);
        pianoRoll->setProperty("snapOn", false);
        renderFrame();

        const double pxPerTick = pianoRoll->property("pxPerTick").toDouble();
        const double scrollTick = pianoRoll->property("scrollTick").toDouble();
        const double rowHeight = pianoRoll->property("rowHeight").toDouble();
        const int topPitch = pianoRoll->property("topPitch").toInt();
        const double localX = (90.0 - scrollTick) * pxPerTick;
        const double localY = (topPitch - 48 + 0.5) * rowHeight;
        dragStart = pianoGrid->mapToScene(QPointF(localX, localY));

        QVariantList sel;
        for (int i = 0; i < 25; ++i) sel.append(QStringLiteral("clip-midi-hero-n%1").arg(i));
        pianoRoll->setProperty("selectedIds", sel);
        renderFrame();

        if (!pianoRoll->isVisible() || pianoGrid->height() < localY || pianoGrid->width() < localX) { return 2; }
        sendMouse(dragStart, Qt::LeftButton, Qt::LeftButton, QEvent::MouseButtonPress);
        renderFrame();
        dragActive = true;
    }

    QJsonObject copyMetrics;

    // basic render loop keeps these callbacks on the GUI thread. These are
    // CPU scene-graph phases, not GPU execution timings.
    std::atomic<double> renderBegin{0}, renderCpuMs{0}, syncBegin{0}, syncMs{0};
    QObject renderContext;
    QObject::connect(&window, &QQuickWindow::beforeRendering, &renderContext, [&] { renderBegin = nowMs(); }, Qt::DirectConnection);
    QObject::connect(&window, &QQuickWindow::afterRendering, &renderContext, [&] { renderCpuMs += nowMs() - renderBegin.load(); }, Qt::DirectConnection);
    QObject::connect(&window, &QQuickWindow::beforeSynchronizing, &renderContext, [&] { syncBegin = nowMs(); }, Qt::DirectConnection);
    QObject::connect(&window, &QQuickWindow::afterSynchronizing, &renderContext, [&] { syncMs += nowMs() - syncBegin.load(); }, Qt::DirectConnection);
    std::vector<double> frameMs, inputMs, polishMs;
    frameMs.reserve(frames);
    inputMs.reserve(frames);
    polishMs.reserve(frames);

    const std::uint64_t memBefore = mallocBytesInUse();

    // Start in-process profiling right before measured loop!
    if (enableProfile) {
        qmlProf->startProfiling((1ULL << QQmlProfilerDefinitions::ProfileBinding)
                                | (1ULL << QQmlProfilerDefinitions::ProfileHandlingSignal)
                                | (1ULL << QQmlProfilerDefinitions::ProfileCreating));
        if (scenario != "model_change") {
            v4Prof->startProfiling((1ULL << QV4::Profiling::FeatureFunctionCall)
                                   | (1ULL << QV4::Profiling::FeatureMemoryAllocation));
        }
    }

    ValueWriteBacks valueWriteBacks;
    valueWriteBacks.observe(*root);
    valueWriteBacks.observe(model);
    QJsonObject phases, crossingSites;
    QJsonObject counters{{"jsonParses", 0}, {"crossings", 0}, {"payloadBytes", 0},
        {"timelineSignals", 0}, {"clipSignals", 0}, {"markerSignals", 0}, {"sourceSignals", 0}, {"dataChangedRows", 0}};
    struct PhaseFrame { QString name; double start; double children = 0; };
    std::vector<PhaseFrame> phaseStack;
    QObject counterContext;
    QHash<QString, std::pair<QJsonValue, qint64>> payloadSizes;
    struct ResetMeasurements {
        TimelineModel& model;
        explicit ResetMeasurements(TimelineModel& value) : model(value) {}
        ResetMeasurements(const ResetMeasurements&) = delete;
        ResetMeasurements& operator=(const ResetMeasurements&) = delete;
        ResetMeasurements(ResetMeasurements&&) = delete;
        ResetMeasurements& operator=(ResetMeasurements&&) = delete;
        ~ResetMeasurements() { model.clearMeasurementObserver(); }
    } resetMeasurements{model};
    // Shared with scopes that may outlive synchronous model signal delivery.
    auto observer = std::make_shared<PerfObserver>();
    observer->onPhase = [&](const char* name, bool begin) noexcept { // NOLINT(bugprone-exception-escape): allocation failure in the observer terminates the measurement.
        if (begin) {
            phaseStack.push_back({QString::fromLatin1(name), nowMs(), 0});
            if (QString::fromLatin1(name) == "parse") { counters["jsonParses"] = counters["jsonParses"].toInteger() + 1; }
        } else {
            const auto frame = phaseStack.back(); phaseStack.pop_back();
            const double elapsed = nowMs() - frame.start;
            phases[frame.name] = phases[frame.name].toDouble() + elapsed - frame.children;
            if (!phaseStack.empty()) { phaseStack.back().children += elapsed; }
        }
    };
    observer->onCrossing = [&](const char* site, const QJsonValue& value) noexcept {
        const auto key = QString::fromLatin1(site);
        auto cached = payloadSizes.find(key);
        if (cached == payloadSizes.end() || cached->first != value) {
            cached = payloadSizes.insert(key, {value, QJsonDocument(QJsonArray{value}).toJson(QJsonDocument::Compact).size() - 2});
        }
        const auto bytes = cached->second;
        counters["crossings"] = counters["crossings"].toInteger() + 1;
        counters["payloadBytes"] = counters["payloadBytes"].toInteger() + bytes;
        crossingSites[key] = crossingSites[key].toInteger() + 1;
    };
    model.setMeasurementObserver(observer);
    QObject::connect(&model, &TimelineModel::timelineChanged, &counterContext, [&] { counters["timelineSignals"] = counters["timelineSignals"].toInteger() + 1; });
    QObject::connect(&model, &TimelineModel::clipsChanged, &counterContext, [&] { counters["clipSignals"] = counters["clipSignals"].toInteger() + 1; });
    qint64 reboundClipRows = 0;
    QJsonObject dataChangedRowsByModel;
    {
        auto rowModels = root->findChildren<QAbstractItemModel*>();
        rowModels.append(model.findChildren<QAbstractItemModel*>());
        for (auto* rows : rowModels) {
            QObject::connect(rows, &QAbstractItemModel::dataChanged, &counterContext,
                [&, clipRows = qobject_cast<LaneClipModel*>(rows)](const QModelIndex& first, const QModelIndex& last, const QList<int>& roles) {
                    // A7 rebinds pooled presentation slots. Keep these visible
                    // separately from the A4 budget for rows changed by edits.
                    if (clipRows && roles.contains(LaneClipModel::ClipIdRole)) {
                        reboundClipRows += last.row() - first.row() + 1;
                        return;
                    }
                    const auto count = last.row() - first.row() + 1;
                    const auto modelName = QString::fromLatin1(first.model()->metaObject()->className());
                    dataChangedRowsByModel[modelName] = dataChangedRowsByModel[modelName].toInteger() + count;
                    // Preserve the original gate's coverage. Repeater-owned
                    // lanes were outside the QObject traversal (see selfcheck).
                    // Pooled lanes now have an explicit QObject parent, so
                    // report their newly observable edit rows separately.
                    if (!clipRows) {
                        counters["dataChangedRows"] = counters["dataChangedRows"].toInteger() + count;
                    }
                });
        }
    }
    QObject::connect(&model, &TimelineModel::markersChanged, &counterContext, [&] { counters["markerSignals"] = counters["markerSignals"].toInteger() + 1; });
    QObject::connect(&model, &TimelineModel::sourceChanged, &counterContext, [&] { counters["sourceSignals"] = counters["sourceSignals"].toInteger() + 1; });
    const auto beforeDocument = model.documentJson();
    const auto beforeSnapshot = model.snapshot();

    if (gpu && (window.rendererInterface()->graphicsApi() == QSGRendererInterface::Software
        || window.rendererInterface()->graphicsApi() == QSGRendererInterface::Unknown)) { return 6; }
    nt::aiassist::AssistantCommands assistant(model, clock);
    assistant.setEditor(root);
    const auto agentCommand = [&](const QString& name, const QVariantMap& params = QVariantMap{}) {
        const auto result = assistant.execute("ui_timeline_run_command", {{"timeline_id", QString::fromStdString(model.timeline().id)},
            {"command", name}, {"params", params}});
        return result.value("ok").toBool();
    };
    auto move = [&](const QString& id, double startMs) {
        if (parser.isSet("agent")) { return agentCommand("move_clip", {{"clipId", id}, {"startMs", startMs}}); }
        return model.moveClip(id, startMs);
    };
    const auto patchNotes = [&](const QString& name, const QJsonObject& payload) {
        if (!parser.isSet("agent")) { return model.applyEdit(name, payload) != 0; }
        auto params = payload;
        params.remove("clipId");
        params.insert("clip_id", "clip-midi-hero");
        const auto result = assistant.execute("ui_timeline_run_command", {{"timeline_id", QString::fromStdString(model.timeline().id)},
            {"command", name}, {"params", params.toVariantMap()}});
        return !result.contains("error");
    };
    ObjectCreations creations;
    {
        for (const auto& clip : model.timeline().clips) {
            creations.delegateNames.insert(QStringLiteral("clip-") + QString::fromStdString(clip.id));
        }
        creations.observe(*root);
        creations.observe(model);
        creations.observe(window);
        creations.observe(engine);
    }
    auto* noteLayer = pianoRoll ? qobject_cast<NoteLayerItem*>(findItemByName(pianoRoll, "pianoRollNoteLayer")) : nullptr;
    if (scenario == "note_drag" && !noteLayer) { return 10; }
    const int noteBuildsBefore = noteLayer ? noteLayer->contentBuildCount() : 0;
    int workloadError = 0;
    QJsonArray operations;
    const double clockStartMs = clock.time();
    int zoomInFrames = 0;
    int zoomOutFrames = 0;
    const double tWall0 = nowMs();

    for (int fIdx = 0; fIdx < frames; ++fIdx) {
        const auto priorPhases = phases;
        const double f0 = nowMs();
        const double priorClockMs = clock.time();
        const double priorScale = view->msPerPx();
        if (scenario == "note_patch") {
            QString name;
            QJsonObject payload{{"clipId", "clip-midi-hero"}};
            const QString noteId = "clip-midi-hero-n0";
            switch (fIdx % 5) {
            case 0: name = "midi.moveNotes"; payload.insert("notes", QJsonArray{QJsonObject{{"id", noteId}, {"startTick", 120 + fIdx * 10}, {"pitch", 60 + fIdx % 12}}}); break;
            case 1: name = "midi.resizeNotes"; payload.insert("notes", QJsonArray{QJsonObject{{"id", noteId}, {"durationTick", 120 + fIdx}}}); break;
            case 2: name = "midi.setNoteVelocities"; payload.insert("notes", QJsonArray{QJsonObject{{"id", noteId}, {"velocity", 32 + fIdx}}}); break;
            case 3: name = "midi.addNotes"; payload.insert("notes", QJsonArray{QJsonObject{{"id", "perf-added"}, {"pitch", 64}, {"startTick", 240}, {"durationTick", 120}, {"velocity", 90}}}); break;
            case 4: name = "midi.removeNotes"; payload.insert("noteIds", QJsonArray{"perf-added"}); break;
            default: workloadError = 3; break;
            }
            if (!patchNotes(name, payload)) { workloadError = 3; }
        } else if (scenario == QLatin1String("model_change")) {
            switch (fIdx % 5) {
            case 0: if (!move(QStringLiteral("clip-v-0-0"), 100.0 + fIdx * 50.0)) { workloadError = 3; } break;
            case 1: {
                if (parser.isSet("agent")) {
                    if (!agentCommand("markers.add", {{"timeMs", 500.0 + fIdx * 250.0}, {"label", QStringLiteral("Live %1").arg(fIdx)}})) { workloadError = 3; }
                    if (fIdx > 10) {
                        const auto markers = model.timeline().raw.value("markers").toArray();
                        const auto id = markers.last().toObject().value("id").toString();
                        if (!agentCommand("markers.remove", {{"marker_ids", QVariantList{id}}})) { workloadError = 3; }
                    }
                    break;
                }
                const auto id = model.addMarker(500.0 + fIdx * 250.0, QStringLiteral("Live %1").arg(fIdx));
                if (!id.isEmpty() && fIdx > 10) { model.deleteMarker(id); }
                break;
            }
            case 2:
                if (parser.isSet("agent")) {
                    if (!agentCommand("setTrackName", {{"track_id", "track-v-0"}, {"name", QStringLiteral("Video Renamed %1").arg(fIdx)}})) { workloadError = 3; }
                    break;
                }
                if (!model.applyEdit(QStringLiteral("setTrackName"), {{"trackId", "track-v-0"}, {"name", QStringLiteral("Video Renamed %1").arg(fIdx)}})) { workloadError = 3; }
                break;
            case 3: if (!move(QStringLiteral("clip-midi-hero"), 50.0 + fIdx * 20.0)) { workloadError = 3; } break;
            case 4:
                if (parser.isSet("agent")) { if (!agentCommand("undo")) { workloadError = 3; } }
                else { model.undoStack()->undo(); }
                break;
            default: workloadError = 3; break;
            }
        } else if (scenario == QLatin1String("playback")) {
            virtualNowNs += 16'666'667LL;  // 60 Hz frame step
            clock.tick();
        } else if (scenario == QLatin1String("scroll")) {
            const QPoint delta = fIdx < 60 ? QPoint(0, -56) : QPoint(-110, 0);
            sendWheel(lanesCenter, delta, Qt::NoModifier);
            sendWheel(lanesCenter, delta, Qt::NoModifier);
        } else if (scenario == QLatin1String("zoom")) {
            const double dz = fIdx < frames / 2 ? 0.03 : -0.03;
            sendPinch(lanesCenter, dz);
        } else if (scenario == QLatin1String("clip_drag")) {
            const double dx = 6.0 + (fIdx * 3.0);
            const double dy = (fIdx % 20 < 10) ? 0.0 : 48.0;
            sendMouse(dragStart + QPointF(dx, dy), Qt::LeftButton, Qt::NoButton, QEvent::MouseMove);
        } else if (scenario == QLatin1String("note_drag")) {
            const double dx = 8.0 + (fIdx * 2.5);
            const double dy = ((fIdx % 16) - 8) * 1.5;
            sendMouse(dragStart + QPointF(dx, dy), Qt::LeftButton, Qt::NoButton, QEvent::MouseMove);
        }
        const double actionEnd = nowMs();
        QCoreApplication::processEvents();
        const double f1 = nowMs();
        renderScene();
        const double f2 = nowMs();
        if (scenario == "playback" && clock.time() <= priorClockMs) {
            std::fprintf(stderr, "error: playback clock did not advance at frame %d\n", fIdx);
            return 11;
        }
        if (scenario == "zoom") {
            const bool zoomIn = fIdx < frames / 2;
            const bool changedScale = zoomIn ? view->msPerPx() < priorScale : view->msPerPx() > priorScale;
            if (changedScale) {
                if (zoomIn) { ++zoomInFrames; } else { ++zoomOutFrames; }
            }
        }

        inputMs.push_back(f1 - f0);
        polishMs.push_back(f2 - f1);
        creations.classify();
        frameMs.push_back(f2 - f0);
        if (scenario == "model_change" || scenario == "note_patch") {
            QJsonObject delta;
            for (auto it = phases.begin(); it != phases.end(); ++it) {
                delta[it.key()] = it.value().toDouble() - priorPhases[it.key()].toDouble();
            }
            operations.append(QJsonObject{{"operation", fIdx % 5}, {"wallMs", f2 - f0},
                {"actionMs", actionEnd - f0}, {"deferredEventsMs", f1 - actionEnd},
                {"captureMs", f2 - f1}, {"phasesMs", delta}});
        }
    }

    const int liveNoteCount = pianoRoll && scenario == "note_drag" ? pianoRoll->property("notes").toList().size() : 0;
    if (scenario == "note_drag") {
        const auto* controller = pianoRoll ? pianoRoll->findChild<PianoRollController*>() : nullptr;
        if (!controller || !controller->noteDragActive() || model.snapshot() != beforeSnapshot) { return 9; }
    }
    if (scenario == "note_drag") {
        counters["noteLayerRebuildsDuringDrag"] = noteLayer->contentBuildCount() - noteBuildsBefore;
    }
    double releaseMs = 0;
    if (dragActive) {
        const double releaseStart = nowMs();
        sendMouse(dragStart + QPointF(80, 0), Qt::NoButton, Qt::LeftButton, QEvent::MouseButtonRelease);
        renderFrame();
        releaseMs = nowMs() - releaseStart;
    }
    if (scenario == "zoom" && (zoomInFrames == 0 || zoomOutFrames == 0)) {
        std::fprintf(stderr, "error: zoom scale must change in both directions\n");
        return 12;
    }
    if (scenario == QLatin1String("playback")) clock.pause();

    if (gpu) { rhiTarget->finish(); }
    const double tWall1 = nowMs();
    model.clearMeasurementObserver();
    const bool changed = model.documentJson() != beforeDocument;

    if (enableProfile) {
        qmlProf->stopProfiling();
        v4Prof->stopProfiling();
        qmlProf->reportData();
        v4Prof->reportData();
        // Attribute V4 allocations to innermost enclosing interval via binary search on sorted intervals.
        std::sort(v4Intervals.begin(), v4Intervals.end(), [](const Interval& a, const Interval& b) {
            return a.start < b.start || (a.start == b.start && (a.end - a.start) > (b.end - b.start));
        });
        for (const auto& m : memAllocsCaptured) {
            // Find narrowest interval containing m.timestamp (upper_bound on start, scan back a small window)
            auto it = std::upper_bound(v4Intervals.begin(), v4Intervals.end(), m.timestamp,
                                       [](qint64 ts, const Interval& iv) { return ts < iv.start; });
            const Interval* best = nullptr;
            int scanned = 0;
            while (it != v4Intervals.begin() && scanned < 64) {
                --it;
                ++scanned;
                if (it->start <= m.timestamp && m.timestamp <= it->end) {
                    if (!best || (it->end - it->start) < (best->end - best->start)) {
                        best = &(*it);
                    }
                }
            }
            if (best) {
                siteMap[best->key].allocBytes += m.size;
            }
        }
    }

    const std::uint64_t memAfter = mallocBytesInUse();

    const int liveNotesDuringDrag = liveNoteCount;

    QJsonObject out{
        {"stress", QJsonObject{{"tracks", stress.tracks}, {"clips", stress.clips}, {"notes", stress.midiNotes}, {"markers", stress.markers}}},
        {"gpu", gpu}, {"releaseMs", releaseMs}, {"operations", operations},
        {"renderCpuMs", renderCpuMs.load()}, {"syncMs", syncMs.load()},
        {"guiAndReadbackMs", tWall1 - tWall0 - renderCpuMs.load() - syncMs.load()}, {"phasesExclusiveMs", phases}, {"counters", counters}, {"crossingSites", crossingSites},
        {QStringLiteral("scenario"), scenario},
        {QStringLiteral("motion"), QJsonObject{{"clockAdvanceMs", clock.time() - clockStartMs},
            {"zoomInFrames", zoomInFrames}, {"zoomOutFrames", zoomOutFrames}}},
        {QStringLiteral("reboundClipRows"), reboundClipRows},
        {QStringLiteral("dataChangedRowsByModel"), dataChangedRowsByModel},
        {QStringLiteral("profiled"), enableProfile},
        {QStringLiteral("frames"), frames},
        {QStringLiteral("wallTotalMs"), tWall1 - tWall0},
        {QStringLiteral("fpsAchieved"), frames / std::max(0.001, (tWall1 - tWall0) / 1000.0)},
        {QStringLiteral("frameMs"), statsOf(frameMs)},
        {QStringLiteral("guiActionEventsMs"), statsOf(inputMs)},
        {QStringLiteral("renderSyncReadbackMs"), statsOf(polishMs)},
        {QStringLiteral("mallocInUseBefore"), static_cast<qint64>(memBefore)},
        {QStringLiteral("mallocInUseAfter"), static_cast<qint64>(memAfter)},
        {QStringLiteral("scene"), QJsonObject{
            {QStringLiteral("tracks"), static_cast<int>(model.timeline().tracks.size())},
            {QStringLiteral("clips"), static_cast<int>(model.timeline().clips.size())},
            {QStringLiteral("markers"), model.markersJson().size()},
            {QStringLiteral("clipItemsInstantiated"), clipItemCount},
            {QStringLiteral("markerFlagsInstantiated"), markerFlagCount},
            {QStringLiteral("markerBlocksInstantiated"), markerBlockCount},
            {QStringLiteral("markerLaneShown"), markerLaneShown},
            {QStringLiteral("pianoRollNotesCount"), pianoRollNotesCount},
            {QStringLiteral("liveNotesDuringDrag"), liveNotesDuringDrag},
            {QStringLiteral("clipLiveUpdates"), gestures->liveUpdates()},
            {QStringLiteral("clipWindowUpdates"), view->clipWindowUpdates()},
        }},
        {QStringLiteral("copyMetrics"), copyMetrics},
    };

    if (enableProfile) {
        std::vector<SiteStats> list;
        list.reserve(siteMap.size());
        qint64 totalBindingCount = 0, totalBindingNs = 0;
        qint64 totalJsCount = 0, totalJsNs = 0;
        qint64 totalSignalCount = 0, totalSignalNs = 0;
        qint64 totalCreateCount = 0, totalCreateNs = 0;
        qint64 menuCreationRanges = 0;
        for (const auto& [k, v] : siteMap) {
            list.push_back(v);
            if (v.kind == "Creating" && (v.detail == "MenuItem" || v.detail.endsWith("/MenuItem"))) { menuCreationRanges += v.count; }
            if (v.kind == QLatin1String("Binding")) { totalBindingCount += v.count; totalBindingNs += v.totalNs; }
            else if (v.kind == QLatin1String("JavaScript")) { totalJsCount += v.count; totalJsNs += v.totalNs; }
            else if (v.kind == QLatin1String("HandlingSignal")) { totalSignalCount += v.count; totalSignalNs += v.totalNs; }
            else if (v.kind == QLatin1String("Creating")) { totalCreateCount += v.count; totalCreateNs += v.totalNs; }
        }
        std::sort(list.begin(), list.end(), [](const SiteStats& a, const SiteStats& b) {
            return a.totalNs > b.totalNs;
        });

        QJsonArray sitesArr;
        for (size_t i = 0; i < std::min<size_t>(list.size(), 80); ++i) {
            const auto& s = list[i];
            sitesArr.append(QJsonObject{
                {QStringLiteral("kind"), s.kind},
                {QStringLiteral("file"), s.file},
                {QStringLiteral("line"), s.line},
                {QStringLiteral("column"), s.column},
                {QStringLiteral("detail"), s.detail},
                {QStringLiteral("count"), s.count},
                {QStringLiteral("totalMs"), s.totalNs / 1e6},
                {QStringLiteral("selfMs"), s.selfNs / 1e6},
                {QStringLiteral("meanUs"), (s.totalNs / double(std::max<qint64>(1, s.count))) / 1e3},
                {QStringLiteral("maxMs"), s.maxNs / 1e6},
                {QStringLiteral("allocBytes"), s.allocBytes},
            });
        }
        creations.classify();
        counters["objectCreations"] = creations.objects;
        counters["delegateCreations"] = creations.delegates;
        counters["menuItemCreations"] = creations.menus;
        counters["menuCreationRanges"] = menuCreationRanges;
        counters["valueTypeWriteBacks"] = valueWriteBacks.writes;
        out["counters"] = counters;
        QJsonObject profJson{
            {QStringLiteral("uniqueSites"), static_cast<int>(siteMap.size())},
            {QStringLiteral("bindingCount"), totalBindingCount},
            {QStringLiteral("bindingTotalMs"), totalBindingNs / 1e6},
            {QStringLiteral("jsCount"), totalJsCount},
            {QStringLiteral("jsTotalMs"), totalJsNs / 1e6},
            {QStringLiteral("signalCount"), totalSignalCount},
            {QStringLiteral("signalTotalMs"), totalSignalNs / 1e6},
            {QStringLiteral("createCount"), totalCreateCount},
            {QStringLiteral("createTotalMs"), totalCreateNs / 1e6},
            {QStringLiteral("v4AllocEvents"), v4AllocEvents},
            {QStringLiteral("v4HeapPageBytes"), v4HeapPageBytes},
            {QStringLiteral("v4LargeItemBytes"), v4LargeItemBytes},
            {QStringLiteral("v4RegularItemBytes"), v4RegularItemBytes},
            {QStringLiteral("v4TotalAllocBytes"), v4HeapPageBytes + v4LargeItemBytes + v4RegularItemBytes},
            {QStringLiteral("sites"), sitesArr},
        };
        if (!profOutPath.isEmpty()) {
            QFile pf(profOutPath);
            if (pf.open(QIODevice::WriteOnly)) {
                pf.write(QJsonDocument(QJsonObject{{QStringLiteral("meta"), out}, {QStringLiteral("profile"), profJson}}).toJson(QJsonDocument::Indented));
            }
        }
        out.insert(QStringLiteral("profileSummary"), QJsonObject{
            {QStringLiteral("uniqueSites"), static_cast<int>(siteMap.size())},
            {QStringLiteral("bindingCount"), totalBindingCount},
            {QStringLiteral("bindingTotalMs"), totalBindingNs / 1e6},
            {QStringLiteral("jsCount"), totalJsCount},
            {QStringLiteral("jsTotalMs"), totalJsNs / 1e6},
            {QStringLiteral("signalCount"), totalSignalCount},
            {QStringLiteral("signalTotalMs"), totalSignalNs / 1e6},
            {QStringLiteral("v4TotalAllocBytes"), v4HeapPageBytes + v4LargeItemBytes + v4RegularItemBytes},
        });
    }

    creations.classify();
    counters["objectCreations"] = creations.objects;
    counters["delegateCreations"] = creations.delegates;
    counters["menuItemCreations"] = creations.menus;
    // Profiler-only creation ranges are diagnostic, outside the work gate.
    counters.remove("menuCreationRanges");
    counters["valueTypeWriteBacks"] = valueWriteBacks.writes;
    out["counters"] = counters;
    if (!profOutPath.isEmpty() && !enableProfile) {
        QFile output(profOutPath);
        if (!output.open(QIODevice::WriteOnly)) { return 5; }
        output.write(QJsonDocument(out).toJson());
    }
    std::printf("PERF_RESULT=%s\n", QJsonDocument(out).toJson(QJsonDocument::Compact).constData());
    std::fflush(stdout);
    QObject::disconnect(&model, nullptr, &counterContext, nullptr);
    QObject::disconnect(&window, nullptr, &renderContext, nullptr);
    if (qmlProf) { QObject::disconnect(qmlProf, nullptr, &profilerContext, nullptr); }
    if (v4Prof) { QObject::disconnect(v4Prof, nullptr, &profilerContext, nullptr); }
    if (scenario == "scroll" && (creations.objects == 0 || creations.delegates == 0)) { return 7; }
    if (scenario == "note_drag" && (liveNoteCount != 2000 || model.findClip(QStringLiteral("clip-midi-hero"))->raw.value("notes") == parsed.timeline->findClip("clip-midi-hero")->raw.value("notes"))) { return 8; }
    if (workloadError) { return workloadError; }
    return ((scenario == "clip_drag" || scenario == "note_drag" || (scenario == "model_change" || scenario == "note_patch")) && !changed) ? 4 : 0;
} catch (const std::exception& error) {
    std::fprintf(stderr, "measurement failed: %s\n", error.what());
    return 2;
}

#include "tst_timeline_perf.moc"
