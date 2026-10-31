// NodeToolVstHost — hosts VST3 instruments for NodeTool's timeline in a separate
// process, so a plug-in crash never takes down the editor.
//
// Requests arrive on stdin and replies leave on stdout, one JSON object per
// line. A request carries an "id" that its reply repeats:
//
//   {"id":1,"cmd":"hello"}                     -> {"id":1,"ok":true,"protocol":1,"version":"..."}
//   {"id":2,"cmd":"scan","dirs":[...]}         -> {"id":2,"ok":true,"plugins":[{uid,name,vendor,version,path,isInstrument}]}
//   {"id":3,"cmd":"render","instance":"t1","path":P,"uid":U,"state":B64|null,
//    "sampleRate":48000,"frames":N,"events":[{pitch,velocity,startFrame,gateOffFrame}],
//    "out":"/tmp/x.f32"}                       -> {"id":3,"ok":true,"channels":2,"frames":N}
//      (out holds planar float32 LE: every left frame, then every right frame)
//   {"id":4,"cmd":"openEditor","instance":"t1","path":P,"uid":U,"state":B64,"title":T}
//                                              -> {"id":4,"ok":true,"hasEditor":true}
//   {"id":5,"cmd":"closeEditor","instance":"t1"} / {"id":6,"cmd":"dispose","instance":"t1"}
//   {"id":7,"cmd":"getState","instance":"t1"}  -> {"id":7,"ok":true,"state":B64}
//   {"cmd":"quit"}
//
// Failures reply {"id":n,"ok":false,"error":"..."}. Unrequested events:
//   {"event":"state","instance":"t1","state":B64}         the editor changed the sound
//   {"event":"editorClosed","instance":"t1","state":B64}  the user closed the window
//
// While an instance's editor is open the window is the source of truth: a
// render's "state" is not applied over it, so a render cannot undo a tweak the
// caller has not heard about yet.
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_gui_basics/juce_gui_basics.h>
#include <iostream>
#include <thread>
#include "VstHost.h"
#if JUCE_MAC
#include "MacApplication.h"
#endif

using namespace juce;
using namespace vsthost;

static constexpr int PROTOCOL = 1;
static std::mutex outMutex;

static void send(const var& message) {
    const auto line = JSON::toString(message, true);
    std::lock_guard<std::mutex> guard(outMutex);
    std::cout << line << std::endl;
}

static var object() { return var(new DynamicObject()); }

static void reply(const var& id, var body) {
    body.getDynamicObject()->setProperty("id", id);
    body.getDynamicObject()->setProperty("ok", true);
    send(body);
}

static void fail(const var& id, const String& error) {
    auto body = object();
    body.getDynamicObject()->setProperty("id", id);
    body.getDynamicObject()->setProperty("ok", false);
    body.getDynamicObject()->setProperty("error", error);
    send(body);
}

static void event(const String& name, const String& instance, const String& state) {
    auto body = object();
    body.getDynamicObject()->setProperty("event", name);
    body.getDynamicObject()->setProperty("instance", instance);
    body.getDynamicObject()->setProperty("state", state);
    send(body);
}

class Host;

class EditorWindow : public DocumentWindow {
public:
    EditorWindow(const String& title, AudioProcessorEditor* editor, std::function<void()> onClose)
        : DocumentWindow(title, Colours::black, DocumentWindow::closeButton | DocumentWindow::minimiseButton),
          onClose_(std::move(onClose)) {
        setUsingNativeTitleBar(true);
        setContentOwned(editor, true);
        setResizable(editor->isResizable(), false);
        centreWithSize(getWidth(), getHeight());
        setVisible(true);
        toFront(true);
    }
    void closeButtonPressed() override { if (onClose_) onClose_(); }

private:
    std::function<void()> onClose_;
};

class Host : private Timer {
public:
    Host() { startTimer(400); }
    ~Host() override {
        stopTimer();
        editors_.clear();
        instances_.clear();
    }

