// Export Frame and Frame Hold driven through the mounted editor with real pointer and key events.
#include "wiring/WiringFixture.h"
#include "app/MenuRegistry.h"
#include "edit/Keymap.h"
#include "edit/sourceEdit/SourceViewerState.h"
#include "export/FrameExporter.h"
#include "server/ServerSource.h"
#include <QFileInfo>
#include <QQmlEngine>
#include <QJsonArray>
#include <QProcess>
#include <QProcessEnvironment>
#include <QSet>
#include <QScopeGuard>
#include <QTemporaryDir>
#include <algorithm>
#include <functional>

class TestFrameExportUi : public WiringFixture {
    Q_OBJECT
    QTemporaryDir folder;
    QString shotDir;
    // Popups hang off their item's QObject children, and their contents off the overlay's items.
    static QObject* ownedInScene(QObject* root, const QString& name, QSet<QObject*>& seen) {
        if (seen.contains(root)) { return nullptr; }
        seen.insert(root);
        if (root->objectName() == name) { return root; }
        for (auto* child : root->children()) {
            if (auto* found = ownedInScene(child, name, seen)) { return found; }
        }
        if (auto* quick = qobject_cast<QQuickItem*>(root)) {
            for (auto* child : quick->childItems()) {
                if (auto* found = ownedInScene(child, name, seen)) { return found; }
            }
        }
        return nullptr;
    }
    QObject* object(const QString& name) const {
        QSet<QObject*> seen;
        return ownedInScene(view->contentItem(), name, seen);
    }
    FrameExporter* exporter() const { return qobject_cast<FrameExporter*>(object("frameExporter")); }
    bool shown(const QString& name) const { auto* o = object(name); return o && o->property("visible").toBool(); }
    void clickObject(const QString& name) {
        auto* target = qobject_cast<QQuickItem*>(object(name));
        QVERIFY2(target, qPrintable("Missing: " + name));
        QTRY_VERIFY2(([&] {
            for (auto* owner = target->parent(); owner; owner = owner->parent()) {
                const auto opened = owner->property("opened");
                if (opened.isValid() && !opened.toBool()) { return false; }
            }
            // A visible popup can still have a pending footer layout.
            QList<QQuickItem*> ancestors;
            for (auto* ancestor = target; ancestor; ancestor = ancestor->parentItem()) {
                ancestors.prepend(ancestor);
            }
            for (auto* ancestor : ancestors) { ancestor->ensurePolished(); }
            return target->isVisible() && target->isEnabled() && target->window() == view.get()
                && target->width() > 0 && target->height() > 0
                && QRect(QPoint(), view->size()).contains(center(target));
        })(), qPrintable("Not ready for pointer input: " + name));
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(target));
        QCoreApplication::processEvents();
    }
    void typeInto(const QString& name, const QString& text) {
        auto* target = qobject_cast<QQuickItem*>(object(name));
        QVERIFY2(target, qPrintable("Missing: " + name));
        QTest::qWait(60);
        // A small desktop clips the Folder field inside the dialog's ScrollView.
        QTRY_VERIFY2(([&] {
            bool inView = true;
            for (auto* parent = target->parentItem(); parent; parent = parent->parentItem()) {
                if (!parent->property("contentY").isValid()) { continue; }
                const auto bounds = target->mapRectToItem(parent, QRectF(QPointF(), target->size()));
                const auto offset = bounds.top() < 0 ? bounds.top() : std::max(0.0, bounds.bottom() - parent->height());
                if (std::abs(offset) < 1) { continue; }
                parent->setProperty("contentY", parent->property("contentY").toDouble() + offset);
                inView = false;
            }
            return inView;
        })(), qPrintable("Field is outside the scroll viewport: " + name));
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(target));
        QTRY_VERIFY2(target->hasActiveFocus(), qPrintable("Field did not receive focus: " + name));
        QTest::keyClick(view.get(), Qt::Key_A, Qt::ControlModifier);
        for (const auto character : text) { QTest::keyClick(view.get(), character.toLatin1()); }
        QCOMPARE(target->property("text").toString(), text);
    }
    void shoot(const QString& name) {
        if (shotDir.isEmpty()) { return; }
        QTest::qWait(100);
        view->grabWindow().save(shotDir + "/" + name + ".png");
    }
    void loadVideo() {
        const auto media = QStringLiteral(NT_EXPORT_FIXTURES) + "/media/seek-360p30.mp4";
        QJsonObject video{{"id", "vid"}, {"trackId", "v"}, {"name", "Shot"}, {"mediaType", "video"}, {"sourceType", "imported"},
            {"status", "generated"}, {"startMs", 0}, {"durationMs", 4000}, {"inPointMs", 500}, {"outPointMs", 4500},
            {"width", 640}, {"height", 360}, {"mediaPath", media}, {"linkId", "L"}, {"locked", false}, {"versions", QJsonArray{}},
            {"effects", QJsonArray{QJsonObject{{"id", "grade"}, {"type", "color"}, {"enabled", true}, {"brightness", 0.12}}}}};
        QJsonObject caption{{"id", "words"}, {"trackId", "w"}, {"name", "Words"}, {"mediaType", "text"}, {"sourceType", "imported"},
            {"status", "generated"}, {"startMs", 0}, {"durationMs", 4000}, {"locked", false}, {"versions", QJsonArray{}},
            {"caption", QJsonObject{{"words", QJsonArray{QJsonObject{{"word", "Frame capture"}, {"startMs", 0}, {"endMs", 4000}}}}}}};
        QJsonObject audio{{"id", "aud"}, {"trackId", "a"}, {"name", "Shot audio"}, {"mediaType", "audio"}, {"sourceType", "imported"},
            {"status", "generated"}, {"startMs", 0}, {"durationMs", 4000}, {"inPointMs", 500}, {"outPointMs", 4500},
            {"linkId", "L"}, {"locked", false}, {"versions", QJsonArray{}}};
        QJsonObject later{{"id", "later"}, {"trackId", "v"}, {"name", "Later"}, {"mediaType", "image"}, {"sourceType", "imported"},
            {"status", "generated"}, {"startMs", 5000}, {"durationMs", 1000}, {"locked", false}, {"versions", QJsonArray{}}};
        auto raw = doc();
        raw.insert("clips", QJsonArray{video, audio, later, caption});
        auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        clock.seek(1500);
        gestures()->setSelection({});
        gestures()->viewState()->zoomTo(10, 0);
        gestures()->viewState()->setScrollLeftPx(0);
        gestures()->viewState()->flush();
    }
    double holdAt(const QString& id) const {
        return clip(id).value("timeRemap").toObject().value("keyframes").toArray().first().toObject().value("sourceMs").toDouble(-1);
    }
    QStringList clipIds() const {
        QStringList ids;
        for (const auto& value : model.clipsJson()) { ids.append(value.toObject().value("id").toString()); }
        return ids;
    }
