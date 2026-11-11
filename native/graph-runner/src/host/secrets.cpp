// `__host.secrets`: the secrets the embedder hands to node code, from
// HostOptions::secrets. context.getSecret(key) reads them. The runner never
// looks at the process environment or a settings file.
//
//   get(key)  -> string, or null when the embedder set none
#include "host/capabilities.h"

#include <memory>

namespace gr::host {

void installSecrets(js::Engine& e, const js::Value& object, const HostOptions& options) {
  // native-rules #1: map shared by one host function, no justification
  auto secrets = std::make_shared<std::map<std::string, std::string>>(options.secrets);
  e.set(object, "get", e.function("get", 1, [secrets](js::Engine& en, const std::vector<js::Value>& a) {
    if (a.empty()) return en.null();
    auto it = secrets->find(en.toString(a[0]));
    return it == secrets->end() ? en.null() : en.string(it->second);
  }));
}

}  // namespace gr::host