    // Runs on the message thread.
    void handle(const var& req) {
        const var id = req["id"];
        const String cmd = req["cmd"].toString();
        const String key = req["instance"].toString();
        if (cmd == "hello") {
            auto body = object();
            body.getDynamicObject()->setProperty("protocol", PROTOCOL);
            body.getDynamicObject()->setProperty("version", String(NODETOOL_VSTHOST_VERSION));
            body.getDynamicObject()->setProperty("platform", SystemStats::getOperatingSystemName());
            reply(id, body);
        } else if (cmd == "scan") {
            scanAsync(id, req);
        } else if (cmd == "render") {
            String error;
            auto inst = ensure(key, req, error, false);
            if (!inst) { fail(id, error); return; }
            renderAsync(id, std::move(inst), req, editors_.count(key) == 0);
        } else if (cmd == "openEditor") {
            String error;
            auto inst = ensure(key, req, error, true);
            if (!inst) { fail(id, error); return; }
            if (!openEditor(key, *inst, req["title"].toString(), error)) { fail(id, error); return; }
            auto body = object();
            body.getDynamicObject()->setProperty("hasEditor", true);
            reply(id, body);
        } else if (cmd == "closeEditor") {
            closeEditor(key, false);
            reply(id, object());
        } else if (cmd == "getState") {
            auto it = instances_.find(key);
            if (it == instances_.end()) { fail(id, "Unknown instance " + key); return; }
            auto body = object();
            body.getDynamicObject()->setProperty("state", it->second->getState());
            reply(id, body);
        } else if (cmd == "dispose") {
            closeEditor(key, false);
            // A render still running keeps its instance until it finishes.
            instances_.erase(key);
            reply(id, object());
        } else if (cmd == "quit") {
            MessageManager::getInstance()->stopDispatchLoop();
        } else {
            fail(id, "Unknown command " + cmd);
        }
    }

private:
    // The instance for `key`, loaded with the requested plug-in. `applyState`
    // sets the request's state now; a render applies it on its own thread
    // instead, under the lock, so two queued renders cannot swap states.
    std::shared_ptr<Instance> ensure(const String& key, const var& req, String& error, bool applyState) {
        if (key.isEmpty()) { error = "Missing instance"; return nullptr; }
        const String path = req["path"].toString(), uid = req["uid"].toString();
        auto& slot = instances_[key];
        if (!slot || slot->path() != path || (uid.isNotEmpty() && slot->uid() != uid)) {
            closeEditor(key, false);
            auto inst = std::make_shared<Instance>();
            if (!inst->load(path, uid, error)) { instances_.erase(key); return nullptr; }
            slot = std::move(inst);
        }
        const bool editing = editors_.count(key) > 0;
        if (applyState && !editing && !slot->setState(req["state"].toString(), error)) return nullptr;
        return slot;
    }

    void scanAsync(const var& id, const var& req) {
        StringArray dirs;
        if (auto* arr = req["dirs"].getArray())
            for (auto& d : *arr) dirs.add(d.toString());
        const bool all = (bool)req["includeEffects"];
        std::thread([id, dirs, all] {
            Array<var> list;
            for (auto& p : scan(dirs, !all)) {
                auto o = object();
                auto* d = o.getDynamicObject();
                d->setProperty("uid", p.uid);
                d->setProperty("name", p.name);
                d->setProperty("vendor", p.vendor);
                d->setProperty("version", p.version);
                d->setProperty("path", p.path);
                d->setProperty("isInstrument", p.isInstrument);
                list.add(o);
            }
            auto body = object();
            body.getDynamicObject()->setProperty("plugins", list);
            reply(id, body);
        }).detach();
    }

