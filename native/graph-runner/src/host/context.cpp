#include "host/context.h"
#include "host/sandbox_ocr.h"
#include <array>
#include <cmath>
#include <random>
#include <memory>
#include <stdexcept>

namespace gr::host {
void installContext(js::Engine& e, const js::Value& object, const ContextOptions& options) {
  auto grants = std::make_shared<ContextOptions>(options);
  installSandboxOcr(e,object,options.ocrDataDirectory,options.cancelled);
  auto calls = std::make_shared<size_t>(0);
  e.addRunCleanup([calls] { *calls=0; });
  e.set(object,"randomBytes",e.function("randomBytes",1,[](js::Engine& en,const std::vector<js::Value>& args){
    const auto n=args.empty()?0:en.toNumber(args[0]);
    if(!std::isfinite(n) || n<0 || n>65536 || std::trunc(n)!=n)throw std::runtime_error("Random byte length must be an integer from 0 to 65536");
    std::vector<uint8_t> bytes(static_cast<size_t>(n));std::random_device entropy;
    for(auto& byte:bytes)byte=static_cast<uint8_t>(entropy());
    return en.bytes(bytes.data(),bytes.size());
  }));
  e.set(object, "randomUUID", e.function("randomUUID", 0, [](js::Engine& en, const std::vector<js::Value>&) {
    std::random_device entropy;
    std::array<unsigned char,16> bytes{};
    for (auto& byte : bytes) byte = static_cast<unsigned char>(entropy());
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    constexpr char hex[] = "0123456789abcdef";
    std::string uuid;
    for (size_t i = 0; i < bytes.size(); ++i) {
      if (i == 4 || i == 6 || i == 8 || i == 10) uuid += '-';
      uuid += hex[bytes[i] >> 4]; uuid += hex[bytes[i] & 15];
    }
    return en.string(uuid);
  }));
  e.set(object,"userId",e.function("userId",0,[grants](js::Engine& en,const std::vector<js::Value>&){return en.string(grants->userId);}));
  e.set(object,"environment",e.function("environment",0,[grants](js::Engine& en,const std::vector<js::Value>&){return en.string(grants->environmentJson);}));
  e.set(object,"modules",e.function("modules",0,[grants](js::Engine& en,const std::vector<js::Value>&){return en.string(grants->sandboxModuleResolutionJson);}));
  e.set(object,"tools",e.function("tools",0,[grants](js::Engine& en,const std::vector<js::Value>&){return en.string(grants->toolDefinitionsJson);}));
  e.set(object, "modelOptions", e.function("modelOptions", 0, [grants](js::Engine& en, const std::vector<js::Value>&) {
    return en.string(grants->modelOptionsJson);
  }));
  e.set(object, "has", e.function("has", 1, [grants](js::Engine& en, const std::vector<js::Value>& args) {
    return en.boolean(!args.empty() && grants->operations.contains(en.toString(args[0])));
  }));
  e.set(object, "aborted", e.function("aborted", 0, [grants](js::Engine& en, const std::vector<js::Value>&) {
    return en.boolean(grants->cancelled && grants->cancelled());
  }));
  e.set(object, "call", e.function("call", 2, [grants, calls](js::Engine& en, const std::vector<js::Value>& args) {
    if (args.size() != 2) throw std::invalid_argument("Context call requires operation and JSON payload");
    const auto operation = en.toString(args[0]);
    auto found = grants->operations.find(operation);
    if (found == grants->operations.end()) throw std::runtime_error("ProcessingContext service '" + operation + "' is not granted");
    // Stream cleanup is permitted after cancellation and after the call budget.
    const bool cleanup = operation.starts_with("provider:") && operation.ends_with(":close");
    if (!cleanup && grants->cancelled && grants->cancelled()) throw std::runtime_error("Run cancelled");
    if (!cleanup && ++*calls > grants->maxCalls) throw std::runtime_error("Context call limit exceeded");
    const auto input = en.toString(args[1]);
    if (input.size() > grants->maxPayloadBytes) throw std::runtime_error("Context request size limit exceeded");
    const auto output = found->second(input);
    if (!cleanup && grants->cancelled && grants->cancelled()) throw std::runtime_error("Run cancelled");
    if (output.size() > grants->maxPayloadBytes) throw std::runtime_error("Context response size limit exceeded");
    return en.string(output);
  }));
}
}