private slots:
    void initTestCase() {
        QVERIFY(folder.isValid());
        shotDir = qEnvironmentVariable("NT_F12_SHOTS");
        open();
        QVERIFY(view);
        view->resize(1024, 656);
        QTRY_COMPARE(view->rootObject()->size(), QSizeF(view->size()));
        // Leave room for both monitor transports even on the CI desktop.
        auto* dock = qobject_cast<DockLayoutStore*>(view->rootObject()->property("dockStore").value<QObject*>());
        QVERIFY(dock);
        for (const auto* side : {"left", "right"}) { dock->resizeRegion(side, 100, view->width(), view->height()); }
        // The monitors' controls sit under the pictures, so the timeline leaves them room.
        dock->resizeRegion("bottom", 320, view->width(), view->height());
        QTRY_VERIFY(exporter());
        exporter()->captureForTest()->setExecutable(QStringLiteral(NT_EXPORT_BINARY));
    }
    void init() {
        loadVideo();
        gestures()->setKeyboardPreset("premiere");
        view->requestActivate();
        QVERIFY(QTest::qWaitForWindowActive(view.get()));
        view->rootObject()->forceActiveFocus();
    }
    void cleanup() {
        for (const auto* dialog : {"exportFrameDialog", "exportFrameReasonDialog", "frameHoldInsertDialog",
                                   "frameHoldOptionsDialog", "frameHoldReasonDialog", "generateDialog"}) {
            if (shown(dialog)) { QMetaObject::invokeMethod(object(dialog), "close"); }
        }
        QCoreApplication::processEvents();
    }
    void cleanupTestCase() { view.reset(); }

    // The acceptance check: the saved frame equals --stills with a reduced preview resolution set.
    void cameraButtonSavesTheFullResolutionFrame() {
        auto* compositor = item("previewCompositor");
        QVERIFY(compositor);
        QVERIFY(compositor->setProperty("playbackResolution", 4));
        const auto before = doc();
        clock.seek(2000);
        QTRY_VERIFY(item("exportFrameButton"));
        // macOS and Windows miss this click while Linux does not, so a failure names what the click reached.
        const auto reached = [this] {
            auto* button = item("exportFrameButton");
            const QPointF at = center(button);
            // Named visible items under the point, in paint order: the last one takes the click.
            QStringList under;
            std::function<void(QQuickItem*)> visit = [&](QQuickItem* node) {
                if (!node->isVisible()) { return; }
                if (!node->objectName().isEmpty() && node->contains(node->mapFromScene(at))) { under.append(node->objectName()); }
                auto children = node->childItems();
                std::stable_sort(children.begin(), children.end(), [](QQuickItem* a, QQuickItem* b) { return a->z() < b->z(); });
                for (auto* child : children) { visit(child); }
            };
            visit(view->contentItem());
            return QStringLiteral("button at %1,%2 %3x%4 visible %5 enabled %6 in a %7x%8 window, under the point: %9")
                .arg(button->mapToScene({0, 0}).x()).arg(button->mapToScene({0, 0}).y())
                .arg(button->width()).arg(button->height()).arg(button->isVisible()).arg(button->isEnabled())
                .arg(view->width()).arg(view->height()).arg(under.mid(std::max<qsizetype>(0, under.size() - 6)).join(" > "));
        };
        const auto target = reached();
        click("exportFrameButton");
        QTRY_VERIFY2(shown("exportFrameDialog"), qPrintable(target));
        QCOMPARE(exporter()->state(), QStringLiteral("capturing"));
        QVERIFY(shown("exportFrameNoLibrary"));
        QVERIFY(!object("exportFrameDestination")->property("value").toString().compare("file"));
        QTRY_VERIFY2_WITH_TIMEOUT(exporter()->state() == "ready", qPrintable(exporter()->state() + ": " + exporter()->error()), 60000);
        QCOMPARE(exporter()->frameSize(), QSize(640, 360));
        shoot("export-frame-dialog");
        // The time was captured when the dialog opened.
        clock.seek(3000);
        QCOMPARE(exporter()->timeMs(), 2000.0);
        QVERIFY(object("exportFrameDetail")->property("text").toString().contains("00:00:02:00"));
        typeInto("exportFrameFolder", folder.path());
        typeInto("exportFrameName", "program frame");
        clickObject("exportFrameSave");
        QTRY_COMPARE_WITH_TIMEOUT(exporter()->state(), QStringLiteral("saved"), 20000);
        const auto path = folder.filePath("program frame.png");
        QVERIFY(QFileInfo::exists(path));
        QVERIFY(object("exportFrameSavedText")->property("text").toString().contains(path));
        shoot("export-frame-saved");
        clickObject("exportFrameCancel");
        QTRY_VERIFY(!shown("exportFrameDialog"));
        QCOMPARE(doc(), before);
        QVERIFY2(compositor->property("playbackResolution").toInt() == 4, "the dialog leaves the preview alone");

        // --stills, with no window, for frame 60 of the same document.
        QTemporaryDir stills;
        const auto docPath = stills.filePath("doc.json");
        QFile file(docPath);
        QVERIFY(file.open(QIODevice::WriteOnly));
        file.write(model.documentJson());
        file.close();
        QProcess process;
        auto env = QProcessEnvironment::systemEnvironment();
        env.remove("QT_QUICK_BACKEND");
        process.setProcessEnvironment(env);
        process.start(QStringLiteral(NT_EXPORT_BINARY), {docPath, "--stills", stills.path(), "--still-frames", "60", "--decode", "sw"});
        QVERIFY(process.waitForFinished(120000));
        QVERIFY2(process.exitCode() == 0, process.readAllStandardError().constData());
        const QImage expected(stills.filePath("frame_000060.png"));
        const QImage actual(path);
        QVERIFY(!expected.isNull());
        // A picture, not a blank frame with a caption on it.
        QSet<QRgb> colors;
        const auto rgb = expected.convertToFormat(QImage::Format_RGB32);
        for (int y = 0; y < 200; y += 3) {
            for (int x = 0; x < rgb.width(); x += 3) { colors.insert(rgb.pixel(x, y)); }
        }
        QVERIFY2(colors.size() > 8, qPrintable(QString::number(colors.size()) + " colours"));
        QCOMPARE(actual.size(), QSize(640, 360));
        QCOMPARE(actual.convertToFormat(QImage::Format_RGB888), expected.convertToFormat(QImage::Format_RGB888));
    }
    void anExistingFileNeedsASecondSave() {
        click("exportFrameButton");
        QTRY_COMPARE_WITH_TIMEOUT(exporter()->state(), QStringLiteral("ready"), 60000);
        typeInto("exportFrameFolder", folder.path());
        typeInto("exportFrameName", "again");
        clickObject("exportFrameSave");
        QTRY_COMPARE_WITH_TIMEOUT(exporter()->state(), QStringLiteral("saved"), 20000);
        const auto path = folder.filePath("again.png");
        const auto first = QFileInfo(path).lastModified();
        clickObject("exportFrameCancel");
        QTRY_VERIFY(!shown("exportFrameDialog"));
        click("exportFrameButton");
        QTRY_COMPARE_WITH_TIMEOUT(exporter()->state(), QStringLiteral("ready"), 60000);
        QCOMPARE(object("exportFrameFolder")->property("text").toString(), folder.path());
        typeInto("exportFrameName", "again");
        clickObject("exportFrameSave");
        QTRY_VERIFY(shown("exportFrameReplace"));
        QCOMPARE(exporter()->state(), QStringLiteral("ready"));
        QCOMPARE(object("exportFrameSave")->property("text").toString(), QStringLiteral("Replace"));
        shoot("export-frame-replace");
        QTest::qWait(1100);
        clickObject("exportFrameSave");
        QTRY_COMPARE_WITH_TIMEOUT(exporter()->state(), QStringLiteral("saved"), 20000);
        QVERIFY(QFileInfo(path).lastModified() > first);
    }
    void theMenusListTheCommands() {
        QStringList clipMenu, fileMenu;
        for (const auto& entry : nt::app::shellMenuEntries("Clip")) { clipMenu.append(entry.action); }
        for (const auto& entry : nt::app::shellMenuEntries("File")) { fileMenu.append(entry.action); }
        for (const auto* action : {"frameHoldOptions", "frameHoldAdd", "frameHoldInsert"}) { QVERIFY2(clipMenu.contains(action), action); }
        QVERIFY(fileMenu.contains("exportFrame"));
    }
    void keysOpenTheDialogAndAppendMoved() {
        QVERIFY(nt::edit::resolveTimelineAction({"e", "KeyE", true, false, true, false}, "premiere") == "exportFrame");
        QVERIFY(nt::edit::resolveTimelineAction({"e", "KeyE", true, false, false, true}, "premiere") == "sourceAppend");
        gestures()->setKeyboardPreset("premiere");
        QTest::keyClick(view.get(), Qt::Key_E, Qt::ControlModifier | Qt::ShiftModifier);
        QTRY_VERIFY(shown("exportFrameDialog"));
        QTest::keyClick(view.get(), Qt::Key_Escape);
        QTRY_VERIFY(!shown("exportFrameDialog"));
        gestures()->setKeyboardPreset("fcp");
        QTest::keyClick(view.get(), Qt::Key_E, Qt::ControlModifier | Qt::AltModifier);
        QTRY_VERIFY(shown("exportFrameDialog"));
    }
    void sourceButtonCapturesTheSourceAndTheKeyFollowsFocus_data() {
        QTest::addColumn<double>("uiScale");
        QTest::newRow("default") << 1.0;
        QTest::newRow("larger-controls") << 1.25;
    }
    void sourceButtonCapturesTheSourceAndTheKeyFollowsFocus() {
        QFETCH(double, uiScale);
        QTemporaryDir sourceFolder(folder.filePath("source-XXXXXX"));
        QVERIFY(sourceFolder.isValid());
        auto* theme = qmlEngine(gestures())->singletonInstance<QObject*>("NodeTool.UiPrimitives", "Theme");
        QVERIFY(theme);
        const auto previousScale = theme->property("uiScale");
        const auto restoreScale = qScopeGuard([&] { theme->setProperty("uiScale", previousScale); });
        theme->setProperty("uiScale", uiScale);
        auto* state = qmlEngine(gestures())->singletonInstance<SourceViewerState*>("NodeTool.Timeline", "SourceViewerState");
        QVERIFY(state);
        const QVariantMap asset{{"id", "source-asset"}, {"name", "Take seven.mp4"}, {"content_type", "video/mp4"},
            {"duration", 8}, {"width", 640}, {"height", 360}};
        auto* dock = qobject_cast<DockLayoutStore*>(view->rootObject()->property("dockStore").value<QObject*>());
        QVERIFY(dock);
        dock->resizeRegion("bottom", 280, view->width(), view->height());
        state->setMediaBrowser(nullptr);
        state->setAsset(asset);
        state->monitor()->openLocal(asset, QStringLiteral(NT_EXPORT_FIXTURES) + "/media/seek-360p30.mp4", {});
        QTRY_VERIFY_WITH_TIMEOUT(state->monitor()->ready() && !state->monitor()->busy(), 15000);
        QVERIFY(state->monitor()->hasVideo());
        state->monitor()->seek(1000);
        const auto before = doc();
        QTRY_VERIFY(item("sourceExportFrame") && item("sourceExportFrame")->isVisible());
        auto* button = item("sourceExportFrame");
        QTRY_VERIFY2(button->isEnabled(), "Source export button is disabled");
        // The Source panel scrolls once its minimum picture and controls exceed the dock.
        QTRY_VERIFY2(([&] {
            bool inView = true;
            for (auto* ancestor = button->parentItem(); ancestor; ancestor = ancestor->parentItem()) {
                if (!ancestor->property("contentY").isValid()) { continue; }
                const auto bounds = button->mapRectToItem(ancestor, QRectF(QPointF(), button->size()));
                const auto offset = bounds.top() < 0 ? bounds.top() : std::max(0.0, bounds.bottom() - ancestor->height());
                if (std::abs(offset) < 1) { continue; }
                ancestor->setProperty("contentY", ancestor->property("contentY").toDouble() + offset);
                inView = false;
            }
            return inView;
        })(), "Source export button could not be scrolled into view");
        const auto reachability = [&]() -> QString {
            const auto point = center(button);
            if (!QRect(QPoint(), view->size()).contains(point)) {
                return QStringLiteral("Source export centre outside window: %1,%2").arg(point.x()).arg(point.y());
            }
            for (auto* ancestor = button->parentItem(); ancestor; ancestor = ancestor->parentItem()) {
                if (ancestor->clip() && !ancestor->contains(ancestor->mapFromScene(point))) {
                    return QStringLiteral("Source export centre clipped by %1 (%2), size %3x%4")
                        .arg(ancestor->objectName(), ancestor->metaObject()->className())
                        .arg(ancestor->width()).arg(ancestor->height());
                }
            }
            return {};
        };
        QTRY_VERIFY2(reachability().isEmpty(), qPrintable(reachability()));
        shoot("source-transport");
        {
            const auto point = center(button);
            QTest::mousePress(view.get(), Qt::LeftButton, Qt::NoModifier, point);
            const auto release = qScopeGuard([&] { QTest::mouseRelease(view.get(), Qt::LeftButton, Qt::NoModifier, point); });
            // Check Qt's actual event target before the release activates the button.
            QVERIFY2(button->property("pressed").toBool(), "Source export centre did not hit the button or its contents");
        }
        QCoreApplication::processEvents();
        QTRY_VERIFY(shown("exportFrameDialog"));
        QCOMPARE(object("exportFramePanel")->property("target").toString(), QStringLiteral("source"));
        QTRY_VERIFY2_WITH_TIMEOUT(exporter()->state() == "ready", qPrintable(exporter()->error()), 60000);
        QCOMPARE(exporter()->timeMs(), 1000.0);
        QCOMPARE(object("exportFrameName")->property("text").toString(), QStringLiteral("Take seven 00-00-01-00"));
        QVERIFY(object("exportFrameDetail")->property("text").toString().startsWith("Source at 00:00:01:00"));
        shoot("export-frame-source");
        typeInto("exportFrameFolder", sourceFolder.path());
        clickObject("exportFrameSave");
        QTRY_COMPARE_WITH_TIMEOUT(exporter()->state(), QStringLiteral("saved"), 20000);
        const QImage saved(sourceFolder.filePath("Take seven 00-00-01-00.png"));
        QCOMPARE(saved.size(), QSize(640, 360));
        QCOMPARE(doc(), before);
        clickObject("exportFrameCancel");
        QTRY_VERIFY(!shown("exportFrameDialog"));

        // The key follows keyboard focus: a press in Source, then the key.
        gestures()->setKeyboardPreset("premiere");
        auto* viewer = qobject_cast<QQuickItem*>(object("sourceViewer"));
        QVERIFY(viewer);
        viewer->forceActiveFocus();
        QTRY_VERIFY(viewer->property("sourceFocused").toBool());
        QTest::keyClick(view.get(), Qt::Key_E, Qt::ControlModifier | Qt::ShiftModifier);
        QTRY_VERIFY(shown("exportFrameDialog"));
        QCOMPARE(object("exportFramePanel")->property("target").toString(), QStringLiteral("source"));
        QTest::keyClick(view.get(), Qt::Key_Escape);
        QTRY_VERIFY(!shown("exportFrameDialog"));
        state->setAsset({});
        dock->resizeRegion("bottom", 700, view->width(), view->height());
        view->rootObject()->forceActiveFocus();
    }
    void anEmptyTimelineSaysWhy() {
        auto raw = doc();
        raw.insert("clips", QJsonArray{});
        raw.insert("durationMs", 0);
        auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        click("exportFrameButton");
        QTRY_VERIFY(shown("exportFrameReasonDialog"));
        QVERIFY(!shown("exportFrameDialog"));
        QVERIFY(object("exportFrameReason")->property("text").toString().contains("Add a clip"));
    }
    void routesIntoGeneration() {
        const QVariantMap asset{{"id", QString(32, u'a')}, {"name", "Frame.png"}, {"content_type", "image/png"},
            {"get_url", "/api/storage/x.png"}, {"width", 640}, {"height", 360}};
        click("exportFrameButton");
        QTRY_COMPARE_WITH_TIMEOUT(exporter()->state(), QStringLiteral("ready"), 60000);
        object("exportFramePanel")->setProperty("destination", "library");
        exporter()->setSavedAssetForTest(asset);
        QTRY_VERIFY(shown("exportFrameUseReference"));
        shoot("export-frame-library-saved");
        QTRY_VERIFY(object("exportFrameUseReference")->property("enabled").toBool());
        clickObject("exportFrameUseReference");
        QTRY_VERIFY(shown("generateDialog"));
        QVERIFY(!shown("exportFrameDialog"));
        QVERIFY(object("generateButton")->parent()->property("referenceIds").toStringList().contains(asset.value("id").toString()));
        shoot("generate-with-reference");
        QMetaObject::invokeMethod(object("generateDialog"), "close");
        QTRY_VERIFY(!shown("generateDialog"));
        object("generateButton")->parent()->setProperty("referenceIds", QStringList{});

        // The start frame: one undo entry, a selected image clip at the end, nothing else moved.
        click("exportFrameButton");
        QTRY_COMPARE_WITH_TIMEOUT(exporter()->state(), QStringLiteral("ready"), 60000);
        object("exportFramePanel")->setProperty("destination", "library");
        exporter()->setSavedAssetForTest(asset);
        const auto before = clipIds();
        const double end = model.contentEndMs();
        QTRY_VERIFY(object("exportFrameUseStart")->property("enabled").toBool());
        clickObject("exportFrameUseStart");
        QTRY_VERIFY(!shown("exportFrameDialog"));
        QCOMPARE(gestures()->selection().size(), 1);
        const auto still = clip(gestures()->selection().first());
        QCOMPARE(still.value("mediaType").toString(), QStringLiteral("image"));
        QCOMPARE(still.value("currentAssetId").toString(), asset.value("id").toString());
        QCOMPARE(still.value("startMs").toDouble(), end);
        QCOMPARE(clock.time(), end);
        QCOMPARE(clipIds().size(), before.size() + 1);
        QVERIFY2(shown("inspectorAiSection"), "image to video is on screen");
        QTRY_VERIFY2(item("clip-" + gestures()->selection().first()), "the new clip is scrolled into view");
        shoot("start-frame-inspector");
        view->rootObject()->forceActiveFocus();
        QTest::keyClick(view.get(), Qt::Key_Z, Qt::ControlModifier);
        QTRY_COMPARE(clipIds(), before);
    }
    void libraryThroughTheDialog() {
        if (!exporter()->libraryAvailable()) { QSKIP("Runs under frameexport-server.test.mjs."); }
        clock.seek(2000);
        click("exportFrameButton");
        QTRY_VERIFY2_WITH_TIMEOUT(exporter()->state() == "ready", qPrintable(exporter()->error()), 60000);
        QVERIFY(!shown("exportFrameNoLibrary"));
        QCOMPARE(object("exportFrameDestination")->property("value").toString(), QStringLiteral("library"));
        QVERIFY(!shown("exportFrameFolder"));
        typeInto("exportFrameName", "from the dialog");
        clickObject("exportFrameSave");
        QTRY_VERIFY2_WITH_TIMEOUT(exporter()->state() == "saved", qPrintable(exporter()->state() + ": " + exporter()->error()), 30000);
        const auto asset = exporter()->savedAsset();
        QCOMPARE(asset.value("name").toString(), QStringLiteral("from the dialog.png"));
        QVERIFY(object("exportFrameSavedText")->property("text").toString().contains("from the dialog.png"));
        // The start frame route on the real asset row: its media resolves without a paid call.
        QTRY_VERIFY(object("exportFrameUseStart")->property("enabled").toBool());
        clickObject("exportFrameUseStart");
        QTRY_VERIFY(!shown("exportFrameDialog"));
        const auto id = gestures()->selection().first();
        QCOMPARE(clip(id).value("currentAssetId").toString(), asset.value("id").toString());
        QTRY_VERIFY_WITH_TIMEOUT(std::ranges::any_of(model.timeline().clips, [&](const auto& c) {
            return QString::fromStdString(c.id) == id && !c.mediaPath.empty();
        }), 20000);
        qInfo().noquote() << "ASSET" << asset.value("id").toString();
    }
    void addFrameHoldIsOneUndoEntry() {
        gestures()->setSelection({"vid"});
        const auto before = doc();
        QVERIFY(gestures()->runAction("frameHoldAdd"));
        QCOMPARE(gestures()->selection().size(), 1);
        const auto held = gestures()->selection().first();
        QCOMPARE(holdAt(held), 2000.0);
        QCOMPARE(clip(held).value("startMs").toDouble(), 1500.0);
        // Linked audio split and keeps its source running.
        int audioPieces = 0;
        for (const auto& value : model.clipsJson()) {
            const auto c = value.toObject();
            if (c.value("mediaType") == "audio") { ++audioPieces; QVERIFY(!c.contains("timeRemap")); }
        }
        QCOMPARE(audioPieces, 2);
        view->rootObject()->forceActiveFocus();
        QTest::keyClick(view.get(), Qt::Key_Z, Qt::ControlModifier);
        QTRY_COMPARE(doc().value("clips"), before.value("clips"));
    }
    void insertSegmentDialogRipples() {
        gestures()->setSelection({"vid"});
        const auto before = doc();
        QVERIFY(gestures()->runAction("frameHoldInsert"));
        QTRY_VERIFY(shown("frameHoldInsertDialog"));
        QCOMPARE(object("frameHoldLength")->property("text").toString(), QStringLiteral("2"));
        shoot("frame-hold-insert");
        typeInto("frameHoldLength", "3");
        QTest::keyClick(view.get(), Qt::Key_Return);
        QTRY_VERIFY(!shown("frameHoldInsertDialog"));
        const auto held = gestures()->selection().first();
        QCOMPARE(clip(held).value("durationMs").toDouble(), 3000.0);
        QCOMPARE(holdAt(held), 2000.0);
        QCOMPARE(clip("later").value("startMs").toDouble(), 8000.0);
        // The linked audio has a gap under the hold.
        double audioAfter = -1;
        for (const auto& value : model.clipsJson()) {
            const auto c = value.toObject();
            if (c.value("mediaType") == "audio" && c.value("startMs").toDouble() > 0) { audioAfter = c.value("startMs").toDouble(); }
        }
        QCOMPARE(audioAfter, 4500.0);
        view->rootObject()->forceActiveFocus();
        QTest::keyClick(view.get(), Qt::Key_Z, Qt::ControlModifier);
        QTRY_COMPARE(doc().value("clips"), before.value("clips"));
    }
    void optionsDialogSetsAndClearsAHold() {
        gestures()->setSelection({"vid"});
        QVERIFY(gestures()->runAction("frameHoldOptions"));
        QTRY_VERIFY(shown("frameHoldOptionsDialog"));
        shoot("frame-hold-options");
        clickObject("frameHoldEnabled");
        QVERIFY(object("frameHoldEnabled")->property("checked").toBool());
        clickObject("frameHoldOptionsApply");
        QTRY_VERIFY(!shown("frameHoldOptionsDialog"));
        QCOMPARE(holdAt("vid"), 500.0);
        QCOMPARE(clip("vid").value("durationMs").toDouble(), 4000.0);
        // Opened again it shows the hold, and the box clears it.
        QVERIFY(gestures()->runAction("frameHoldOptions"));
        QTRY_VERIFY(shown("frameHoldOptionsDialog"));
        QVERIFY(object("frameHoldEnabled")->property("checked").toBool());
        QVERIFY(shown("frameHoldTime"));
        clickObject("frameHoldEnabled");
        clickObject("frameHoldOptionsApply");
        QTRY_VERIFY(!shown("frameHoldOptionsDialog"));
        QVERIFY(!clip("vid").contains("timeRemap"));
    }
    void applyingUnchangedOptionsLeavesTheHeldFrame() {
        // 50 ms is between two 30 fps timecodes, so a round trip through the field would move it.
        auto raw = doc();
        auto clips = raw.value("clips").toArray();
        auto held = clips[0].toObject();
        held.insert("timeRemap", QJsonObject{{"keyframes", QJsonArray{QJsonObject{{"t", 0}, {"sourceMs", 50}},
            QJsonObject{{"t", 1}, {"sourceMs", 50}}}}});
        clips[0] = held;
        raw.insert("clips", clips);
        auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        gestures()->setSelection({"vid"});
        const auto before = doc();
        QVERIFY(gestures()->runAction("frameHoldOptions"));
        QTRY_VERIFY(shown("frameHoldOptionsDialog"));
        clickObject("frameHoldOptionsApply");
        QTRY_VERIFY(!shown("frameHoldOptionsDialog"));
        QCOMPARE(doc(), before);
        QCOMPARE(holdAt("vid"), 50.0);
    }
    void aTrimmedHoldRunsPastTheMedia() {
        gestures()->setSelection({"later"});
        QVERIFY(gestures()->runAction("deleteSelected"));
        gestures()->setSelection({"vid"});
        QVERIFY(gestures()->runAction("frameHoldAdd"));
        const auto held = gestures()->selection().first();
        clock.seek(0);
        gestures()->viewState()->zoomTo(50, 0);
        gestures()->viewState()->setScrollLeftPx(0);
        gestures()->viewState()->flush();
        QTRY_VERIFY(item("clip-" + held));
        QTest::qWait(60);
        auto* target = item("clip-" + held);
        const auto end = target->mapToScene({target->width() - 2, target->height() / 2}).toPoint();
        // The drag runs well past the 10 s fixture media, which a clip in motion cannot do.
        drag(end, end + QPoint(240, 0));
        const auto trimmed = clip(held);
        QVERIFY2(trimmed.value("startMs").toDouble() + trimmed.value("durationMs").toDouble() > 13000,
            qPrintable(QString::number(trimmed.value("durationMs").toDouble())));
        QCOMPARE(holdAt(held), 2000.0);
    }
    void contextMenuAndRefusals() {
        // A curve refuses with what to do about it.
        auto raw = doc();
        auto clips = raw.value("clips").toArray();
        auto curved = clips[0].toObject();
        curved.insert("timeRemap", QJsonObject{{"keyframes", QJsonArray{QJsonObject{{"t", 0}, {"sourceMs", 0}}, QJsonObject{{"t", 1}, {"sourceMs", 3000}}}}});
        clips[0] = curved;
        raw.insert("clips", clips);
        auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        gestures()->setSelection({"vid"});
        const auto before = doc();
        QVERIFY(gestures()->runAction("frameHoldAdd"));
        QTRY_VERIFY(shown("frameHoldReasonDialog"));
        QVERIFY(object("frameHoldReason")->property("text").toString().contains("time remap"));
        QCOMPARE(doc(), before);
        clickObject("frameHoldReasonClose");
        QTRY_VERIFY(!shown("frameHoldReasonDialog"));

        // The context menu acts on the clip it opened on.
        loadVideo();
        QTRY_VERIFY(item("clip-vid"));
        QTest::mouseClick(view.get(), Qt::RightButton, Qt::NoModifier, center(item("clip-vid")));
        QTRY_VERIFY(object("registryMenu-clip-frameHoldAdd"));
        shoot("frame-hold-context-menu");
        clickObject("registryMenu-clip-frameHoldAdd");
        QTRY_COMPARE(gestures()->selection().size(), 1);
        QCOMPARE(holdAt(gestures()->selection().first()), 2000.0);

        // Playhead off the clip: the context menu does not reach for another track.
        loadVideo();
        clock.seek(4500);
        QTest::mouseClick(view.get(), Qt::RightButton, Qt::NoModifier, center(item("clip-vid")));
        QTRY_VERIFY(object("registryMenu-clip-frameHoldAdd"));
        clickObject("registryMenu-clip-frameHoldAdd");
        QTRY_VERIFY(shown("frameHoldReasonDialog"));
        QVERIFY(object("frameHoldReason")->property("text").toString().contains("Place the playhead"));
    }
};
int main(int argc, char** argv) {
    // frameexport-server.test.mjs runs libraryThroughTheDialog against a scratch server.
    const bool serverRun = argc > 1 && QByteArray(argv[1]) == "libraryThroughTheDialog";
    if (serverRun) {
        if (const int status = nt::server::takeServerArgs(argc, argv); status != 0) { return status; }
    }
    QGuiApplication app(argc, argv);
    TestFrameExportUi test;
    return serverRun ? QTest::qExec(&test, QStringList{app.arguments().first(), "libraryThroughTheDialog"}) : QTest::qExec(&test, argc, argv);
}
#include "tst_frameexportui.moc"
