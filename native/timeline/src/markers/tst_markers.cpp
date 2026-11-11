// The markers feature through the production editor: atomic edits, the key
// actions, the Edit Marker dialog opened from the ruler, the marker context menu,
// the Markers panel, the CSV export and the document audit.
#include "markers/MarkerSession.h"
#include "server/FieldAudit.h"
#include "wiring/WiringFixture.h"
#include <QQmlEngine>
#include <QTemporaryDir>

class TestMarkers : public WiringFixture {
    Q_OBJECT
    static QJsonObject marker(const QString& id, double timeMs, const QString& label, const QJsonObject& extra = {}) {
        QJsonObject m{{"id", id}, {"timeMs", timeMs}, {"label", label}};
        for (auto it = extra.begin(); it != extra.end(); ++it) { m.insert(it.key(), it.value()); }
        return m;
    }
    void seed() {
        model.replaceMarkers({marker("a", 1000, "Intro", {{"note", "Trim the first second"}, {"author", "Ana"}}),
                              marker("b", 4000, "Hands", {{"color", "#E5484D"}, {"durationMs", 1500}}),
                              marker("c", 7000, "Outro")});
        settle();
    }
    void settle() {
        QCoreApplication::processEvents();
        QTest::qWait(60);
    }
    // A popup is not an item, so it is found through the overlay panel that owns it.
    QObject* popup(const QString& name) const {
        auto* host = item("markerEditHost");
        return host ? host->findChild<QObject*>(name) : nullptr;
    }
    MarkerSession* session() const {
        return qmlEngine(view->rootObject())->singletonInstance<MarkerSession*>("NodeTool.Timeline", "MarkerSession");
    }
    QJsonObject markerById(const QString& id) const {
        for (const auto& m : model.markersJson()) {
            if (m.toObject().value("id").toString() == id) { return m.toObject(); }
        }
        return {};
    }
    QQuickItem* flag(const QString& label) const {
        QList<QQuickItem*> found;
        std::function<void(QQuickItem*)> walk = [&](QQuickItem* parent) {
            for (auto* child : parent->childItems()) {
                if (child->objectName() == "timelineMarker" && child->property("label").toString() == label) { found << child; }
                walk(child);
            }
        };
        walk(view->contentItem());
        return found.isEmpty() ? nullptr : found.first();
    }
    QPoint flagPoint(const QString& label) const {
        auto* f = flag(label);
        auto* seek = f ? f->findChild<QQuickItem*>("markerSeek") : nullptr;
        return seek ? seek->mapToScene(QPointF(seek->width() / 2, seek->height() / 2)).toPoint() : QPoint();
    }
    // NT_SHOT_DIR=<dir> saves what the tests show, for a look at the layout.
    void shot(const QString& name) {
        if (qEnvironmentVariableIsSet("NT_SHOT_DIR")) { view->grabWindow().save(qEnvironmentVariable("NT_SHOT_DIR") + "/" + name + ".png"); }
    }

private slots:
    void init() { open(); gestures()->setKeyboardPreset("nodetool"); }
    void cleanup() { view.reset(); }

