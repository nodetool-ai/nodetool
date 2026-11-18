// nodetool-parity-host: loads one node editor QML component at a time with
// fixture interfaces and answers parity harness commands, one JSON object per
// line on stdin and stdout. See native/parity/README.md.
#include "ParityHost.h"

#include <QGuiApplication>
#include <QJsonDocument>
#include <QPointer>
#include <QQmlExtensionPlugin>
#include <QThread>
#include <cstdio>
#include <deque>
#include <iostream>
#include <memory>
#include <string>

Q_IMPORT_QML_PLUGIN(NodeTool_NodeEditorPlugin)
Q_IMPORT_QML_PLUGIN(NodeTool_ChatPlugin)
Q_IMPORT_QML_PLUGIN(NodeTool_ModelPickerPlugin)

namespace {

void reply(const QJsonObject &object) {
    std::fputs(QJsonDocument(object).toJson(QJsonDocument::Compact).append('\n').constData(), stdout);
    std::fflush(stdout);
}

// Runs commands one at a time in arrival order. A command spins the event
// loop while it waits for the component to settle, so a command that arrives
// meanwhile waits in the queue instead of running inside the current one.
//
// UI thread only.
class CommandPump : public QObject {
public:
    void push(const QJsonObject &command) {
        queue_.push_back(command);
        pump();
    }

private:
    void pump() {
        if (busy_) {
            return;
        }
        busy_ = true;
        while (!queue_.empty()) {
            const auto command = queue_.front();
            queue_.pop_front();
            if (command["cmd"].toString() == "quit") {
                QJsonObject done{{"ok", true}};
                if (command.contains("id")) {
                    done["id"] = command["id"];
                }
                host_.reset();
                reply(done);
                QGuiApplication::quit();
                queue_.clear();
                break;
            }
            reply(host_->handle(command));
        }
        busy_ = false;
    }

    std::unique_ptr<nodetool::parity::ParityHost> host_ = std::make_unique<nodetool::parity::ParityHost>();
    std::deque<QJsonObject> queue_;
    bool busy_ = false;
};

}  // namespace

int main(int argc, char **argv) {
    if (qEnvironmentVariableIsEmpty("QT_QUICK_BACKEND")) {
        qputenv("QT_QUICK_BACKEND", "software");
    }
    QGuiApplication app(argc, argv);
    QGuiApplication::setOrganizationName("NodeToolParity");
    QGuiApplication::setApplicationName("parity-host");

    // Owned by main and destroyed after the reader thread is joined.
    auto pump = std::make_unique<CommandPump>();
    const QPointer<CommandPump> target(pump.get());

    // Reads stdin on its own thread, because a blocking read cannot share the
    // UI thread with the event loop. Each command crosses to the UI thread by
    // value in a queued call, which checks the QPointer before use. The thread
    // ends at end of input or after it forwards quit, and main joins it.
    std::unique_ptr<QThread> reader(QThread::create([target] {
        std::string line;
        while (std::getline(std::cin, line)) {
            const auto command = QJsonDocument::fromJson(QByteArray::fromStdString(line)).object();
            QMetaObject::invokeMethod(qApp, [target, command] {
                if (target) {
                    target->push(command);
                }
            }, Qt::QueuedConnection);
            if (command["cmd"].toString() == "quit") {
                return;
            }
        }
        QMetaObject::invokeMethod(qApp, [] { QGuiApplication::quit(); }, Qt::QueuedConnection);
    }));
    reader->start();
    const int code = QGuiApplication::exec();
    reader->wait();
    pump.reset();
    return code;
}
