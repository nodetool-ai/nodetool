#include "entities/EntityLibrary.h"
#include "../../tests/TestHttpServer.h"
#include "server/ServerSource.h"
#include <QBuffer>
#include <QDir>
#include <QGuiApplication>
#include <QImage>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QLinearGradient>
#include <QPainter>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickWindow>
#include <QTemporaryDir>
#include <QUrlQuery>
#include <QtTest>
#include <functional>
#include <utility>
#include <memory>

namespace {
QByteArray answer(const QJsonValue& value) {
    return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", value}}}}).toJson();
}
QByteArray failure(const QString& code) {
    return QJsonDocument(QJsonObject{{"error", QJsonObject{{"message", "test failure"},
        {"data", QJsonObject{{"code", code}}}}}}).toJson();
}
QString id(int number) { return QStringLiteral("%1").arg(number, 32, 16, QLatin1Char('0')); }

// A distinct gradient per image so thumbnails are recognizable in screenshots.
QByteArray picture(int seed) {
    QImage image(320, 320, QImage::Format_RGB32);
    QPainter painter(&image);
    QLinearGradient gradient(0, 0, 320, 320);
    gradient.setColorAt(0, QColor::fromHsv((seed * 47) % 360, 160, 230));
    gradient.setColorAt(1, QColor::fromHsv((seed * 47 + 70) % 360, 200, 90));
    painter.fillRect(image.rect(), gradient);
    painter.setPen(Qt::NoPen);
    painter.setBrush(QColor(255, 255, 255, 70));
    painter.drawEllipse(QPoint(100 + seed * 17 % 120, 120), 70, 70);
    painter.setBrush(QColor(0, 0, 0, 70));
    painter.drawRect(0, 220, 320, 100);
    painter.end();
    QByteArray bytes;
    QBuffer buffer(&bytes);
    buffer.open(QIODevice::WriteOnly);
    image.save(&buffer, "PNG");
    return bytes;
}

struct Fake {
    TestHttpServer server;
    QStringList order;
    QMap<QString, QJsonObject> assets;
    QList<QJsonObject> writes;
    bool failUpdates = false, failSearch = false;
    // Runs on the test thread while an update waits for its answer, so a test can act mid-save.
    std::function<void()> whileSaving;
    Fake() {
        server.setJson([this](const QByteArray& path, const QUrl& url) {
            const auto input = QJsonDocument::fromJson(QUrlQuery(url).queryItemValue("input", QUrl::FullyDecoded).toUtf8()).object();
            if (path.endsWith("assets.get")) return answer(assets.value(input.value("id").toString()));
            if (path.endsWith("timeline.get")) return answer(QJsonObject{{"projectId", "default"}});
            if (failSearch) return failure("INTERNAL_SERVER_ERROR");
            QJsonArray rows;
            for (const auto& key : order) rows.append(assets.value(key));
            return answer(QJsonObject{{"assets", rows}});
        });
        server.setPost([this](const QByteArray& path, const QByteArray& body) {
            Q_UNUSED(path)
            const auto input = QJsonDocument::fromJson(body).object();
            if (whileSaving) std::exchange(whileSaving, nullptr)();
            if (failUpdates) return failure("INTERNAL_SERVER_ERROR");
            writes.append(input);
            auto& asset = assets[input.value("id").toString()];
            asset.insert("metadata", input.value("metadata"));
            return answer(asset);
        });
    }
    void image(int number, const QString& name, bool reachable = true) {
        const auto key = id(number);
        order.append(key);
        assets.insert(key, QJsonObject{{"id", key}, {"name", name}, {"content_type", "image/png"},
            {"project_id", QJsonValue::Null}, {"thumb_url", "/img/" + key + ".png"}});
        if (reachable) server.setFile("/img/" + key.toUtf8() + ".png", ServedFile{picture(number)});
    }
    void entity(int number, const QString& name, const QString& kind, const QString& descriptor,
                const QString& voice = {}, const QStringList& tags = {}, bool reachable = true) {
        image(number, name + " reference", reachable);
        QJsonObject marker{{"kind", kind}, {"name", name}, {"descriptor", descriptor},
            {"tags", QJsonArray::fromStringList(tags)}};
        if (!voice.isEmpty()) marker.insert("voice_id", voice);
        tag(number, marker);
    }
    void tag(int number, const QJsonObject& marker) {
        auto& asset = assets[id(number)];
        asset.insert("metadata", QJsonObject{{"nodetool_entity", marker}});
    }
    // Four entities of each kind, one with a very long name and descriptor, and one without a reachable image.
    void populate() {
        entity(1, "Mara Vale", "character",
            "Late thirties, weathered navy peacoat, silver-streaked black hair tied back, a thin scar across her left eyebrow and a calm, appraising stare.",
            "voice-mara", {"lead", "harbor"});
        entity(2, "Harbor Street", "location",
            "A narrow cobbled street at dusk, wet from rain, strung with warm yellow lanterns and lined with shuttered fishmongers.");
        entity(3, "Noir Grade", "style",
            "High-contrast black and white with deep shadows, grainy 35mm texture and a single hard key light.");
        entity(4, "Brass Lantern", "prop",
            "A dented brass storm lantern with a cracked glass chimney and a worn leather carrying strap.");
        entity(5, "Captain Isolde Wraithmoor-Fitzgerald of the Eastern Marches", "character",
            "An imposing woman in her sixties with a rigid posture, a heavy greatcoat embroidered with faded gold thread, a patch over her right eye, a brass-tipped cane that she never leans on, "
            "and a habit of pausing mid-sentence to study whoever is listening as though weighing whether they can be trusted with the rest.",
            "voice-isolde", {"antagonist"});
        entity(6, "Ghost Prop", "prop", "A prop whose reference image can no longer be reached.", {}, {}, false);
        image(11, "Rooftop at night");
        image(12, "Red door");
        image(13, "Fog bank");
        image(14, "Market stall");
        image(15, "Last light");
    }
    QJsonObject marker(int number) const {
        return assets.value(id(number)).value("metadata").toObject().value("nodetool_entity").toObject();
    }
};

QObject* byName(QObject* root, const QString& name) {
    if (!root) return nullptr;
    if (root->objectName() == name) return root;
    if (auto* item = qobject_cast<QQuickItem*>(root)) {
        QList<QQuickItem*> pending = item->childItems();
        while (!pending.isEmpty()) {
            auto* child = pending.takeFirst();
            if (child->objectName() == name) return child;
            pending.append(child->childItems());
        }
    }
    return root->findChild<QObject*>(name);
}
bool shown(QObject* object) {
    auto* item = qobject_cast<QQuickItem*>(object);
    return item && item->isVisible();
}
QString textOf(QObject* object) { return object ? object->property("text").toString() : QString(); }
}