    void aBulkEditIsOneUndoEntry() {
        model.replaceMarkers({marker("a", 1000, "A"), marker("b", 2000, "B"), marker("c", 3000, "C")});
        const int base = model.undoStack()->count();
        QVERIFY(model.applyEdit("markers.update", {{"ids", QJsonArray{"a", "b", "c"}}, {"patch", QJsonObject{{"color", "#3E63DD"}, {"author", "Ana"}}}}));
        QCOMPARE(model.undoStack()->count(), base + 1);
        for (const auto* id : {"a", "b", "c"}) {
            QCOMPARE(markerById(id).value("color").toString(), QString("#3E63DD"));
            QCOMPARE(markerById(id).value("author").toString(), QString("Ana"));
        }
        model.undoStack()->undo();
        QVERIFY(!markerById("a").contains("color"));
        QVERIFY(!markerById("c").contains("author"));
        model.undoStack()->redo();
        QCOMPARE(markerById("b").value("color").toString(), QString("#3E63DD"));
        // Removing three markers is one entry too.
        const int before = model.undoStack()->count();
        QVERIFY(model.applyEdit("markers.remove", {{"ids", QJsonArray{"a", "b", "c"}}}));
        QCOMPARE(model.undoStack()->count(), before + 1);
        QCOMPARE(model.markersJson().size(), 0);
        model.undoStack()->undo();
        QCOMPARE(model.markersJson().size(), 3);
    }
    void aRefusedEditLeavesNoUndoEntry() {
        model.replaceMarkers({marker("a", 1000, "A"), marker("b", 2000, "B")});
        const int base = model.undoStack()->count();
        QCOMPARE(model.applyEdit("markers.update", {{"ids", QJsonArray{"a", "b"}}, {"patch", QJsonObject{{"timeMs", 5}}}}), quint64(0));
        QCOMPARE(model.applyEdit("markers.update", {{"ids", QJsonArray{"a", "missing"}}, {"patch", QJsonObject{{"label", "x"}}}}), quint64(0));
        QCOMPARE(model.applyEdit("markers.remove", {{"ids", QJsonArray{"missing"}}}), quint64(0));
        QCOMPARE(model.undoStack()->count(), base);
    }
    void rangeMarkerKeysAddOneUndoEntryEach() {
        gestures()->setKeyboardPreset("premiere");
        clock.seek(2000);
        const int base = model.undoStack()->count();
        QVERIFY(gestures()->handleKey(Qt::Key_M, "M", Qt::AltModifier | Qt::ShiftModifier, false));
        QCOMPARE(model.markersJson().size(), 1);
        const auto range = model.markersJson().at(0).toObject();
        QCOMPARE(range.value("timeMs").toDouble(), 2000.0);
        QCOMPARE(range.value("durationMs").toDouble(), 1000.0);
        QCOMPARE(model.undoStack()->count(), base + 1);
        QCOMPARE(session()->selectedIds(), QStringList{range.value("id").toString()});
        // A held key adds no second marker.
        QVERIFY(gestures()->handleKey(Qt::Key_M, "M", Qt::AltModifier | Qt::ShiftModifier, true));
        QCOMPARE(model.markersJson().size(), 1);
        model.undoStack()->undo();
        QCOMPARE(model.markersJson().size(), 0);
    }
    void inToOutMarkerFollowsTheRange() {
        gestures()->setKeyboardPreset("premiere");
        // Without both points there is nothing to span.
        QVERIFY(!gestures()->handleKey(Qt::Key_M, "m", Qt::ControlModifier, false));
        QCOMPARE(model.markersJson().size(), 0);
        gestures()->viewState()->setRangeIn(1000);
        QVERIFY(!gestures()->handleKey(Qt::Key_M, "m", Qt::ControlModifier, false));
        gestures()->viewState()->setRangeOut(4500);
        QVERIFY(gestures()->handleKey(Qt::Key_M, "m", Qt::ControlModifier, false));
        QCOMPARE(model.markersJson().size(), 1);
        const auto m = model.markersJson().at(0).toObject();
        QCOMPARE(m.value("timeMs").toDouble(), 1000.0);
        QCOMPARE(m.value("durationMs").toDouble(), 3500.0);
    }
    void doubleClickingAFlagEditsTheMarker() {
        seed();
        auto* dialog = popup("markerEditDialog");
        QVERIFY(dialog);
        QVERIFY(!dialog->property("visible").toBool());
        QTest::mouseDClick(view.get(), Qt::LeftButton, Qt::NoModifier, flagPoint("Intro"));
        QTRY_VERIFY(dialog->property("visible").toBool());
        QCOMPARE(item("markerNameField")->property("text").toString(), QString("Intro"));
        QCOMPARE(item("markerNotesField")->property("text").toString(), QString("Trim the first second"));
        QCOMPARE(item("markerAuthorField")->property("text").toString(), QString("Ana"));
        QTRY_VERIFY(item("markerNameField")->hasActiveFocus());
        settle();
        shot("markers-dialog");
        // Typing replaces the selected name.
        for (const char letter : QByteArray("Opening")) { QTest::keyClick(view.get(), letter); }
        item("markerNotesField")->setProperty("text", "Trim the first second and add a fade");
        item("markerDurationField")->setProperty("text", "2.5");
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("markerColor_blue")));
        const int base = model.undoStack()->count();
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("markerSave")));
        QTRY_VERIFY(!dialog->property("visible").toBool());
        const auto m = markerById("a");
        QCOMPARE(m.value("label").toString(), QString("Opening"));
        QCOMPARE(m.value("note").toString(), QString("Trim the first second and add a fade"));
        QCOMPARE(m.value("durationMs").toDouble(), 2500.0);
        QCOMPARE(m.value("color").toString(), QString("#3E63DD"));
        QCOMPARE(m.value("author").toString(), QString("Ana"));
        QCOMPARE(m.value("timeMs").toDouble(), 1000.0);
        QCOMPARE(model.undoStack()->count(), base + 1);
        model.undoStack()->undo();
        QCOMPARE(markerById("a").value("label").toString(), QString("Intro"));
        QVERIFY(!markerById("a").contains("durationMs"));
    }
    void anInvalidDurationCannotBeSaved() {
        seed();
        session()->requestEdit("c");
        auto* dialog = popup("markerEditDialog");
        QTRY_VERIFY(dialog->property("visible").toBool());
        item("markerDurationField")->setProperty("text", "soon");
        QVERIFY(!item("markerSave")->property("enabled").toBool());
        item("markerDurationField")->setProperty("text", "3");
        QTRY_VERIFY(item("markerSave")->property("enabled").toBool());
        const int base = model.undoStack()->count();
        // An unchanged form saves nothing.
        item("markerDurationField")->setProperty("text", "");
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("markerSave")));
        QTRY_VERIFY(!dialog->property("visible").toBool());
        QCOMPARE(model.undoStack()->count(), base);
    }
    void theDialogDeletesTheMarkerAndClosesWhenItIsUndone() {
        seed();
        session()->requestEdit("c");
        auto* dialog = popup("markerEditDialog");
        QTRY_VERIFY(dialog->property("visible").toBool());
        settle();
        const int base = model.undoStack()->count();
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("markerEditDelete")));
        QTRY_VERIFY(!dialog->property("visible").toBool());
        QCOMPARE(markerById("c"), QJsonObject());
        QCOMPARE(model.undoStack()->count(), base + 1);
        model.undoStack()->undo();
        QCOMPARE(markerById("c").value("label").toString(), QString("Outro"));
        // Undoing the creation of an open marker closes the dialog.
        QVERIFY(model.applyEdit("markers.add", {{"id", "d"}, {"timeMs", 8000}, {"label", "New"}}));
        session()->requestEdit("d");
        QTRY_VERIFY(dialog->property("visible").toBool());
        model.undoStack()->undo();
        QTRY_VERIFY(!dialog->property("visible").toBool());
    }
    void theMarkerMenuEditsAndColoursTheMarker() {
        seed();
        const auto point = flagPoint("Outro");
        QTest::mouseClick(view.get(), Qt::RightButton, Qt::NoModifier, point);
        auto* menu = item("timeRuler")->findChild<QObject*>("registryContextMenu-marker");
        QVERIFY(menu);
        QTRY_VERIFY(menu->property("opened").toBool());
        for (const auto* action : {"editMarker", "markerColor.none", "markerColor.red", "markerColor.cyan", "clearSelectedMarkers", "clearAllMarkers"}) {
            QVERIFY2(item(QString("registryMenu-marker-") + action), action);
        }
        QCOMPARE(session()->selectedIds(), QStringList{"c"});
        settle();
        const int base = model.undoStack()->count();
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("registryMenu-marker-markerColor.red")));
        QTRY_COMPARE(markerById("c").value("color").toString(), QString("#E5484D"));
        QCOMPARE(model.undoStack()->count(), base + 1);
        // Edit marker opens the dialog on the marker the menu was opened on.
        QTest::mouseClick(view.get(), Qt::RightButton, Qt::NoModifier, point);
        QTRY_VERIFY(menu->property("opened").toBool());
        settle();
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("registryMenu-marker-editMarker")));
        QTRY_VERIFY(popup("markerEditDialog")->property("visible").toBool());
        QCOMPARE(item("markerNameField")->property("text").toString(), QString("Outro"));
    }
    void clearSelectedRemovesTheSelectionInOneEntry() {
        seed();
        session()->selectMany({"a", "c", "gone"});
        const int base = model.undoStack()->count();
        QVERIFY(gestures()->runAction("clearSelectedMarkers", {}));
        QCOMPARE(model.undoStack()->count(), base + 1);
        QCOMPARE(model.markersJson().size(), 1);
        QCOMPARE(markerById("b").value("label").toString(), QString("Hands"));
        QVERIFY(session()->selectedIds().isEmpty());
        // With nothing selected and no marker at the playhead there is nothing to clear.
        clock.seek(500);
        QVERIFY(!gestures()->runAction("clearSelectedMarkers", {}));
        model.undoStack()->undo();
        QCOMPARE(model.markersJson().size(), 3);
    }
    void colourActionsWorkOnTheSelection() {
        seed();
        session()->selectMany({"a", "b"});
        const int base = model.undoStack()->count();
        QVERIFY(gestures()->runAction("markerColor.green", {}));
        QCOMPARE(model.undoStack()->count(), base + 1);
        QCOMPARE(markerById("a").value("color").toString(), QString("#34A853"));
        QCOMPARE(markerById("b").value("color").toString(), QString("#34A853"));
        QVERIFY(!markerById("c").contains("color"));
        QVERIFY(gestures()->runAction("markerColor.none", {}));
        QVERIFY(!markerById("a").contains("color"));
    }
    void aRangeMarkerShadesItsDurationOnTheRuler() {
        seed();
        auto* ruler = item("rulerCanvas");
        QVERIFY(ruler);
        settle();
        // 10 ms per px: "Hands" starts at 400 px and its 1500 ms run is 150 px wide.
        const QImage image = view->grabWindow();
        const auto origin = ruler->mapToScene(QPointF(0, 0)).toPoint();
        const auto inside = QColor(image.pixel(origin.x() + 545, origin.y() + 6));
        const auto outside = QColor(image.pixel(origin.x() + 650, origin.y() + 6));
        // The band is the marker's colour at 22% alpha over the ruler. The ruler is dark
        // or light with the platform's colour scheme, so the check follows its colour.
        const QColor marker("#E5484D");
        const auto blended = [](int under, int over) { return under + (over - under) * 0.22; };
        const auto close = [&](int actual, int under, int over) { return qAbs(actual - blended(under, over)) < 3; };
        QVERIFY2(close(inside.red(), outside.red(), marker.red()) && close(inside.green(), outside.green(), marker.green())
                     && close(inside.blue(), outside.blue(), marker.blue()),
                 qPrintable(QString("%1 over %2").arg(inside.name(), outside.name())));
        QVERIFY(inside.red() > inside.green());
        // The point markers beside it shade nothing.
        const auto pointMarkerSpan = QColor(image.pixel(origin.x() + 270, origin.y() + 6));
        QVERIFY(qAbs(pointMarkerSpan.red() - outside.red()) < 8);
        shot("markers-ruler");
    }
    void draggingTheRangeGripResizesTheMarkerInOneEntry() {
        seed();
        settle();
        // Only the range marker has a grip.
        QList<QQuickItem*> grips;
        std::function<void(QQuickItem*)> walk = [&](QQuickItem* parent) {
            for (auto* child : parent->childItems()) {
                if (child->objectName() == "markerRangeGrip") { grips << child; }
                walk(child);
            }
        };
        walk(view->contentItem());
        QCOMPARE(grips.size(), 1);
        auto* grip = grips.first();
        const auto from = center(grip);
        const int base = model.undoStack()->count();
        QTest::mousePress(view.get(), Qt::LeftButton, Qt::NoModifier, from);
        QTest::mouseMove(view.get(), from + QPoint(20, 0), 20);
        QTest::mouseMove(view.get(), from + QPoint(50, 0), 20);
        // The model changes on release only.
        QCOMPARE(markerById("b").value("durationMs").toDouble(), 1500.0);
        QCOMPARE(model.undoStack()->count(), base);
        QVERIFY(grip->findChild<QQuickItem*>("markerRangeDraft")->isVisible());
        QTest::mouseRelease(view.get(), Qt::LeftButton, Qt::NoModifier, from + QPoint(50, 0));
        settle();
        QCOMPARE(markerById("b").value("durationMs").toDouble(), 2000.0);
        QCOMPARE(markerById("b").value("timeMs").toDouble(), 4000.0);
        QCOMPARE(model.undoStack()->count(), base + 1);
        model.undoStack()->undo();
        QCOMPARE(markerById("b").value("durationMs").toDouble(), 1500.0);
    }
    void theMarkersPanelFiltersSeeksAndDeletes() {
        seed();
        auto* dock = qobject_cast<DockLayoutStore*>(view->rootObject()->property("dockStore").value<QObject*>());
        QVERIFY(dock);
        dock->dispatch({{"type", "reveal"}, {"panelId", "markers"}});  // false when the layout already shows it
        settle();
        auto* panel = item("timelineMarkersPanel");
        QVERIFY(panel);
        QTRY_VERIFY(panel->isVisible());
        auto* rows = item("markerRows");
        QVERIFY(rows);
        QCOMPARE(rows->property("count").toInt(), 3);
        QCOMPARE(item("markerCount")->property("text").toString(), QString("3 markers"));
        shot("markers-panel");
        // Search reaches the note and the author.
        item("markerSearch")->setProperty("text", "first second");
        QTRY_COMPARE(rows->property("count").toInt(), 1);
        item("markerSearch")->setProperty("text", "ana");
        QTRY_COMPARE(rows->property("count").toInt(), 1);
        item("markerSearch")->setProperty("text", "");
        QTRY_COMPARE(rows->property("count").toInt(), 3);
        // The colour filter keeps one colour.
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("markerFilter_red")));
        QTRY_COMPARE(rows->property("count").toInt(), 1);
        QVERIFY(item("markerRow_b"));
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("markerFilter_none")));
        QTRY_COMPARE(rows->property("count").toInt(), 2);
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("markerFilter_none")));
        QTRY_COMPARE(rows->property("count").toInt(), 3);
        // A click selects and seeks.
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("markerRow_b")));
        QCOMPARE(clock.currentTimeMs(), 4000.0);
        QCOMPARE(session()->selectedIds(), QStringList{"b"});
        // Ctrl adds a row without moving the playhead, and Delete removes both in one entry.
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::ControlModifier, center(item("markerRow_c")));
        QCOMPARE(clock.currentTimeMs(), 4000.0);
        QCOMPARE(session()->selectedIds().size(), 2);
        QTRY_COMPARE(item("markerCount")->property("text").toString(), QString("2 of 3 selected"));
        const int base = model.undoStack()->count();
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("markerDeleteSelected")));
        QTRY_COMPARE(model.markersJson().size(), 1);
        QCOMPARE(model.undoStack()->count(), base + 1);
        QVERIFY(session()->selectedIds().isEmpty());
        // Double-clicking a row opens the editor.
        QTest::mouseDClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("markerRow_a")));
        QTRY_VERIFY(popup("markerEditDialog")->property("visible").toBool());
    }
    void anEmptyPanelSaysHowToStart() {
        settle();
        auto* dock = qobject_cast<DockLayoutStore*>(view->rootObject()->property("dockStore").value<QObject*>());
        dock->dispatch({{"type", "reveal"}, {"panelId", "markers"}});  // false when the layout already shows it
        settle();
        auto* rows = item("markerRows");
        QVERIFY(rows);
        QVERIFY(!rows->isVisible());
        QVERIFY(!item("markerExport")->property("enabled").toBool());
    }
    void csvExportWritesTheReviewNotes() {
        model.replaceMarkers({marker("a", 2000, "Hero, \"close-up\"", {{"note", "Line one\nLine two"}, {"author", "Ana"}, {"durationMs", 1000}, {"color", "#E5484D"}})});
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const auto path = dir.filePath("markers.csv");
        QCOMPARE(session()->saveCsv(model.markers(), model.fps(), QUrl::fromLocalFile(path)), QString());
        QFile file(path);
        QVERIFY(file.open(QIODevice::ReadOnly));
        QCOMPARE(QString::fromUtf8(file.readAll()),
                 QString("\"Time\",\"Duration\",\"Name\",\"Notes\",\"Author\",\"Colour\"\r\n"
                         "\"00:00:02:00\",\"00:00:01:00\",\"Hero, \"\"close-up\"\"\",\"Line one\nLine two\",\"Ana\",\"Red\"\r\n"));
        QVERIFY(!session()->saveCsv(model.markers(), model.fps(), QUrl("https://example.com/markers.csv")).isEmpty());
        QVERIFY(!session()->saveCsv(model.markers(), model.fps(), QUrl::fromLocalFile(dir.filePath("missing/markers.csv"))).isEmpty());
    }
    void thePremierePresetBindsTheKeysAndOthersLeaveThemFree() {
        gestures()->setKeyboardPreset("premiere");
        QCOMPARE(gestures()->shortcutFor("addMarkerInOut"), QString("Ctrl+M"));
        QVERIFY(gestures()->shortcutFor("addRangeMarker").contains("M"));
        // Ctrl+Shift+M stays Previous Marker, as in Premiere.
        QCOMPARE(gestures()->shortcutFor("prevMarker"), QString("Ctrl+Shift+M"));
        gestures()->setKeyboardPreset("nodetool");
        QVERIFY(gestures()->shortcutFor("addMarkerInOut").isEmpty());
        QVERIFY(gestures()->shortcutFor("addRangeMarker").isEmpty());
    }
    void theNewFieldsAreInTheDocumentAudit() {
        seed();
        const auto doc = QJsonDocument::fromJson(model.documentJson()).object();
        QCOMPARE(doc.value("markers").toArray().size(), 3);
        const auto audit = nt::server::auditTimelineFields(doc);
        const auto bytes = QJsonDocument(audit).toJson(QJsonDocument::Compact);
        QVERIFY2(!bytes.contains("\"unknown\""), bytes.constData());
        // The audit does flag a field the server schema does not know.
        auto bad = doc;
        auto markers = bad.value("markers").toArray();
        auto first = markers[0].toObject();
        first.insert("chapter", true);
        markers[0] = first;
        bad.insert("markers", markers);
        QVERIFY(QJsonDocument(nt::server::auditTimelineFields(bad)).toJson(QJsonDocument::Compact).contains("\"unknown\""));
    }
};
QTEST_MAIN(TestMarkers)
#include "tst_markers.moc"
