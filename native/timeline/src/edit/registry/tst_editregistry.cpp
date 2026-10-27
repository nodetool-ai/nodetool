#include "app/EditRegistry.h"
#include "edit/groups/GroupOps.h"
#include "edit/targeting/TrackTargeting.h"
#include <QJsonArray>
#include <QRegularExpression>
#include <QtTest>

namespace {
const QStringList rippleNames{"rippleDeleteSelected", "rippleTrimClipStart", "rippleTrimClipEnd", "closeGapAt"};
QJsonObject clip(const QString& id, const QString& track, double start, double duration) {
    return {{"id", id}, {"trackId", track}, {"startMs", start}, {"durationMs", duration},
            {"inPointMs", 500}, {"mediaType", track == u"A2" ? "audio" : "video"}, {"custom", id}};
}
QJsonObject document(bool group = false) {
    auto edit = clip("edit", "V1", 1000, 1000);
    QJsonArray clips{edit, clip("tail", "V1", 4000, 1000),
                     clip("earlyAudio", "A2", 0, 500), clip("lateAudio", "A2", 4000, 700)};
    if (group) {
        edit.insert("mediaType", "group");
        clips[0] = edit;
        auto child = clip("child", "V1", 1100, 500);
        child.insert("parentId", "edit");
        clips.append(child);
    }
    return {{"tracks", QJsonArray{QJsonObject{{"id", "V1"}, {"type", "video"}},
                                  QJsonObject{{"id", "A2"}, {"type", "audio"}}}},
            {"clips", clips}, {"mediaTracks", QJsonArray{}}, {"custom", "preserve"}};
}
QJsonObject payload(const QString& action) {
    if (action == u"closeGapAt") {
        return {{"trackId", "V1"}, {"timeMs", 2500}};
    }
    if (action == u"rippleDeleteSelected") {
        return {{"selectedIds", QJsonArray{"edit"}}};
    }
    return {{"clipId", "edit"}, {"deltaMs", -200}, {"linked", false}, {"maxSourceDurationMs", 10000}};
}
QJsonArray trackClips(const QJsonObject& doc, const QString& track) {
    QJsonArray result;
    for (const auto& value : doc.value("clips").toArray()) {
        if (value.toObject().value("trackId") == track) {
            result.append(value);
        }
    }
    return result;
}
double startOf(const QJsonObject& doc, const QString& id) {
    for (const auto& value : doc.value("clips").toArray()) {
        const auto c = value.toObject();
        if (c.value("id") == id) {
            return c.value("startMs").toDouble();
        }
    }
    return -1;
}
} // namespace