class TestEntityPanel : public QObject {
    Q_OBJECT
    std::unique_ptr<Fake> fake;
    std::unique_ptr<QQmlEngine> engine;
    std::unique_ptr<QQuickWindow> window;
    std::unique_ptr<QObject> backdrop, object;
    QQuickItem* panel = nullptr;
    EntityLibrary* library = nullptr;
    QObject* theme = nullptr;

    void mount(QSize windowSize, QSize panelSize, bool configure = true, int appearance = 2, bool visible = true) {
        engine = std::make_unique<QQmlEngine>();
        theme = engine->singletonInstance<QObject*>("NodeTool.UiPrimitives", "Theme");
        QVERIFY(theme);
        theme->setProperty("preference", appearance);
        window = std::make_unique<QQuickWindow>();
        window->resize(windowSize);
        QQmlComponent back(engine.get());
        back.setData("import QtQuick\nimport NodeTool.UiPrimitives as Ui\nRectangle { color: Ui.Theme.surfaceCanvas }", QUrl());
        backdrop.reset(back.create());
        QVERIFY2(backdrop, qPrintable(back.errorString()));
        auto* ground = qobject_cast<QQuickItem*>(backdrop.get());
        ground->setParentItem(window->contentItem());
        ground->setSize(windowSize);
        QQmlComponent component(engine.get(), QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/entities/EntityPanel.qml"));
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        object.reset(component.createWithInitialProperties({{"width", panelSize.width()}, {"height", panelSize.height()}, {"visible", visible}}));
        QVERIFY2(object, qPrintable(component.errorString()));
        panel = qobject_cast<QQuickItem*>(object.get());
        QVERIFY(panel);
        panel->setParentItem(window->contentItem());
        window->show();
        QVERIFY(QTest::qWaitForWindowExposed(window.get()));
        window->requestActivate();
        library = qobject_cast<EntityLibrary*>(qvariant_cast<QObject*>(panel->property("library")));
        QVERIFY(library);
        if (configure) library->configure(fake->server.base());
    }
    QObject* find(const QString& name) {
        if (auto* found = byName(window->contentItem(), name)) return found;
        return byName(panel, name);
    }
    QQuickItem* card(int number) { return qobject_cast<QQuickItem*>(find("entityCard_" + id(number))); }
    QObject* in(QObject* root, const QString& name) { return byName(root, name); }
    void click(QObject* target, Qt::MouseButton button = Qt::LeftButton) {
        auto* item = qobject_cast<QQuickItem*>(target);
        QVERIFY(item);
        QVERIFY(item->isVisible());
        // A freshly opened dialog lays out over a few frames, so wait for the target to hold still.
        QPoint position(-1, -1);
        for (int attempt = 0; attempt < 30; ++attempt) {
            const auto next = item->mapToScene(QPointF(item->width() / 2, item->height() / 2)).toPoint();
            if (next == position) break;
            position = next;
            QTest::qWait(16);
        }
        QTest::mouseClick(window.get(), button, {}, position);
    }
    void focus(QObject* target) {
        auto* item = qobject_cast<QQuickItem*>(target);
        QVERIFY(item);
        item->forceActiveFocus();
        QTRY_VERIFY(item->hasActiveFocus());
    }
    bool settled() {
        QList<QQuickItem*> pending{window->contentItem()};
        while (!pending.isEmpty()) {
            auto* item = pending.takeLast();
            if (item->inherits("QQuickImage") && item->property("status").toInt() == 2) return false;
            pending.append(item->childItems());
        }
        return true;
    }
    void waitForCards(int count) {
        QTRY_VERIFY_WITH_TIMEOUT(library->entities().size() == count && !library->loading(), 10000);
        QTRY_VERIFY(card(1) || count != 6);
        QTRY_VERIFY_WITH_TIMEOUT(settled(), 10000);
    }
    QObject* bannerAction(const QString& banner) { return in(find(banner), "bannerActionButton"); }
    void openNewEditor(int image) {
        click(find("entityNewButton"));
        QTRY_VERIFY(find("entityImagePicker")->property("opened").toBool());
        QTRY_VERIFY(find("entityImageTile_" + id(image)));
        click(find("entityImageTile_" + id(image)));
        QTRY_VERIFY(find("entityEditorDialog")->property("opened").toBool());
        QTRY_VERIFY(find("entityNameField")->property("activeFocus").toBool());
    }
    void type(const QString& text) {
        for (const QChar letter : text) QTest::keyClick(window.get(), letter.toLatin1());
    }
    bool reasonShown() { return shown(find("entitySaveReason")) || shown(find("entitySaveReasonStacked")); }
    void pointerTo(QObject* target) {
        auto* item = qobject_cast<QQuickItem*>(target);
        const auto position = item ? item->mapToScene(QPointF(item->width() / 2, item->height() / 2)).toPoint() : QPoint(1, 1);
        QTest::mouseMove(window.get(), position);
    }
    // Moves the pointer to `hover`, or to a corner that holds no control, then writes the window to a PNG.
    void capture(const QString& name, QObject* hover = nullptr) {
        const auto directory = qEnvironmentVariable("NT_ENTITY_CAPTURE_DIR");
        if (directory.isEmpty()) return;
        QTRY_VERIFY_WITH_TIMEOUT(settled(), 10000);
        pointerTo(hover);
        QTest::qWait(350);
        QDir().mkpath(directory);
        QVERIFY(window->grabWindow().save(QDir(directory).filePath(name + ".png")));
    }
    void closeAll() {
        object.reset();
        backdrop.reset();
        window.reset();
        engine.reset();
        fake.reset();
        panel = nullptr;
        library = nullptr;
    }

private slots:
    void init() { fake = std::make_unique<Fake>(); }
    void cleanup() { closeAll(); }

    void cardsRender() {
        fake->populate();
        mount({320, 800}, {320, 800});
        waitForCards(6);
        QCOMPARE(textOf(in(card(1), "entityName")), QString("Mara Vale"));
        QCOMPARE(textOf(in(card(1), "entityKind")), QString("Character"));
        QVERIFY(textOf(in(card(1), "entityDescriptor")).startsWith("Late thirties"));
        QCOMPARE(textOf(in(card(2), "entityKind")), QString("Location"));
        QCOMPARE(textOf(in(card(3), "entityKind")), QString("Style"));
        QCOMPARE(textOf(in(card(4), "entityKind")), QString("Prop"));
        QCOMPARE(in(card(1), "entityEditButton")->property("accessibleName").toString(), QString("Edit entity Mara Vale"));
        QCOMPARE(in(card(1), "entityRemoveButton")->property("accessibleName").toString(), QString("Remove entity Mara Vale"));
        QVERIFY(!shown(in(card(1), "entityNoImage")));
        QCOMPARE(in(card(1), "entityImage")->property("status").toInt(), 1);
        QVERIFY(shown(in(card(6), "entityNoImage")));
        // Every card is the same height, whatever its name and descriptor.
        QCOMPARE(card(5)->height(), card(1)->height());
        QCOMPARE(card(6)->height(), card(1)->height());
        QCOMPARE(card(4)->height(), card(1)->height());
        QVERIFY(in(card(5), "entityName")->property("truncated").toBool());
        QVERIFY(in(card(5), "entityDescriptor")->property("truncated").toBool());
        QCOMPARE(card(1)->property("selected").toBool(), false);
        QVERIFY(!shown(find("entityEmpty")));
        QVERIFY(!shown(find("entityNotConfigured")));
        QVERIFY(!shown(find("entityLoading")));
        // Two columns at 320 wide, one at 240 wide.
        QCOMPARE(card(1)->y(), card(2)->y());
        QVERIFY(card(3)->y() > card(1)->y());
        QVERIFY(card(1)->width() >= 140);
        panel->setWidth(240);
        QTRY_COMPARE(card(2)->x(), card(1)->x());
        panel->setWidth(560);
        QTRY_VERIFY(card(3)->y() == card(1)->y());
    }

    void newEntityPickerHidesEntities() {
        fake->populate();
        mount({1280, 720}, {320, 720});
        waitForCards(6);
        click(find("entityNewButton"));
        auto* picker = find("entityImagePicker");
        QTRY_VERIFY(picker->property("opened").toBool());
        QTRY_VERIFY(find("entityImageTile_" + id(11)));
        for (int number = 11; number <= 15; ++number) QVERIFY(find("entityImageTile_" + id(number)));
        for (int number = 1; number <= 6; ++number) QVERIFY(!find("entityImageTile_" + id(number)));
        QCOMPARE(find("entityImageTile_" + id(12))->property("accessibleName").toString(), QString("Pick Red door"));
        QVERIFY(!shown(find("entityImagesLoading")));
        // Escape closes the picker without choosing anything.
        QTest::keyClick(window.get(), Qt::Key_Escape);
        QTRY_VERIFY(!picker->property("visible").toBool());
        QVERIFY(!find("entityEditorDialog")->property("visible").toBool());
        QVERIFY(fake->writes.isEmpty());
        // Space picks the focused tile and opens the editor on that image.
        click(find("entityNewButton"));
        QTRY_VERIFY(picker->property("opened").toBool());
        QTRY_VERIFY(find("entityImageTile_" + id(13)));
        focus(find("entityImageTile_" + id(13)));
        QTest::keyClick(window.get(), Qt::Key_Space);
        QTRY_VERIFY(find("entityEditorDialog")->property("opened").toBool());
        QCOMPARE(find("entityEditorDialog")->property("referenceAssetId").toString(), id(13));
        QVERIFY(!picker->property("visible").toBool());
        QVERIFY(fake->writes.isEmpty());
    }

    void createFlow() {
        fake->populate();
        mount({1280, 720}, {320, 720});
        waitForCards(6);
        openNewEditor(12);
        auto* editor = find("entityEditorDialog");
        QCOMPARE(editor->property("title").toString(), QString("New entity"));
        auto* name = find("entityNameField");
        auto* descriptor = find("entityDescriptorField");
        auto* save = find("entitySave");
        QCOMPARE(textOf(save), QString("Create"));
        // Focus starts in the name field, so typing needs no click.
        QTRY_VERIFY(name->property("activeFocus").toBool());
        QVERIFY(!save->property("enabled").toBool());
        QVERIFY(reasonShown());
        QCOMPARE(textOf(find("entitySaveReason")), QString("Add a name and a descriptor to save."));
        QVERIFY(!shown(find("entityRemovedBanner")));
        type("Red Door");
        QCOMPARE(textOf(name), QString("Red Door"));
        QVERIFY(!save->property("enabled").toBool());
        focus(descriptor);
        type("A scuffed red door with a brass knocker.");
        QVERIFY(save->property("enabled").toBool());
        QVERIFY(!reasonShown());
        // Tab leaves the descriptor for the voice field, as the character kind shows one.
        QTest::keyClick(window.get(), Qt::Key_Tab);
        QTRY_VERIFY(find("entityVoiceField")->property("activeFocus").toBool());
        QVERIFY(shown(find("entityVoiceField")));
        click(find("entityKind_prop"));
        QTRY_VERIFY(!shown(find("entityVoiceField")));
        QVERIFY(find("entityKind_prop")->property("checked").toBool());
        QVERIFY(!find("entityKind_character")->property("checked").toBool());
        focus(find("entityTagsField"));
        type("door, red, door");
        click(save);
        QTRY_VERIFY(fake->writes.size() == 1);
        const auto marker = fake->writes.first().value("metadata").toObject().value("nodetool_entity").toObject();
        QCOMPARE(fake->writes.first().value("id").toString(), id(12));
        QCOMPARE(marker.value("kind").toString(), QString("prop"));
        QCOMPARE(marker.value("name").toString(), QString("Red Door"));
        QCOMPARE(marker.value("descriptor").toString(), QString("A scuffed red door with a brass knocker."));
        QCOMPARE(marker.value("tags").toArray(), QJsonArray({"door", "red"}));
        QVERIFY(marker.value("voice_id").isNull());
        QTRY_VERIFY(!editor->property("visible").toBool());
        QTRY_VERIFY(card(12));
        QTRY_VERIFY(card(12)->property("selected").toBool());
        QCOMPARE(textOf(in(card(12), "entityName")), QString("Red Door"));
        QCOMPARE(fake->server.countRequests("POST", "/trpc/assets.delete"), 0);
    }

    void createFailureKeepsDraft() {
        fake->populate();
        mount({1280, 720}, {320, 720});
        waitForCards(6);
        openNewEditor(13);
        auto* editor = find("entityEditorDialog");
        auto* save = find("entitySave");
        focus(find("entityNameField"));
        type("Fog Bank");
        focus(find("entityDescriptorField"));
        type("Thick sea fog that swallows the pier.");
        fake->failUpdates = true;
        click(save);
        auto* banner = find("entitySaveError");
        QTRY_VERIFY(shown(banner));
        QVERIFY(banner->property("message").toString().contains("test failure"));
        QVERIFY(editor->property("visible").toBool());
        QCOMPARE(textOf(find("entityNameField")), QString("Fog Bank"));
        QCOMPARE(textOf(find("entityDescriptorField")), QString("Thick sea fog that swallows the pier."));
        QVERIFY(save->property("enabled").toBool());
        QVERIFY(!card(13));
        // Editing the draft clears the error, and the retry succeeds.
        fake->failUpdates = false;
        focus(find("entityDescriptorField"));
        type(" ");
        QTRY_VERIFY(!shown(banner));
        click(save);
        QTRY_VERIFY(!editor->property("visible").toBool());
        QTRY_VERIFY(card(13));
        QCOMPARE(fake->writes.size(), 1);
    }

    void editPrefillsAndChangesImage() {
        fake->populate();
        mount({1280, 720}, {320, 720});
        waitForCards(6);
        click(in(card(1), "entityEditButton"));
        auto* editor = find("entityEditorDialog");
        QTRY_VERIFY(editor->property("opened").toBool());
        QCOMPARE(editor->property("title").toString(), QString("Edit entity"));
        QCOMPARE(textOf(find("entityNameField")), QString("Mara Vale"));
        QVERIFY(textOf(find("entityDescriptorField")).startsWith("Late thirties"));
        QCOMPARE(textOf(find("entityVoiceField")), QString("voice-mara"));
        QCOMPARE(textOf(find("entityTagsField")), QString("lead, harbor"));
        QVERIFY(find("entityKind_character")->property("checked").toBool());
        QCOMPARE(textOf(find("entitySave")), QString("Save"));
        QVERIFY(find("entitySave")->property("enabled").toBool());
        QVERIFY(!reasonShown());
        QTRY_VERIFY(find("entityNameField")->property("activeFocus").toBool());
        QCOMPARE(find("entityNameField")->property("selectedText").toString(), QString("Mara Vale"));
        QCOMPARE(editor->property("referenceAssetId").toString(), id(1));
        // The picker offers entity images too when changing a picture.
        click(find("entityChangeImage"));
        auto* picker = find("entityImagePicker");
        QTRY_VERIFY(picker->property("opened").toBool());
        QTRY_VERIFY(find("entityImageTile_" + id(14)));
        QVERIFY(find("entityImageTile_" + id(2)));
        QVERIFY(find("entityImageTile_" + id(1)));
        // Return picks the focused tile.
        focus(find("entityImageTile_" + id(14)));
        QTest::keyClick(window.get(), Qt::Key_Return);
        QTRY_VERIFY(!picker->property("visible").toBool());
        QTRY_COMPARE(editor->property("referenceAssetId").toString(), id(14));
        QVERIFY(editor->property("visible").toBool());
        QTRY_VERIFY(find("entityChangeImage")->property("activeFocus").toBool());
        focus(find("entityNameField"));
        QTest::keyClick(window.get(), Qt::Key_A, Qt::ControlModifier);
        type("Mara Vale-Okafor");
        click(find("entitySave"));
        QTRY_VERIFY(fake->writes.size() == 1);
        const auto write = fake->writes.first();
        QCOMPARE(write.value("id").toString(), id(1));
        const auto marker = write.value("metadata").toObject().value("nodetool_entity").toObject();
        QCOMPARE(marker.value("reference_asset_id").toString(), id(14));
        QCOMPARE(marker.value("name").toString(), QString("Mara Vale-Okafor"));
        QCOMPARE(marker.value("voice_id").toString(), QString("voice-mara"));
        QCOMPARE(marker.value("tags").toArray(), QJsonArray({"lead", "harbor"}));
        QTRY_VERIFY(!editor->property("visible").toBool());
        QTRY_COMPARE(textOf(in(card(1), "entityName")), QString("Mara Vale-Okafor"));
        QTRY_VERIFY(card(1)->property("selected").toBool());
    }

    void voiceFieldOnlyForCharacters() {
        fake->populate();
        mount({1280, 720}, {320, 720});
        waitForCards(6);
        click(in(card(2), "entityEditButton"));
        auto* editor = find("entityEditorDialog");
        QTRY_VERIFY(editor->property("opened").toBool());
        QCOMPARE(textOf(find("entityNameField")), QString("Harbor Street"));
        QVERIFY(find("entityKind_location")->property("checked").toBool());
        QVERIFY(!shown(find("entityVoiceField")));
        click(find("entityKind_character"));
        QTRY_VERIFY(shown(find("entityVoiceField")));
        QCOMPARE(textOf(find("entityVoiceField")), QString());
        click(find("entityCancel"));
        QTRY_VERIFY(!editor->property("visible").toBool());
        QVERIFY(fake->writes.isEmpty());
        // A later edit starts from its own entity, not from the previous draft.
        click(in(card(1), "entityEditButton"));
        QTRY_VERIFY(editor->property("opened").toBool());
        QCOMPARE(textOf(find("entityNameField")), QString("Mara Vale"));
        QVERIFY(shown(find("entityVoiceField")));
        QCOMPARE(textOf(find("entityVoiceField")), QString("voice-mara"));
        click(find("entityCancel"));
        QTRY_VERIFY(!editor->property("visible").toBool());
        // A new entity starts blank.
        openNewEditor(15);
        QCOMPARE(textOf(find("entityNameField")), QString());
        QCOMPARE(textOf(find("entityDescriptorField")), QString());
        QCOMPARE(textOf(find("entityTagsField")), QString());
        QVERIFY(find("entityKind_character")->property("checked").toBool());
        QVERIFY(!find("entitySave")->property("enabled").toBool());
    }

    void keyboardAndContextMenu() {
        fake->populate();
        mount({1280, 720}, {320, 720});
        waitForCards(6);
        auto* editor = find("entityEditorDialog");
        focus(card(2));
        QTest::keyClick(window.get(), Qt::Key_Return);
        QTRY_VERIFY(editor->property("opened").toBool());
        QCOMPARE(textOf(find("entityNameField")), QString("Harbor Street"));
        QTest::keyClick(window.get(), Qt::Key_Escape);
        QTRY_VERIFY(!editor->property("visible").toBool());
        // The dialog gives focus back to the card that opened it.
        QTRY_VERIFY(card(2)->hasActiveFocus());
        QTest::keyClick(window.get(), Qt::Key_Menu);
        auto* menu = in(card(2), "entityMenu");
        QTRY_VERIFY(menu->property("visible").toBool());
        click(in(card(2), "entityMenuEdit"));
        QTRY_VERIFY(editor->property("opened").toBool());
        QCOMPARE(textOf(find("entityNameField")), QString("Harbor Street"));
        click(find("entityCancel"));
        QTRY_VERIFY(!editor->property("visible").toBool());
        click(card(3), Qt::RightButton);
        menu = in(card(3), "entityMenu");
        QTRY_VERIFY(menu->property("visible").toBool());
        click(in(card(3), "entityMenuRemove"));
        QTRY_VERIFY(fake->writes.size() == 1);
        QCOMPARE(fake->writes.first().value("id").toString(), id(3));
    }

    void removeAndUndo() {
        fake->populate();
        mount({1280, 720}, {320, 720});
        waitForCards(6);
        QVERIFY(!shown(find("entityRemovedBanner")));
        click(in(card(4), "entityRemoveButton"));
        // No confirmation: the marker is removed at once and the card goes away.
        QTRY_VERIFY(fake->writes.size() == 1);
        QCOMPARE(fake->writes.first().value("id").toString(), id(4));
        QVERIFY(!fake->writes.first().value("metadata").toObject().contains("nodetool_entity"));
        QCOMPARE(fake->server.countRequests("POST", "/trpc/assets.delete"), 0);
        auto* banner = find("entityRemovedBanner");
        QTRY_VERIFY(shown(banner));
        QCOMPARE(banner->property("message").toString(), QString("Removed “Brass Lantern”."));
        QTRY_VERIFY(!card(4));
        QVERIFY(!find("entityEditorDialog")->property("visible").toBool());
        click(bannerAction("entityRemovedBanner"));
        QTRY_VERIFY(fake->writes.size() == 2);
        QVERIFY(fake->writes.last().value("metadata").toObject().contains("nodetool_entity"));
        QCOMPARE(fake->marker(4).value("name").toString(), QString("Brass Lantern"));
        QTRY_VERIFY(!shown(banner));
        QTRY_VERIFY(card(4));
        // Dismissing the banner drops the undo.
        focus(card(3));
        QTest::keyClick(window.get(), Qt::Key_Delete);
        QTRY_VERIFY(fake->writes.size() == 3);
        QTRY_VERIFY(shown(banner));
        QCOMPARE(banner->property("message").toString(), QString("Removed “Noir Grade”."));
        click(find("entityRemovedDismiss"));
        QTRY_VERIFY(!shown(banner));
        QVERIFY(library->removedName().isEmpty());
        QVERIFY(!card(3));
        QCOMPARE(fake->writes.size(), 3);
    }

    void savedCardScrollsIntoViewAndListKeepsPosition() {
        fake->populate();
        mount({1280, 720}, {320, 420});
        waitForCards(6);
        auto* grid = qobject_cast<QQuickItem*>(find("entityGrid"));
        QVERIFY(grid);
        QCOMPARE(grid->property("contentY").toDouble(), 0.0);
        openNewEditor(15);
        focus(find("entityNameField"));
        type("Last Light");
        focus(find("entityDescriptorField"));
        type("The final minute of sun before the harbor goes dark.");
        click(find("entitySave"));
        QTRY_VERIFY(card(15));
        auto inView = [&] {
            const auto top = card(15)->mapToItem(grid, QPointF(0, 0)).y();
            return top >= -1 && top + card(15)->height() <= grid->height() + 1;
        };
        QTRY_VERIFY(inView());
        QVERIFY(grid->property("contentY").toDouble() > 0);
        QVERIFY(card(15)->property("selected").toBool());
        // A reload that follows a removal keeps the scroll position.
        const double before = grid->property("contentY").toDouble();
        click(in(card(15), "entityRemoveButton"));
        QTRY_VERIFY(!card(15));
        QTRY_VERIFY(grid->property("contentY").toDouble() > 0);
        QVERIFY(grid->property("contentY").toDouble() <= before);
    }

    void emptyStateOffersNewEntity() {
        fake->image(11, "Rooftop at night");
        fake->image(12, "Red door");
        mount({1280, 720}, {320, 720});
        QTRY_VERIFY_WITH_TIMEOUT(shown(find("entityEmpty")), 10000);
        auto* empty = find("entityEmpty");
        QCOMPARE(empty->property("title").toString(), QString("No entities yet"));
        QCOMPARE(empty->property("message").toString(), QString("Tag an image as a character, location, style, or prop to reuse it across shots."));
        QVERIFY(!empty->property("message").toString().contains("right-click"));
        QCOMPARE(empty->property("actionText").toString(), QString("New entity"));
        QVERIFY(!shown(find("entityGrid")));
        QVERIFY(!shown(find("entityError")));
        QObject* action = nullptr;
        QList<QQuickItem*> pending = qobject_cast<QQuickItem*>(empty)->childItems();
        while (!pending.isEmpty() && !action) {
            auto* item = pending.takeFirst();
            if (item->inherits("QQuickAbstractButton") && item->property("text").toString() == "New entity") action = item;
            pending.append(item->childItems());
        }
        QVERIFY(action);
        click(action);
        QTRY_VERIFY(find("entityImagePicker")->property("opened").toBool());
        QTRY_VERIFY(find("entityImageTile_" + id(11)));
        QTRY_VERIFY(find("entityImageTile_" + id(12)));
    }

    void pickerEmptyAndError() {
        mount({1280, 720}, {320, 720});
        QTRY_VERIFY_WITH_TIMEOUT(shown(find("entityEmpty")), 10000);
        click(find("entityNewButton"));
        auto* picker = find("entityImagePicker");
        QTRY_VERIFY(picker->property("opened").toBool());
        auto* empty = find("entityImagesEmpty");
        QTRY_VERIFY(shown(empty));
        QCOMPARE(empty->property("title").toString(), QString("No images"));
        QCOMPARE(empty->property("message").toString(), QString("Generate or upload an image first."));
        click(find("entityImagePickerCancel"));
        QTRY_VERIFY(!picker->property("visible").toBool());
        fake->failSearch = true;
        click(find("entityNewButton"));
        QTRY_VERIFY(picker->property("opened").toBool());
        auto* error = find("entityImagesError");
        QTRY_VERIFY(shown(error));
        QVERIFY(error->property("message").toString().contains("test failure"));
        QVERIFY(!shown(empty));
        fake->failSearch = false;
        fake->image(11, "Rooftop at night");
        click(bannerAction("entityImagesError"));
        QTRY_VERIFY(find("entityImageTile_" + id(11)));
        QVERIFY(!shown(error));
    }

    void notConfiguredAndLoadError() {
        fake->populate();
        mount({1280, 720}, {320, 720}, false);
        QTRY_VERIFY(shown(find("entityNotConfigured")));
        QCOMPARE(textOf(find("entityNotConfigured")), QString("Open a server timeline to use entities."));
        QVERIFY(!shown(find("entityEmpty")));
        QVERIFY(!shown(find("entityError")));
        QVERIFY(!shown(find("entityLoading")));
        QVERIFY(!find("entityNewButton")->property("enabled").toBool());
        QVERIFY(!find("entityRefreshButton")->property("enabled").toBool());
        // A server that fails shows the error with a way to retry.
        fake->failSearch = true;
        library->configure(fake->server.base());
        auto* error = find("entityError");
        QTRY_VERIFY_WITH_TIMEOUT(shown(error), 10000);
        QVERIFY(error->property("message").toString().contains("test failure"));
        QCOMPARE(error->property("actionText").toString(), QString("Retry"));
        QVERIFY(!shown(find("entityNotConfigured")));
        QVERIFY(!shown(find("entityEmpty")));
        fake->failSearch = false;
        click(bannerAction("entityError"));
        QTRY_VERIFY_WITH_TIMEOUT(card(1) != nullptr, 10000);
        QTRY_VERIFY(!shown(error));
    }

    void actionsFadeInOnHoverAndFocus() {
        fake->populate();
        mount({1280, 720}, {320, 720});
        waitForCards(6);
        pointerTo(nullptr);
        auto* actions = qobject_cast<QQuickItem*>(in(card(2), "entityActions"));
        QVERIFY(actions);
        QTRY_COMPARE(actions->opacity(), 0.0);
        QVERIFY(actions->isVisible());
        pointerTo(card(2));
        QTRY_COMPARE(actions->opacity(), 1.0);
        QCOMPARE(qobject_cast<QQuickItem*>(in(card(1), "entityActions"))->opacity(), 0.0);
        pointerTo(nullptr);
        QTRY_COMPARE(actions->opacity(), 0.0);
        // Focus inside the pill also shows it, and a transparent pill still takes clicks.
        focus(in(card(2), "entityEditButton"));
        QTRY_COMPARE(actions->opacity(), 1.0);
        focus(find("entityRefreshButton"));
        QTRY_COMPARE(actions->opacity(), 0.0);
        click(in(card(2), "entityEditButton"));
        QTRY_VERIFY(find("entityEditorDialog")->property("opened").toBool());
        QCOMPARE(textOf(find("entityNameField")), QString("Harbor Street"));
    }

    void removeFailureShowsActionErrorWithoutRetry() {
        fake->populate();
        mount({1280, 720}, {320, 720});
        waitForCards(6);
        fake->failUpdates = true;
        click(in(card(4), "entityRemoveButton"));
        auto* error = find("entityActionError");
        QTRY_VERIFY(shown(error));
        QVERIFY(error->property("message").toString().contains("test failure"));
        QCOMPARE(error->property("actionText").toString(), QString("Dismiss"));
        QVERIFY(!shown(find("entityError")));
        QVERIFY(!shown(find("entityRemovedBanner")));
        QVERIFY(card(4));
        QVERIFY(fake->writes.isEmpty());
        click(bannerAction("entityActionError"));
        QTRY_VERIFY(!shown(error));
        QVERIFY(library->actionError().isEmpty());
    }

    void saveInFlightCannotBeAbandoned() {
        fake->populate();
        mount({1280, 720}, {320, 720});
        waitForCards(6);
        openNewEditor(12);
        auto* editor = find("entityEditorDialog");
        focus(find("entityNameField"));
        type("Red Door");
        focus(find("entityDescriptorField"));
        type("A scuffed red door.");
        bool duringSave = false;
        fake->whileSaving = [&] {
            duringSave = true;
            QVERIFY(library->saving());
            QVERIFY(!find("entityCancel")->property("enabled").toBool());
            QCOMPARE(editor->property("closePolicy").toInt(), 0);  // NoAutoClose
            QTest::keyClick(window.get(), Qt::Key_Escape);
            QTest::qWait(50);
            QVERIFY(editor->property("visible").toBool());
            click(find("entityCancel"));
            QTest::qWait(50);
            QVERIFY(editor->property("visible").toBool());
            QCOMPARE(textOf(find("entityNameField")), QString("Red Door"));
        };
        click(find("entitySave"));
        QTRY_VERIFY(duringSave);
        QTRY_VERIFY(!editor->property("visible").toBool());
        QCOMPARE(fake->writes.size(), 1);
        QCOMPARE(editor->property("closePolicy").toInt(), 16);  // CloseOnEscape
        QTRY_VERIFY(card(12));
    }

    void changingImageInNewKeepsDraftAndHidesEntities() {
        fake->populate();
        mount({1280, 720}, {320, 720});
        waitForCards(6);
        openNewEditor(11);
        auto* editor = find("entityEditorDialog");
        focus(find("entityNameField"));
        type("Rooftop");
        click(find("entityChangeImage"));
        auto* picker = find("entityImagePicker");
        QTRY_VERIFY(picker->property("opened").toBool());
        QTRY_VERIFY(find("entityImageTile_" + id(12)));
        QVERIFY(picker->property("hideEntities").toBool());
        for (int number = 1; number <= 6; ++number) QVERIFY(!find("entityImageTile_" + id(number)));
        click(find("entityImageTile_" + id(13)));
        QTRY_VERIFY(!picker->property("visible").toBool());
        QTRY_COMPARE(editor->property("referenceAssetId").toString(), id(13));
        QCOMPARE(editor->property("title").toString(), QString("New entity"));
        QVERIFY(editor->property("visible").toBool());
        QCOMPARE(textOf(find("entityNameField")), QString("Rooftop"));
        focus(find("entityDescriptorField"));
        type("Wet slate roofs under a streetlight.");
        click(find("entitySave"));
        QTRY_VERIFY(fake->writes.size() == 1);
        QCOMPARE(fake->writes.first().value("id").toString(), id(13));
        QTRY_VERIFY(!editor->property("visible").toBool());
        // The next New flow starts from the new-entity rules again.
        click(find("entityNewButton"));
        QTRY_VERIFY(picker->property("opened").toBool());
        QVERIFY(picker->property("hideEntities").toBool());
    }

    void focusFollowsScrollAndSurvivesReload() {
        fake->populate();
        mount({1280, 720}, {320, 420});
        waitForCards(6);
        auto* grid = qobject_cast<QQuickItem*>(find("entityGrid"));
        QVERIFY(grid);
        auto inView = [&](QQuickItem* item) {
            const auto top = item->mapToItem(grid, QPointF(0, 0)).y();
            return top >= -1 && top + item->height() <= grid->height() + 1;
        };
        // Tab walks past the viewport and the grid follows it.
        focus(card(1));
        for (int step = 0; step < 40 && !(card(5) && card(5)->hasActiveFocus()); ++step) {
            QTest::keyClick(window.get(), Qt::Key_Tab);
            QTest::qWait(20);
        }
        QVERIFY(card(5) && card(5)->hasActiveFocus());
        QTRY_VERIFY(inView(card(5)));
        QVERIFY(grid->property("contentY").toDouble() > 0);
        // A reload that changes the list rebuilds the cards, and the focused one gets focus back.
        auto marker = fake->marker(3);
        marker.insert("name", "Noir Grade Redux");
        fake->tag(3, marker);
        library->reload();
        QTRY_COMPARE(textOf(in(card(3), "entityName")), QString("Noir Grade Redux"));
        QTRY_VERIFY(card(5) && card(5)->hasActiveFocus());
        QTRY_VERIFY(inView(card(5)));
        // Focus on something else is not pulled back by a later reload.
        focus(find("entityRefreshButton"));
        marker.insert("name", "Noir Grade Again");
        fake->tag(3, marker);
        library->reload();
        QTRY_COMPARE(textOf(in(card(3), "entityName")), QString("Noir Grade Again"));
        QTest::qWait(100);
        QVERIFY(find("entityRefreshButton")->property("activeFocus").toBool());
    }

    void removalMovesFocusToThePanel() {
        fake->populate();
        mount({1280, 720}, {320, 720});
        waitForCards(6);
        click(in(card(2), "entityRemoveButton"));
        QTRY_VERIFY(!card(2));
        QTRY_VERIFY(panel->hasActiveFocus());
        for (int number : {1, 3, 4, 5, 6}) QVERIFY(!card(number)->hasActiveFocus());
        QVERIFY(!card(1)->property("selected").toBool());
        QVERIFY(!card(3)->property("selected").toBool());
    }

    void undoRestoresInReverseOrder() {
        fake->populate();
        mount({1280, 720}, {320, 720});
        waitForCards(6);
        click(in(card(3), "entityRemoveButton"));
        QTRY_VERIFY(!card(3));
        click(in(card(4), "entityRemoveButton"));
        QTRY_VERIFY(!card(4));
        auto* banner = find("entityRemovedBanner");
        QCOMPARE(banner->property("message").toString(), QString("Removed “Brass Lantern”."));
        QVERIFY(library->canUndo());
        click(bannerAction("entityRemovedBanner"));
        QTRY_VERIFY(card(4));
        QVERIFY(!card(3));
        QCOMPARE(fake->marker(4).value("name").toString(), QString("Brass Lantern"));
        QVERIFY(fake->marker(3).isEmpty());
        QCOMPARE(banner->property("message").toString(), QString("Removed “Noir Grade”."));
        QTRY_VERIFY(shown(banner));
        click(bannerAction("entityRemovedBanner"));
        QTRY_VERIFY(card(3));
        QCOMPARE(fake->marker(3).value("name").toString(), QString("Noir Grade"));
        QTRY_VERIFY(!shown(banner));
        QVERIFY(!library->canUndo());
        QCOMPARE(fake->writes.size(), 4);
    }

    void captureGallery() {
        if (qEnvironmentVariable("NT_ENTITY_CAPTURE_DIR").isEmpty()) QSKIP("Set NT_ENTITY_CAPTURE_DIR to write screenshots");
        for (const auto& [mode, appearance] : {std::pair{QString("dark"), 2}, std::pair{QString("light"), 3}}) {
            auto shot = [&](const QString& name, QObject* hover = nullptr) { capture(mode + "-" + name, hover); };
            fake = std::make_unique<Fake>();
            fake->populate();
            for (const auto& size : {QSize(320, 800), QSize(240, 600), QSize(560, 800)}) {
                mount(size, size, true, appearance);
                waitForCards(6);
                // One card is hovered, so its actions show next to cards without them.
                shot(QString("panel-populated-%1x%2").arg(size.width()).arg(size.height()), card(size.width() == 240 ? 1 : 2));
                if (size.width() == 320) {
                    focus(card(3));
                    shot("panel-focused-card-320x800");
                }
                closeAll();
                fake = std::make_unique<Fake>();
                fake->populate();
            }
            mount({320, 800}, {320, 800}, true, appearance);
            waitForCards(6);
            click(in(card(4), "entityRemoveButton"));
            QTRY_VERIFY(shown(find("entityRemovedBanner")));
            QTRY_VERIFY(!card(4));
            shot("panel-undo-banner-320x800");
            closeAll();

            fake = std::make_unique<Fake>();
            fake->populate();
            mount({240, 600}, {240, 600}, true, appearance);
            waitForCards(6);
            click(in(card(1), "entityRemoveButton"));
            QTRY_VERIFY(shown(find("entityRemovedBanner")));
            QTRY_VERIFY(!card(1));
            shot("panel-undo-banner-240x600");
            closeAll();

            fake = std::make_unique<Fake>();
            fake->populate();
            mount({640, 1000}, {640, 1000}, true, appearance);
            theme->setProperty("uiScale", 2);
            waitForCards(6);
            shot("panel-populated-uiscale2-640x1000", card(2));
            closeAll();

            fake = std::make_unique<Fake>();
            fake->image(11, "Rooftop at night");
            mount({320, 800}, {320, 800}, true, appearance);
            QTRY_VERIFY_WITH_TIMEOUT(shown(find("entityEmpty")), 10000);
            shot("panel-empty-320x800");
            closeAll();

            fake = std::make_unique<Fake>();
            fake->failSearch = true;
            mount({320, 800}, {320, 800}, true, appearance);
            QTRY_VERIFY_WITH_TIMEOUT(shown(find("entityError")), 10000);
            shot("panel-error-320x800");
            closeAll();

            fake = std::make_unique<Fake>();
            mount({320, 800}, {320, 800}, false, appearance);
            QTRY_VERIFY(shown(find("entityNotConfigured")));
            shot("panel-not-configured-320x800");
            closeAll();

            fake = std::make_unique<Fake>();
            fake->populate();
            mount({1280, 720}, {320, 720}, true, appearance);
            waitForCards(6);
            click(find("entityNewButton"));
            QTRY_VERIFY(find("entityImagePicker")->property("opened").toBool());
            QTRY_VERIFY(find("entityImageTile_" + id(11)));
            shot("picker-1280x720");
            focus(find("entityImageTile_" + id(11)));
            shot("picker-hover-focus-1280x720", find("entityImageTile_" + id(13)));
            click(find("entityImageTile_" + id(12)));
            QTRY_VERIFY(find("entityEditorDialog")->property("opened").toBool());
            shot("editor-new-1280x720");
            focus(find("entityNameField"));
            type("Red Door");
            focus(find("entityDescriptorField"));
            type("A scuffed red door with a brass knocker.");
            shot("editor-new-filled-1280x720");
            click(find("entityCancel"));
            QTRY_VERIFY(!find("entityEditorDialog")->property("visible").toBool());
            click(in(card(1), "entityEditButton"));
            QTRY_VERIFY(find("entityEditorDialog")->property("opened").toBool());
            shot("editor-edit-character-1280x720");
            fake->failUpdates = true;
            click(find("entitySave"));
            QTRY_VERIFY(shown(find("entitySaveError")));
            shot("editor-save-error-1280x720");
            fake->failUpdates = false;
            click(find("entityCancel"));
            QTRY_VERIFY(!find("entityEditorDialog")->property("visible").toBool());
            click(in(card(2), "entityEditButton"));
            QTRY_VERIFY(find("entityEditorDialog")->property("opened").toBool());
            shot("editor-edit-location-1280x720");
            closeAll();

            fake = std::make_unique<Fake>();
            fake->populate();
            mount({960, 600}, {320, 600}, true, appearance);
            waitForCards(6);
            click(in(card(1), "entityEditButton"));
            QTRY_VERIFY(find("entityEditorDialog")->property("opened").toBool());
            shot("editor-edit-character-960x600");
            closeAll();

            fake = std::make_unique<Fake>();
            fake->populate();
            mount({480, 360}, {320, 360}, true, appearance);
            waitForCards(6);
            click(in(card(1), "entityEditButton"));
            QTRY_VERIFY(find("entityEditorDialog")->property("opened").toBool());
            shot("editor-edit-character-480x360");
            closeAll();
        }
    }
    // Keep this last: it installs a process-wide save target, which the not-configured test must not see.
    void panelLoadsWhenShownAndRefreshesWhenRevealed() {
        fake->populate();
        QTemporaryDir cache;
        QVERIFY(cache.isValid());
        qputenv("NODETOOL_TIMELINE_CACHE_DIR", cache.path().toUtf8());
        nt::server::loadTimelineSource(fake->server.base().toString() + "#timeline=t1");
        auto searches = [&] { return fake->server.countRequests("GET", "/trpc/assets.search"); };
        mount({1280, 720}, {320, 720}, false, 2, false);
        QVERIFY(library->configured());
        QVERIFY(!panel->isVisible());
        QTest::qWait(400);
        QCOMPARE(searches(), 0);
        QVERIFY(library->entities().isEmpty());
        panel->setVisible(true);
        QTRY_COMPARE(searches(), 1);
        QTRY_VERIFY(card(1));
        panel->setVisible(false);
        QTest::qWait(300);
        QCOMPARE(searches(), 1);
        panel->setVisible(true);
        QTRY_COMPARE(searches(), 2);
        closeAll();
        // A panel that is visible when it is created loads once without being asked.
        fake = std::make_unique<Fake>();
        fake->populate();
        nt::server::loadTimelineSource(fake->server.base().toString() + "#timeline=t1");
        mount({1280, 720}, {320, 720}, false);
        QTRY_VERIFY_WITH_TIMEOUT(card(1) != nullptr, 10000);
        QCOMPARE(fake->server.countRequests("GET", "/trpc/assets.search"), 1);
    }
};

int main(int argc, char** argv) {
    QGuiApplication app(argc, argv);
    TestEntityPanel test;
    return QTest::qExec(&test, argc, argv);
}
#include "tst_entitypanel.moc"
