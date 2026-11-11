#include "platform/SchedulingDiagnostics.h"

#include <QWindow>

#import <AppKit/AppKit.h>

#include <chrono>
#include <cstdio>

namespace nt::diag {
namespace {

double nowMs() {
    return std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now().time_since_epoch()).count();
}

std::string occlusion(NSWindow* window) {
    return (window.occlusionState & NSWindowOcclusionStateVisible) ? "visible" : "occluded";
}

}  // namespace

std::string watchOcclusion(QWindow* window) {
    NSView* view = (__bridge NSView*)reinterpret_cast<void*>(window->winId());
    NSWindow* nsWindow = view.window;
    if (!nsWindow) return "unknown";
    [[NSNotificationCenter defaultCenter] addObserverForName:NSWindowDidChangeOcclusionStateNotification
                                                      object:nsWindow
                                                       queue:nil
                                                  usingBlock:^(NSNotification* note) {
                                                    NSWindow* w = note.object;
                                                    std::fprintf(stderr, "diag: %.1f ms occlusion %s\n", nowMs(),
                                                                 occlusion(w).c_str());
                                                  }];
    return occlusion(nsWindow);
}

}  // namespace nt::diag