class TestEditRegistry : public QObject {
    Q_OBJECT
    qsizetype startupRefusals_ = 0;
private slots:
    void initTestCase() {
        startupRefusals_ = nt::app::editRefusals().size();
    }
    void init() {
        auto& state = nt::targeting::TrackTargeting::current();
        for (const auto& id : {"V1", "A2"}) {
            state.setTrackTargeted(id, true);
            state.setTrackSyncLocked(id, true);
        }
    }
    void appRegistrarsHaveNoRefusals() {
        QCOMPARE(startupRefusals_, 0);
        for (const auto& name : {"copy", "groupClips", "keyframes.input", "removeRange", "addTrack",
                                 "setClipTransition", "addMarker"}) {
            QVERIFY2(nt::app::findEdit(name), name);
        }
    }
    void singleRippleRegistrar_data() {
        QTest::addColumn<QString>("action");
        for (const auto& name : rippleNames) {
            QTest::newRow(qPrintable(name)) << name;
        }
    }
    void singleRippleRegistrar() {
        QFETCH(QString, action);
        int count = 0;
        for (const auto& record : nt::app::editRegistrations()) {
            if (record.name != action || record.registrar.startsWith("src/app/BuiltinEdits.cpp:")) {
                continue;
            }
            ++count;
            QVERIFY2(record.registrar.startsWith("src/edit/registry/"), qPrintable(record.registrar));
        }
        QCOMPARE(count, 1);
    }
    void syncLock_data() {
        QTest::addColumn<QString>("action");
        QTest::addColumn<QString>("mode");
        for (const auto& action : rippleNames) {
            for (const auto& mode : {"payloadOff", "currentOff", "on", "payloadOn"}) {
                QTest::newRow(qPrintable(action + '/' + mode)) << action << QString(mode);
            }
        }
    }
    void syncLock() {
        QFETCH(QString, action);
        QFETCH(QString, mode);
        auto& state = nt::targeting::TrackTargeting::current();
        auto p = payload(action);
        if (mode == u"currentOff" || mode == u"payloadOn") {
            state.setTrackSyncLocked("A2", false);
        }
        if (mode == u"payloadOff" || mode == u"payloadOn") {
            p.insert("syncLockOffTrackIds", mode == u"payloadOff" ? QJsonArray{"A2"} : QJsonArray{});
        }
        if (mode != u"currentOff") {
            p.insert("untargetedTrackIds", QJsonArray{});
        }
        const auto before = document();
        const auto edit = nt::app::findEdit(action);
        QVERIFY(edit);
        const auto after = edit(before, p);
        const double shift = action == u"closeGapAt" ? -2000 : action == u"rippleDeleteSelected" ? -1000 : -200;
        QCOMPARE(startOf(after, "tail"), 4000 + shift);
        if (mode == u"payloadOff" || mode == u"currentOff") {
            QCOMPARE(trackClips(after, "A2"), trackClips(before, "A2"));
        } else {
            QCOMPARE(startOf(after, "lateAudio"), 4000 + shift);
            QVERIFY(trackClips(after, "A2") != trackClips(before, "A2"));
        }
        QCOMPARE(after.value("custom"), before.value("custom"));
    }
    void groupParity_data() {
        QTest::addColumn<QString>("action");
        QTest::addColumn<bool>("implicitState");
        for (const auto& action : rippleNames) {
            if (action == u"closeGapAt") {
                continue;
            }
            QTest::newRow(qPrintable(action + "/payload")) << action << false;
            QTest::newRow(qPrintable(action + "/current")) << action << true;
        }
    }
    void groupParity() {
        QFETCH(QString, action);
        QFETCH(bool, implicitState);
        nt::targeting::TrackTargeting::current().setTrackSyncLocked("A2", false);
        const auto before = document(true);
        auto explicitPayload = payload(action);
        explicitPayload.insert("untargetedTrackIds", QJsonArray{});
        explicitPayload.insert("syncLockOffTrackIds", QJsonArray{"A2"});
        const auto expected = nt::edit::groups::applyGroupEdit(action, before, explicitPayload);
        QVERIFY(expected != before);
        const auto edit = nt::app::findEdit(action);
        QVERIFY(edit);
        QCOMPARE(edit(before, implicitState ? payload(action) : explicitPayload), expected);
        QCOMPARE(trackClips(expected, "A2"), trackClips(before, "A2"));
    }
    void primaryDeterminesTrimRoute() {
        auto before = document();
        auto clips = before.value("clips").toArray();
        auto group = clip("unrelatedGroup", "V1", 6000, 500);
        group.insert("mediaType", "group");
        clips.append(group);
        before.insert("clips", clips);
        nt::targeting::TrackTargeting::current().setTrackSyncLocked("A2", false);
        for (const auto& action : {"rippleTrimClipStart", "rippleTrimClipEnd"}) {
            auto p = payload(action);
            p.insert("selectedIds", QJsonArray{"unrelatedGroup"});
            const auto edit = nt::app::findEdit(action);
            QVERIFY(edit);
            const auto after = edit(before, p);
            QCOMPARE(startOf(after, "tail"), 3800);
            QCOMPARE(trackClips(after, "A2"), trackClips(before, "A2"));
        }
    }
    void refusalsAreRecordedAndWarned() {
        const auto edit = [](QJsonObject raw, const QJsonObject&) { return raw; };
        const auto initial = nt::app::editRefusals().size();
        for (const bool override : {false, true}) {
            const QString name = override ? "test.override" : "test.register";
            const auto add = [&](nt::app::Edit fn) {
                return override ? nt::app::overrideEdit(name, std::move(fn))
                                : nt::app::registerEdit(name, std::move(fn));
            };
            QVERIFY(add(edit));
            const auto accepted = nt::app::editRegistrations().last();
            for (int i = 0; i < 2; ++i) {
                QTest::ignoreMessage(QtWarningMsg, QRegularExpression("^Refused edit: " + name + " .*reason: duplicate$"));
                QVERIFY(!add(edit));
                const auto& refused = nt::app::editRefusals().last();
                QCOMPARE(refused.attempted.name, name);
                QCOMPARE(refused.attempted.override, override);
                QCOMPARE(refused.existingRegistrar, accepted.registrar);
                QCOMPARE(refused.reason, QString("duplicate"));
                QVERIFY(refused.attempted.registrar.startsWith("src/edit/registry/tst_editregistry.cpp:"));
            }
        }
        QCOMPARE(nt::app::editRefusals().size(), initial + 4);
        QTest::ignoreMessage(QtWarningMsg, QRegularExpression("reason: empty name$"));
        QVERIFY(!nt::app::registerEdit({}, edit));
        QCOMPARE(nt::app::editRefusals().last().reason, QString("empty name"));
        QTest::ignoreMessage(QtWarningMsg, QRegularExpression("reason: empty edit$"));
        QVERIFY(!nt::app::overrideEdit("test.empty", {}));
        QCOMPARE(nt::app::editRefusals().last().reason, QString("empty edit"));
    }
};
QTEST_GUILESS_MAIN(TestEditRegistry)
#include "tst_editregistry.moc"
