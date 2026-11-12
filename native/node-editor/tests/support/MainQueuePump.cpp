// Qt Multimedia on macOS (AVFoundation) reports loaded media on the main
// dispatch queue. The offscreen platform runs a GLib or UNIX event loop that
// never drains that queue, so a player would stay in LoadingMedia. A timer on
// the UI thread drains the queue in every test binary.
#include <QAbstractEventDispatcher>
#include <QCoreApplication>
#include <QTimer>
#include <CoreFoundation/CoreFoundation.h>

namespace {
void startMainQueuePump() {
    // Parented to the application, which destroys it. UI thread only.
    auto *timer = new QTimer(QCoreApplication::instance());
    timer->setInterval(5);
    QObject::connect(timer, &QTimer::timeout, timer, [] {
        // The Core Foundation dispatcher of the cocoa platform drains the queue itself.
        const auto *dispatcher = QCoreApplication::eventDispatcher();
        if (dispatcher && QByteArray(dispatcher->metaObject()->className()).contains("CoreFoundation")) { return; }
        CFRunLoopRunInMode(kCFRunLoopDefaultMode, 0, true);
    });
    timer->start();
}
}
Q_COREAPP_STARTUP_FUNCTION(startMainQueuePump)
