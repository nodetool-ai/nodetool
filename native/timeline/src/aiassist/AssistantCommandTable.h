#pragma once
// Which registered commands the Assistant may run, and with what parameters. The allow list covers
// document edits and view changes. The deny list says why each other command stays out: it writes
// files, reaches a URL, changes a setting, starts paid generation, or opens a dialog with no
// headless form.
#include <QHash>
#include <QJsonObject>
#include <QList>
#include <QString>
#include <QStringList>
#include <functional>
#include <limits>

class ClipGestureController;

namespace nt::aiassist::commands {
enum class ParamKind {
    // Set the editor up before an action runs, as a person would.
    Selection,    // clip ids that become the selection
    EditClip,     // with EditEdge: the edit point
    EditEdge,
    Playhead,     // time the playhead moves to
    RangeIn,
    RangeOut,
    GapTrack,     // with GapTime: the gap that becomes selected
    GapTime,
    // Go into the action's context under `key`.
    ContextClip,
    ContextTrack,
    ContextMarker, // also sets timeMs to the marker's time
    ContextTime,
    // Go into an edit's payload under `key`, or the parameter's own name.
    ClipId,
    ClipIds,
    TrackId,
    TrackIds,
    MarkerIds,
    EffectId,     // resolved in the effects of the track or clip before it, else the master's
    Number,
    Boolean,
    Text,
    Choice,
    Patch,        // an object limited to `choices` fields, each of the type the document needs
};
struct Param {
    QString name;
    ParamKind kind;
    bool required = false;
    QString description = {};
    QStringList choices = {};
    QString key = {};
    double min = -std::numeric_limits<double>::infinity();
    double max = std::numeric_limits<double>::infinity();
};
enum class Runs { Action, Edit };
// What must be true before the command can run: the reason it can't, or empty.
using Need = std::function<QString(ClipGestureController&)>;
struct Command {
    QString id;
    Runs runs = Runs::Action;
    QList<Param> params = {};
    QString label = {};       // an edit has no menu entry or key action to take a label from
    Need need = {};           // an action defaults to its menu bar entry's predicate
    QJsonObject fixed = {};   // payload fields the caller doesn't choose
    bool linked = false;      // pass the editor's Linked Selection
    bool sourceLimit = false; // pass how long the clip's source is
    bool sourceLimits = false;
    bool background = false;  // finishes later, so its edit arrives after the result
    bool mustChange = false;  // the handler returns true even when it refuses
    bool editsSelection = false; // the handler changes the selected clips, so locks apply to them
};
const QList<Command>& allowedCommands();
// id -> why the Assistant can't run it.
const QHash<QString, QString>& deniedCommands();
}
