#include "platform/ProcessActivity.h"

#import <Foundation/Foundation.h>

namespace nt {

ProcessActivity::ProcessActivity(const char* reason) {
    const NSActivityOptions options = NSActivityUserInitiated | NSActivityLatencyCritical;
    id<NSObject> token = [[NSProcessInfo processInfo] beginActivityWithOptions:options
                                                                        reason:[NSString stringWithUTF8String:reason]];
    m_token = (__bridge_retained void*)token;
}

ProcessActivity::~ProcessActivity() {
    if (!m_token) return;
    id<NSObject> token = (__bridge_transfer id<NSObject>)m_token;
    [[NSProcessInfo processInfo] endActivity:token];
    m_token = nullptr;
}

}  // namespace nt
