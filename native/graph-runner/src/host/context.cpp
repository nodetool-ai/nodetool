#include "host/context.h"
#include "host/context_async.h"
#include "host/sandbox_ocr.h"
#include "kernel/async_jobs.h"
#include "kernel/job_inputs.h"
#include <array>
#include <cmath>
#include <random>
#include <memory>
#include <stdexcept>

namespace gr::host {
void checkGrantMaps(const ContextOptions& options) {
  for (const auto& entry : options.asyncOperations) {
    if (options.operations.contains(entry.first)) {
      throw std::invalid_argument("Context operation '" + entry.first +
                                  "' is granted both synchronously and asynchronously");
    }
  }
}

void installContext(js::Engine& e, const js::Value& object, const ContextOptions& options) {
  checkGrantMaps(options);
  // native-rules #1: grants shared by the context host functions, no justification
  auto grants = std::make_shared<ContextOptions>(options);
  // Each callback is shared by this table and by every call still running or
  // retained by the embedder, which can outlive the engine and the runner.
  std::map<std::string, std::shared_ptr<const ContextOptions::AsyncCallback>> asyncGrants;
  for (auto& [name, callback] : grants->asyncOperations) {
    asyncGrants.emplace(name, std::make_shared<const ContextOptions::AsyncCallback>(std::move(callback)));
  }
  grants->asyncOperations.clear();
  auto binding = RunBinding::of(e);
  installSandboxOcr(e,object,options.ocrDataDirectory,options.cancelled);
  // Shared by both transports, the run cleanup, and the converter of every
  // asynchronous call waiting to settle, so the call count and limits are
  // one budget.
  auto rules = std::make_shared<ContextCallRules>(options);
  e.addRunCleanup([rules] { rules->resetCalls(); });
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
  e.set(object, "has", e.function("has", 1, [grants, asyncGrants](js::Engine& en, const std::vector<js::Value>& args) {
    if (args.empty()) return en.boolean(false);
    const auto operation = en.toString(args[0]);
    return en.boolean(grants->operations.contains(operation) || asyncGrants.contains(operation));
  }));
  // Which transport a granted operation uses: callAsync when true.
  e.set(object, "isAsync", e.function("isAsync", 1, [asyncGrants](js::Engine& en, const std::vector<js::Value>& args) {
    return en.boolean(!args.empty() && asyncGrants.contains(en.toString(args[0])));
  }));
  e.set(object, "aborted", e.function("aborted", 0, [grants](js::Engine& en, const std::vector<js::Value>&) {
    return en.boolean(grants->cancelled && grants->cancelled());
  }));
  // Posted messages bypass ContextCallRules: no call count and no payload
  // limit, only cancellation and their own byte cap. The text is passed on
  // unparsed to the "message" operation.
  e.set(object, "postMessage", e.function("postMessage", 1, [grants](js::Engine& en, const std::vector<js::Value>& args) {
    if (args.size() != 1) throw std::invalid_argument("Context postMessage requires a JSON text");
    const auto found = grants->operations.find("message");
    if (found == grants->operations.end()) throw std::runtime_error("ProcessingContext service 'message' is not granted");
    if (grants->cancelled && grants->cancelled()) throw std::runtime_error("Run cancelled");
    const auto text = en.toString(args[0]);
    if (text.size() > grants->maxMessageBytes) throw std::runtime_error("Context message size limit exceeded");
    found->second(text);
    return en.string("null");
  }));
  // Both transports check, in this order: the grant, cancellation, the call
  // count, payload conversion and the request size. Each transport refuses
  // the other map's names.
  e.set(object, "call", e.function("call", 2, [grants, asyncGrants, rules](js::Engine& en, const std::vector<js::Value>& args) {
    if (args.size() != 2) throw std::invalid_argument("Context call requires operation and JSON payload");
    const auto operation = en.toString(args[0]);
    if (asyncGrants.contains(operation)) {
      throw std::runtime_error("ProcessingContext service '" + operation + "' is granted for asynchronous calls only");
    }
    const auto& callback = ContextCallRules::grant(grants->operations, operation);
    rules->admit(operation);
    const auto input = en.toString(args[1]);
    rules->checkRequestSize(input.size());
    const auto output = callback(input);
    rules->checkResponse(operation, output.size());
    return en.string(output);
  }));
  // Returns a promise. Request-side failures throw at the call, as call()
  // does. The callback runs on the run's I/O lane, and its outcome settles
  // the promise as a macrotask, after the response checks on the worker.
  e.set(object, "callAsync", e.function("callAsync", 2, [grants, asyncGrants, rules, binding](js::Engine& en, const std::vector<js::Value>& args) {
    if (args.size() != 2) throw std::invalid_argument("Context call requires operation and JSON payload");
    const auto operation = en.toString(args[0]);
    if (grants->operations.contains(operation)) {
      throw std::runtime_error("ProcessingContext service '" + operation + "' is granted for synchronous calls only");
    }
    const auto& callback = ContextCallRules::grant(asyncGrants, operation);
    rules->admit(operation);
    AsyncRun* run = binding->run();
    // The request's bytes are charged to the run before they are copied
    // (design section 4.7). A string longer than the payload limit fails
    // before its copy as well.
    nodetool::jobs::Reservation reservation = run ? run->reserve() : nodetool::jobs::Reservation{};
    std::string input;
    if (run && en.isString(args[1])) {
      const uint64_t bound = stringBytesBound(en, args[1], "Context payload");
      if (bound / 3 > grants->maxPayloadBytes) rules->checkRequestSize(bound / 3);
      input = snapshotString(en, args[1], "Context payload", reservation);
    } else {
      input = en.toString(args[1]);
      if (run) reservation.reserveSnapshot(input.size());
    }
    rules->checkRequestSize(input.size());
    if (!run) throw std::runtime_error("Asynchronous context calls need a running graph");
    nodetool::jobs::JobExecutor& io = *binding->io();
    // Cleanup keeps running through the run's cancellation; every other call
    // rejects with an AbortError when the cancellation begins.
    const bool cancellable = !ContextCallRules::isCleanup(operation);
    return run->submit(io,
                       makeContextJob(operation, std::move(input), callback, io.stopRelay(), run->identity(),
                                      grants->maxPayloadBytes),
                       [rules, operation](ResultConversion& conversion) {
                         const auto* response = static_cast<ContextResponse*>(conversion.payload());
                         rules->checkResponse(operation, response->bytes);
                         conversion.chargeCopy(response->text.size());
                         return conversion.engine().string(response->text);
                       },
                       cancellable, std::move(reservation));
  }));
}
}
