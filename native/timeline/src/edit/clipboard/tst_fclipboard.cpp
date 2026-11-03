#include "edit/clipboard/ClipboardOps.h"
#include "app/EditRegistry.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include <QGuiApplication>
#include <QJsonArray>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQmlProperty>
#include <QJSValue>
#include <QQuickItem>
#include <QQuickWindow>
#include <QSignalSpy>
#include <QtTest>
#include <memory>

class TestFClipboard : public QObject {
    Q_OBJECT
  private:
    static QQuickItem *findItem(QQuickItem *root, const QString &name) {
        if (root->objectName() == name) {
            return root;
        }
        for (auto *child : root->childItems()) {
            if (auto *found = findItem(child, name)) {
                return found;
            }
        }
        return nullptr;
    }
    static std::unique_ptr<QObject> load(QQmlEngine &engine, const QString &file, QString &error) {
        QQmlComponent component(&engine, QUrl::fromLocalFile(QStringLiteral(NT_QML_DIR) + file));
        auto object = std::unique_ptr<QObject>(component.create());
        error = component.errorString();
        return object;
    }
  private slots:
    void initTestCase() {
        qmlRegisterSingletonType(QUrl::fromLocalFile(QStringLiteral(NT_QML_DIR) + "/TimelineVisuals.qml"), "NodeTool.Timeline", 1, 0, "TimelineVisuals");
    }
    void rubberBand() {
        QQmlEngine engine;
        QString error;
        auto object = load(engine, "/Tracks/RubberBandOverlay.qml", error);
        QVERIFY2(object, qPrintable(error));
        auto *item = qobject_cast<QQuickItem *>(object.get());
        QVERIFY(item);
        QQuickWindow window;
        item->setParentItem(window.contentItem());
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        QVERIFY(!item->isVisible());
        QVERIFY(
            object->setProperty("bandRect", QVariantMap{{"left", 12}, {"top", 24}, {"width", 120}, {"height", 80}}));
        QVERIFY(item->isVisible());
        QCOMPARE(item->z(), 20);
        QCOMPARE(item->x(), 12);
        QCOMPARE(item->y(), 24);
        QCOMPARE(item->width(), 120);
        QCOMPARE(item->height(), 80);
        QCOMPARE(item->acceptedMouseButtons(), Qt::NoButton);
        const auto color = object->property("color").value<QColor>();
        QCOMPARE(color.alpha(), 0x22);
        QCOMPARE(QQmlProperty(object.get(), "border.width").read().toInt(), 1);
        object->setProperty("bandRect", QVariant());
        QVERIFY(!item->isVisible());
    }
    void groupBracket() {
        QQmlEngine engine;
        QString error;
        auto object = load(engine, "/Tracks/GroupBracket.qml", error);
        QVERIFY2(object, qPrintable(error));
        auto *item = qobject_cast<QQuickItem *>(object.get());
        QVERIFY(item);
        QQuickWindow window;
        item->setParentItem(window.contentItem());
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        object->setProperty("startMs", 1000);
        object->setProperty("durationMs", 2000);
        object->setProperty("widthPx", 200);
        QVERIFY(item->isVisible());
        QCOMPARE(item->y(), 16);
        QCOMPARE(item->height(), 8);
        QCOMPARE(item->width(), 200);
        QCOMPARE(item->opacity(), 0.7);
        object->setProperty("spanStartMs", 1500);
        object->setProperty("spanEndMs", 2500);
        QCOMPARE(item->x(), 50);
        QCOMPARE(item->width(), 100);
        object->setProperty("spanStartMs", -100);
        object->setProperty("spanEndMs", 9000);
        QCOMPARE(item->x(), 0);
        QCOMPARE(item->width(), 200);
        QCOMPARE(item->acceptedMouseButtons(), Qt::NoButton);
        object->setProperty("durationMs", 0);
        QVERIFY(!item->isVisible());
    }
    void pasteAttributesDialog() {
        QQmlEngine engine;
        QString error;
        auto object = load(engine, "/PasteAttributesDialog.qml", error);
        QVERIFY2(object, qPrintable(error));
        QQuickWindow window;
        window.resize(800, 600);
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        object->setProperty("parent", QVariant::fromValue(window.contentItem()));
        object->setProperty(
            "source", QVariantMap{{"name", "Camera"}, {"mediaType", "video"}, {"opacity", 0.3}, {"volumeDb", -4}});
        object->setProperty("targets", QVariantList{QVariantMap{{"mediaType", "audio"}}});
        QVERIFY(QMetaObject::invokeMethod(object.get(), "resetChoices"));
        QCOMPARE(object->property("title").toString(), QString("Paste attributes"));
        QCOMPARE(object->property("availableGroups").toStringList(), QStringList({"speed", "volume", "audioEffects"}));
        QCOMPARE(object->property("chosenGroups").toStringList(), QStringList({"volume"}));
        auto *from = object->findChild<QObject *>("fromCaption");
        QVERIFY(from);
        QCOMPARE(from->property("text").toString(), QString("From \"Camera\""));
        auto *paste = object->findChild<QObject *>("pasteButton");
        QVERIFY(paste);
        QCOMPARE(paste->property("text").toString(), QString("Paste"));
        auto *cancel = object->findChild<QObject *>("cancelButton");
        QVERIFY(cancel);
        QCOMPARE(cancel->property("text").toString(), QString("Cancel"));
        QMetaObject::invokeMethod(object.get(), "open");
        QSignalSpy chosen(object.get(), SIGNAL(groupsChosen(QVariant)));
        QVERIFY(chosen.isValid());
        QVERIFY(QMetaObject::invokeMethod(object.get(), "confirm"));
        QCOMPARE(chosen.count(), 1);
        QCOMPARE(chosen[0][0].toList(), QVariantList({"volume"}));
        object->setProperty("targets", QVariantList{QVariantMap{{"mediaType", "image"}}});
        QMetaObject::invokeMethod(object.get(), "resetChoices");
        QCOMPARE(object->property("availableGroups").toStringList(),
                 QStringList({"motion", "opacity", "effects", "animations"}));
        QCOMPARE(object->property("chosenGroups").toStringList(), QStringList({"opacity"}));
        QMetaObject::invokeMethod(object.get(), "toggleGroup", Q_ARG(QVariant, "opacity"));
        QVERIFY(!paste->property("enabled").toBool());
        object->setProperty("source", QVariantMap{{"name", "Still"}, {"mediaType", "image"}});
        object->setProperty("targets", QVariantList{QVariantMap{{"mediaType", "audio"}}});
        QMetaObject::invokeMethod(object.get(), "resetChoices");
        QMetaObject::invokeMethod(object.get(), "open");
        auto *empty = object->findChild<QObject *>("emptyCaption");
        QVERIFY(empty);
        QVERIFY(empty->property("visible").toBool());
        QCOMPARE(empty->property("text").toString(), QString("The copied clip has nothing these clips can take."));
    }
    void dialogShell_data() {
        QTest::addColumn<QString>("check");
        for (const auto &check : QStringList{"center", "labels", "close", "keyboard", "tokens"}) {
            QTest::newRow(qPrintable(check)) << check;
        }
    }
    void dialogShell() {
        QFETCH(QString, check);
        QQmlEngine engine;
        QString error;
        auto object = load(engine, "/PasteAttributesDialog.qml", error);
        QVERIFY2(object, qPrintable(error));
        QQuickWindow window;
        window.resize(800, 600);
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        object->setProperty("parent", QVariant::fromValue(window.contentItem()));
        object->setProperty("source", QVariantMap{{"name", "Camera"}, {"mediaType", "video"}, {"opacity", 0.3}});
        object->setProperty("targets", QVariantList{QVariantMap{{"mediaType", "video"}}});
        QMetaObject::invokeMethod(object.get(), "open");
        if (check == "center") {
            QCOMPARE(object->property("x").toDouble(), (800 - object->property("width").toDouble()) / 2);
            QCOMPARE(object->property("y").toDouble(), (600 - object->property("height").toDouble()) / 2);
            return;
        }
        if (check == "tokens") {
            auto *from = object->findChild<QObject *>("fromCaption");
            QVERIFY(from);
            QQmlComponent theme(&engine);
            theme.setData("import QtQuick\nimport NodeTool.UiPrimitives as Ui\nQtObject { property color sample: Ui.Theme.textDisabled; property int captionRole: Ui.Typography.SansCaption; property int titleRole: Ui.Typography.SansTitle }", QUrl());
            std::unique_ptr<QObject> themeValue(theme.create());
            QVERIFY2(themeValue, qPrintable(theme.errorString()));
            QCOMPARE(from->property("color").value<QColor>(), themeValue->property("sample").value<QColor>());
            auto *title = object->findChild<QObject *>("dialogTitle");
            QVERIFY(title);
            QCOMPARE(from->property("role").toInt(), themeValue->property("captionRole").toInt());
            QCOMPARE(title->property("role").toInt(), themeValue->property("titleRole").toInt());
            return;
        }
        QSignalSpy chosen(object.get(), SIGNAL(groupsChosen(QVariant)));
        if (check == "keyboard") {
            QTest::keyClick(&window, Qt::Key_Return);
            QTRY_COMPARE(chosen.count(), 1);
            return;
        }
        if (check == "close") {
            auto *close = findItem(window.contentItem(), "closeButton");
            QVERIFY(close);
            QCOMPARE(close->property("iconName").toString(), QString("close"));
            QCOMPARE(close->property("accessibleName").toString(), QString("Close"));
            QTest::mouseClick(&window, Qt::LeftButton, Qt::NoModifier,
                              close->mapToScene(QPointF(close->width() / 2, close->height() / 2)).toPoint());
            QTRY_VERIFY(!object->property("visible").toBool());
            QCOMPARE(chosen.count(), 0);
            return;
        }
        const QMap<QString, QString> labels{{"motion", "Motion (position, scale, rotation, crop, corners)"},
                                            {"opacity", "Opacity and blend mode"},
                                            {"effects", "Video effects"},
                                            {"animations", "Animations and keyframes"},
                                            {"speed", "Speed"},
                                            {"volume", "Volume"},
                                            {"audioEffects", "Audio effects"}};
        for (auto it = labels.begin(); it != labels.end(); ++it) {
            auto *checkbox = findItem(window.contentItem(), "group-" + it.key());
            QVERIFY2(checkbox, qPrintable(it.key()));
            QCOMPARE(checkbox->property("text").toString(), it.value());
        }
    }
    // Volume keys go with Volume, which an audio clip takes, and not with the animations.
    void pasteMovesVolumeKeysWithVolume() {
        const auto curve = [](const QString &property, double value) {
            return QJsonObject{{"property", property}, {"keyframes", QJsonArray{QJsonObject{{"t", 0}, {"value", value}}}}};
        };
        const auto keys = [](const auto &clip) {
            QStringList names;
            for (const auto &value : clip.value("paramCurves").toArray()) {
                names.append(value.toObject().value("property").toString());
            }
            return names;
        };
        const QJsonObject source{{"id", "s"}, {"mediaType", "audio"}, {"durationMs", 1000}, {"volumeDb", -6},
            {"paramCurves", QJsonArray{curve("volumeDb", -6)}}};
        QJsonObject target{{"id", "t"}, {"mediaType", "audio"}, {"durationMs", 500}};
        auto patch = nt::edit::clipboard::attributePatch(source, target, {"volume"});
        QCOMPARE(patch.value("volumeDb").toDouble(), -6.0);
        QCOMPARE(keys(patch), QStringList{"volumeDb"});
        // Another group leaves them alone.
        QVERIFY(nt::edit::clipboard::attributePatch(source, target, {"audioEffects"}).value("paramCurves").toArray().isEmpty());
        // Pasting a level with no keys clears the target's keys.
        auto keyed = target;
        keyed.insert("paramCurves", source.value("paramCurves"));
        const QJsonObject plain{{"id", "p"}, {"mediaType", "audio"}, {"durationMs", 1000}, {"volumeDb", -3}};
        patch = nt::edit::clipboard::attributePatch(plain, keyed, {"volume"});
        QVERIFY(patch.contains("paramCurves"));
        QVERIFY(patch.value("paramCurves").isUndefined());
        // Animations from a video clip leave the target's volume keys in place, and bring depth.
        const QJsonObject mover{{"id", "m"}, {"mediaType", "video"}, {"durationMs", 1000},
            {"paramCurves", QJsonArray{curve("depthPx", 4)}}};
        auto video = keyed;
        video.insert("mediaType", "video");
        QCOMPARE(keys(nt::edit::clipboard::attributePatch(mover, video, {"animations"})), (QStringList{"volumeDb", "depthPx"}));
    }
    // A duplicate keeps the effect ids, so the keys still name its effects.
    void duplicateKeepsEffectKeys() {
        const QJsonObject source{{"id", "s"}, {"trackId", "v"}, {"mediaType", "video"}, {"durationMs", 1000},
            {"effects", QJsonArray{QJsonObject{{"id", "a"}, {"type", "blur"}, {"enabled", true}}}},
            {"paramCurves", QJsonArray{QJsonObject{{"property", "effect:a:radius"},
                {"keyframes", QJsonArray{QJsonObject{{"t", 0}, {"value", 1}}}}}}}};
        const auto copies = nt::edit::clipboard::cloneClips({source});
        QCOMPARE(copies.size(), std::size_t(1));
        QCOMPARE(copies[0].value("effects").toArray()[0].toObject().value("id").toString(), QString("a"));
        QCOMPARE(copies[0].value("paramCurves").toArray().size(), 1);
        QCOMPARE(copies[0].value("paramCurves").toArray()[0].toObject().value("property").toString(), QString("effect:a:radius"));
    }
    // Effect keys go with the effects, by the id the pasted effect keeps.
    void pasteMovesEffectKeysWithEffects() {
        const auto curve = [](const QString &property) {
            return QJsonObject{{"property", property}, {"keyframes", QJsonArray{QJsonObject{{"t", 0}, {"value", 1}}}}};
        };
        const auto names = [](const auto &clip) {
            QStringList list;
            for (const auto &value : clip.value("paramCurves").toArray()) {
                list.append(value.toObject().value("property").toString());
            }
            return list;
        };
        const QJsonObject source{{"id", "s"}, {"mediaType", "video"}, {"durationMs", 1000},
            {"effects", QJsonArray{QJsonObject{{"id", "a"}, {"type", "blur"}, {"enabled", true}}}},
            {"paramCurves", QJsonArray{curve("effect:a:radius"), curve("depthPx")}}};
        const QJsonObject target{{"id", "t"}, {"mediaType", "video"}, {"durationMs", 500},
            {"effects", QJsonArray{QJsonObject{{"id", "b"}, {"type", "blur"}, {"enabled", true}}}},
            {"paramCurves", QJsonArray{curve("effect:b:radius"), curve("volumeDb")}}};
        // The effects replace the target's, so its effect keys go and the volume keys stay.
        auto patch = nt::edit::clipboard::attributePatch(source, target, {"effects"});
        QCOMPARE(names(patch), (QStringList{"volumeDb", "effect:a:radius"}));
        QCOMPARE(patch.value("effects").toArray()[0].toObject().value("id").toString(), QString("a"));
        // Animations alone leave the effect keys where their effects are.
        patch = nt::edit::clipboard::attributePatch(source, target, {"animations"});
        QCOMPARE(names(patch), (QStringList{"effect:b:radius", "volumeDb", "depthPx"}));
        // Both bring all of the source's picture keys.
        patch = nt::edit::clipboard::attributePatch(source, target, {"effects", "animations"});
        QCOMPARE(names(patch), (QStringList{"volumeDb", "effect:a:radius", "depthPx"}));
        // An audio clip takes neither, so nothing changes.
        QJsonObject sound = target;
        sound.insert("mediaType", "audio");
        QVERIFY(!nt::edit::clipboard::attributePatch(source, sound, {"effects"}).contains("effects"));
        QCOMPARE(names(nt::edit::clipboard::attributePatch(source, sound, {"effects"})), names(sound));
    }
    void dialogSmallWindow() {
        QQmlEngine engine;
        QString error;
        auto object = load(engine, "/PasteAttributesDialog.qml", error);
        QVERIFY2(object, qPrintable(error));
        QQuickWindow window;
        window.resize(400, 240);
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        object->setProperty("parent", QVariant::fromValue(window.contentItem()));
        object->setProperty("source", QVariantMap{{"mediaType", "video"}, {"opacity", 0.3}});
        object->setProperty("targets", QVariantList{QVariantMap{{"mediaType", "video"}}});
        QMetaObject::invokeMethod(object.get(), "open");
        auto *motion = findItem(window.contentItem(), "group-motion");
        QVERIFY(motion);
        QVERIFY(motion->width() <= object->property("width").toDouble() - object->property("leftPadding").toDouble() -
                                       object->property("rightPadding").toDouble());
        QVERIFY(object->property("height").toDouble() <= 240 - 64);
        auto *scroll = findItem(window.contentItem(), "attributeScroll");
        QVERIFY(scroll);
        QTRY_VERIFY2(scroll->height() < scroll->property("contentHeight").toDouble(),
                     qPrintable(QString("scroll height %1, content %2, dialog height %3")
                                    .arg(scroll->height())
                                    .arg(scroll->property("contentHeight").toDouble())
                                    .arg(object->property("height").toDouble())));
        auto *opacity = findItem(window.contentItem(), "group-opacity");
        QVERIFY(opacity);
        QVERIFY(opacity->property("checked").toBool());
        QCOMPARE(opacity->property("accessibleName").toString(), QString("Opacity and blend mode"));
    }
    void undo_data() {
        QTest::addColumn<QString>("action");
        for (const auto &action :
             QStringList{"cut", "paste", "pasteInsert", "duplicateSelected", "duplicateWithGap", "altDragCopy",
                         "pasteClipAttributes", "groupClips", "ungroupClips", "closeGapAt", "moveClip",
                         "moveSelectedClips", "trimClipStart", "trimClipEnd", "deleteSelected"}) {
            QTest::newRow(qPrintable(action)) << action;
        }
    }
    void undo() {
        QFETCH(QString, action);
        auto parsed = nt::parseTimelineJson(
            R"({"name":"F","width":640,"height":360,"fps":30,"durationMs":10000,"tracks":[{"id":"v","type":"video","index":0}],"clips":[{"id":"g","name":"Group","mediaType":"group","trackId":"v","startMs":500,"durationMs":2000},{"id":"c","name":"Child","mediaType":"video","trackId":"v","parentId":"g","startMs":500,"durationMs":1000,"inPointMs":500},{"id":"tail","name":"Tail","mediaType":"video","trackId":"v","startMs":4000,"durationMs":500}]})");
        QVERIFY(parsed.timeline);
        TimelineModel model;
        model.setTimeline(std::move(*parsed.timeline));
        const auto before = model.documentJson();
        if (action == "paste" || action == "pasteInsert") {
            const auto copy = nt::app::findEdit("copy");
            QVERIFY2(copy, "unknown edit copy");
            copy(model.timeline().raw, {{"selectedIds", QJsonArray{"c"}}});
        }
        QJsonObject payload{{"clipId", "g"},
                            {"selectedIds", QJsonArray{"g"}},
                            {"deltaMs", -100},
                            {"atMs", 3000},
                            {"trackId", "v"},
                            {"timeMs", 3000},
                            {"groups", QJsonArray{"opacity"}},
                            {"source", QJsonObject{{"id", "source"}, {"opacity", 0.3}}}};
        if (action == "groupClips") {
            payload.insert("selectedIds", QJsonArray{"c", "tail"});
        }
        QVERIFY2(model.applyEdit(action, payload), qPrintable("refused " + action));
        QCOMPARE(model.undoStack()->count(), 1);
        const auto after = model.documentJson();
        model.undoStack()->undo();
        QCOMPARE(model.documentJson(), before);
        model.undoStack()->redo();
        QCOMPARE(model.documentJson(), after);
    }
};
QTEST_MAIN(TestFClipboard)
#include "tst_fclipboard.moc"