    void renderAsync(const var& id, std::shared_ptr<Instance> inst, const var& req, bool applyState) {
        std::vector<NoteEvent> events;
        if (auto* arr = req["events"].getArray())
            for (auto& e : *arr)
                events.push_back({ (int)e["pitch"], (int)e["velocity"], (int64)e["startFrame"], (int64)e["gateOffFrame"] });
        const double rate = (double)req["sampleRate"];
        const int64 frames = (int64)req["frames"];
        const File out(req["out"].toString());
        if (!File::isAbsolutePath(req["out"].toString())) { fail(id, "Render output must be an absolute path"); return; }
        const String state = req["state"].toString();
        std::thread([id, inst = std::move(inst), events, rate, frames, out, state, applyState]() mutable {
            [&] {
                AudioBuffer<float> buffer;
                String error;
                std::lock_guard<std::recursive_mutex> guard(inst->lock);
                if (applyState && !inst->setState(state, error)) { fail(id, error); return; }
                if (!inst->render(rate, frames, events, buffer, error)) { fail(id, error); return; }
                if (!writePlanarF32(buffer, out)) { fail(id, "Cannot write " + out.getFullPathName()); return; }
                auto body = object();
                body.getDynamicObject()->setProperty("channels", 2);
                body.getDynamicObject()->setProperty("frames", frames);
                reply(id, body);
            }();
            // A disposed instance is destroyed here, on the message thread
            // plug-ins expect, rather than on this worker.
            MessageManager::callAsync([keep = std::move(inst)] {});
        }).detach();
    }

    bool openEditor(const String& key, Instance& inst, const String& title, String& error) {
        if (auto it = editors_.find(key); it != editors_.end()) {
            it->second.window->toFront(true);
            return true;
        }
        auto* plugin = inst.plugin();
        if (!plugin->hasEditor()) { error = plugin->getName() + " has no editor"; return false; }
        auto* editor = plugin->createEditorIfNeeded();
        if (!editor) { error = plugin->getName() + " did not create its editor"; return false; }
       #if JUCE_MAC
        Process::setDockIconVisible(true);
       #endif
        Process::makeForegroundProcess();
        Editor e;
        e.window = std::make_unique<EditorWindow>(title.isNotEmpty() ? title : plugin->getName(), editor,
            [this, key] { MessageManager::callAsync([this, key] { closeEditor(key, true); }); });
        e.lastState = inst.getState();
        editors_[key] = std::move(e);
        return true;
    }

    void closeEditor(const String& key, bool announce) {
        auto it = editors_.find(key);
        if (it == editors_.end()) return;
        it->second.window.reset();
        editors_.erase(it);
        if (announce)
            if (auto inst = instances_.find(key); inst != instances_.end())
                event("editorClosed", key, inst->second->getState());
    }

    // The editor changes the sound by setting parameters inside the plug-in;
    // poll its state and announce each change.
    void timerCallback() override {
        for (auto& [key, editor] : editors_) {
            auto inst = instances_.find(key);
            if (inst == instances_.end()) continue;
            std::unique_lock<std::recursive_mutex> guard(inst->second->lock, std::try_to_lock);
            if (!guard.owns_lock()) continue;
            const auto state = inst->second->getState();
            if (state != editor.lastState) {
                editor.lastState = state;
                event("state", key, state);
            }
        }
    }

    struct Editor {
        std::unique_ptr<EditorWindow> window;
        String lastState;
    };
    std::map<String, std::shared_ptr<Instance>> instances_;
    std::map<String, Editor> editors_;
};

int main(int, char**) {
   #if JUCE_MAC
    initialiseMacApplication();
   #endif
    ScopedJuceInitialiser_GUI init;
    auto host = std::make_unique<Host>();
    auto* hostPtr = host.get();
    // stdin closing (the caller exited) ends the helper.
    std::thread reader([hostPtr] {
        std::string line;
        while (std::getline(std::cin, line)) {
            if (line.empty()) continue;
            const var req = JSON::parse(String::fromUTF8(line.c_str()));
            if (!req.isObject()) { fail(var(), "Request is not a JSON object"); continue; }
            MessageManager::callAsync([hostPtr, req] { hostPtr->handle(req); });
            if (req["cmd"].toString() == "quit") return;
        }
        MessageManager::callAsync([] { MessageManager::getInstance()->stopDispatchLoop(); });
    });
    MessageManager::getInstance()->runDispatchLoop();
    host.reset();
    reader.detach();
    return 0;
}
