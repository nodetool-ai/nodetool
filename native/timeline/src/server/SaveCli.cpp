#include "server/SaveCli.h"

#include "model/TimelineModel.h"
#include "server/AutosaveController.h"
#include "server/ServerSource.h"

#include <QCommandLineParser>
#include <QCoreApplication>
#include <QElapsedTimer>
#include <QEventLoop>
#include <QFile>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QSaveFile>
#include <QThread>
#include <QTimer>
#include <QUndoStack>

#include <cstdio>

namespace nt::server {
namespace {

void printLine(const QJsonObject& o) {
    std::printf("%s\n", QJsonDocument(o).toJson(QJsonDocument::Compact).constData());
    std::fflush(stdout);
}

// `CLIP:KEY=JSON`: one field of one clip, as one undo command.
bool setClipField(TimelineModel& model, const QString& spec, QString* error) {
    const int colon = spec.indexOf(u':');
    const int eq = spec.indexOf(u'=', colon + 1);
    if (colon <= 0 || eq <= colon + 1) {
        *error = QStringLiteral("--set-clip-field wants CLIP:KEY=JSON, got %1").arg(spec);
        return false;
    }
    const QString clipId = spec.left(colon);
    const QString key = spec.mid(colon + 1, eq - colon - 1);
    QJsonParseError perr{};
    const QJsonDocument value = QJsonDocument::fromJson("[" + spec.mid(eq + 1).toUtf8() + "]", &perr);
    if (perr.error != QJsonParseError::NoError) {
        *error = QStringLiteral("--set-clip-field: %1 is not JSON").arg(spec.mid(eq + 1));
        return false;
    }
    const QJsonArray before = model.clipsJson();
    QJsonArray after = before;
    for (int i = 0; i < after.size(); ++i) {
        QJsonObject c = after.at(i).toObject();
        if (c.value(u"id").toString() != clipId) continue;
        c.insert(key, value.array().at(0));
        after.replace(i, c);
        model.commitEdit(QStringLiteral("Set %1").arg(key), before, after);
        return true;
    }
    *error = QStringLiteral("no clip %1").arg(clipId);
    return false;
}

}  // namespace

int saveCli(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    QCommandLineParser parser;
    parser.addPositionalArgument(QStringLiteral("source"), QStringLiteral("--server URL --timeline ID"));
    const QCommandLineOption saveOpt(QStringLiteral("save"), QStringLiteral("Load, edit, save, print JSON"));
    const QCommandLineOption moveOpt(QStringLiteral("move-clip"), QStringLiteral("Move a clip: CLIP:MS"),
                                     QStringLiteral("CLIP:MS"));
    const QCommandLineOption fieldOpt(QStringLiteral("set-clip-field"), QStringLiteral("Set a clip field: CLIP:KEY=JSON"),
                                      QStringLiteral("CLIP:KEY=JSON"));
    const QCommandLineOption waitOpt(QStringLiteral("wait-before-save"),
                                     QStringLiteral("Print the load and wait until FILE exists"), QStringLiteral("FILE"));
    const QCommandLineOption autoOpt(QStringLiteral("autosave"), QStringLiteral("Wait for the debounced autosave"));
    const QCommandLineOption reportOpt(QStringLiteral("save-report"), QStringLiteral("Also write the JSON to FILE"),
                                       QStringLiteral("FILE"));
    parser.addOptions({saveOpt, moveOpt, fieldOpt, waitOpt, autoOpt, reportOpt});
    parser.process(app);
    const auto target = serverSaveTarget();
    if (parser.positionalArguments().size() != 1 || !target) {
        std::fprintf(stderr, "usage: nodetool-timeline --server URL --timeline ID --save [edits]\n");
        return 2;
    }
    QJsonObject out;
    const auto finish = [&](int code) {
        printLine(out);
        if (parser.isSet(reportOpt)) {
            QSaveFile f(parser.value(reportOpt));
            if (f.open(QIODevice::WriteOnly)) {
                f.write(QJsonDocument(out).toJson(QJsonDocument::Compact));
                f.commit();
            }
        }
        return code;
    };

    const auto loaded = loadTimelineSource(parser.positionalArguments().first());
    if (!loaded.timeline) {
        out.insert(QStringLiteral("error"), loaded.error);
        return finish(1);
    }
    const QString base = loaded.timeline->raw.value(u"updatedAt").toString();
    TimelineModel model;
    model.setTimeline(*loaded.timeline);
    AutosaveController save(*target, model.undoStack(), [&model]() { return model.timeline().raw; }, base);
    save.setAutosave(parser.isSet(autoOpt));
    out.insert(QStringLiteral("baseUpdatedAt"), base);

    QString error;
    for (const QString& spec : parser.values(moveOpt)) {
        const int colon = spec.lastIndexOf(u':');
        bool ok = false;
        const double ms = spec.mid(colon + 1).toDouble(&ok);
        if (colon <= 0 || !ok || !model.moveClip(spec.left(colon), ms)) {
            out.insert(QStringLiteral("error"), QStringLiteral("--move-clip %1 did not apply").arg(spec));
            return finish(1);
        }
    }
    for (const QString& spec : parser.values(fieldOpt)) {
        if (!setClipField(model, spec, &error)) {
            out.insert(QStringLiteral("error"), error);
            return finish(1);
        }
    }
    out.insert(QStringLiteral("dirtyBefore"), save.dirty());
    out.insert(QStringLiteral("edits"), model.undoStack()->count());

    if (parser.isSet(waitOpt)) {
        printLine(QJsonObject{{QStringLiteral("loaded"), base}});
        QElapsedTimer waited;
        waited.start();
        while (!QFileInfo::exists(parser.value(waitOpt))) {
            if (waited.elapsed() > 120000) {
                out.insert(QStringLiteral("error"), QStringLiteral("timed out waiting for %1").arg(parser.value(waitOpt)));
                return finish(1);
            }
            QThread::msleep(20);
        }
    }

    SaveResult r;
    if (parser.isSet(autoOpt)) {
        // The debounced save: the edits above started the 750 ms timer.
        QEventLoop loop;
        QObject::connect(&save, &AutosaveController::saved, &loop, [&](const QString& updatedAt) {
            r.ok = true;
            r.updatedAt = updatedAt;
            r.stripped = save.stripped();
            loop.quit();
        });
        QObject::connect(&save, &AutosaveController::conflictDetected, &loop, [&]() {
            r.conflict = true;
            loop.quit();
        });
        QElapsedTimer t;
        t.start();
        QTimer::singleShot(10000, &loop, &QEventLoop::quit);
        loop.exec();
        out.insert(QStringLiteral("autosaveAfterMs"), static_cast<double>(t.elapsed()));
        if (!r.ok && !r.conflict) r.error = save.lastError().isEmpty() ? QStringLiteral("no autosave") : save.lastError();
    } else {
        r = save.saveNow();
    }
    out.insert(QStringLiteral("ok"), r.ok);
    out.insert(QStringLiteral("conflict"), r.conflict);
    out.insert(QStringLiteral("updatedAt"), r.updatedAt);
    out.insert(QStringLiteral("stripped"), QJsonArray::fromStringList(r.stripped));
    out.insert(QStringLiteral("dirtyAfter"), save.dirty());
    if (!r.error.isEmpty()) out.insert(QStringLiteral("error"), r.error);
    if (!r.keptCopy.isEmpty()) out.insert(QStringLiteral("keptCopy"), r.keptCopy);
    // The document as this client holds it now, for the round-trip check.
    out.insert(QStringLiteral("document"), documentForSave(model.timeline().raw));
    return finish(r.ok ? 0 : r.conflict ? 3 : 1);
}

}  // namespace nt::server
