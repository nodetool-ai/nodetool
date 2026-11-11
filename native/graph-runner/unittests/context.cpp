#include "host/context.h"
#include "host/sandbox.h"
#include "kernel/guest.h"
#include "sanitizer_build.h"
#include <algorithm>
#include <atomic>
#include <chrono>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <iterator>
#include <nlohmann/json.hpp>
#include <stdexcept>
#include <string>
#include <thread>
using Json = nlohmann::json;
int main(int argc, char **argv) {
  try {
    if (argc != 2)
      throw std::runtime_error("Expected fixture bundle");
    auto engine = gr::js::createQuickJsEngine();
    const auto temp =
        std::filesystem::temp_directory_path() /
        ("g5-context-" +
         std::to_string(
             std::chrono::steady_clock::now().time_since_epoch().count()));
    if (!std::filesystem::create_directory(temp))
      throw std::runtime_error("Cannot create isolated fixture workspace");
    struct RemoveDirectory {
      std::filesystem::path path;
      ~RemoveDirectory() {
        std::error_code error;
        std::filesystem::remove_all(path, error);
      }
    } cleanup{temp};
    gr::HostOptions options;
    options.workspaceDir = temp.string();
    options.assetDir = (temp / "assets").string();
    std::filesystem::create_directory(options.assetDir);
    options.secrets["ALLOWED"] = "fixture-secret";
    gr::Guest guest(*engine, options);
    auto host = engine->get(engine->global(), "__host");
    auto context = engine->object();
    std::atomic<bool> cancelled{false};
    int closed = 0, next = 0, httpCalls = 0, modelResourceDenials = 0;
    gr::host::ContextOptions grants;
    grants.cancelled = [&] { return cancelled.load(); };
    grants.ocrDataDirectory = GR_TEST_TESSDATA;
    grants.operations["http:request"] = [&](const std::string &payload) {
      const auto request = Json::parse(payload);
      if (request.at("url") != "https://fixture.invalid/echo") {
        ++modelResourceDenials;
        throw std::runtime_error("HTTP resource is not granted: " +
                                 request.at("url").get<std::string>());
      }
      ++httpCalls;
      if (request.at("url") != "https://fixture.invalid/echo" ||
          request.at("method") != "POST" ||
          request.at("body") != "{\"value\":42}")
        throw std::runtime_error("Incorrect actual fetch request");
      return Json{{"status", 201},
                  {"headers", {{"content-type", "application/json"}}},
                  {"body", "{\"received\":42}"}}
          .dump();
    };
    grants.operations["provider:codex:webSearch"] = [](const std::string
                                                           &payload) {
      const auto args = Json::parse(payload);
      if (args.at("query") != "local deterministic search")
        throw std::runtime_error("Incorrect actual Codex web-search query");
      return std::string(
          R"({"text":"Fixture answer","sources":[{"title":"Local fixture","url":"https://fixture.invalid/source"}]})");
    };
    grants.operations["provider:gemini_vertex:postModel"] = [](const std::string
                                                            &payload) {
      const auto args = Json::parse(payload);
      if (args.at("model") != "fixture" ||
          args.at("method") != "generateContent")
        throw std::runtime_error("Incorrect actual Vertex request");
      const auto query = args.at("body")
                             .at("contents")
                             .at(0)
                             .at("parts")
                             .at(0)
                             .at("text")
                             .get<std::string>();
      if (query == "local failure")
        return std::string(
            R"({"status":503,"body":"fixture endpoint failure"})");
      if (query != "local deterministic search")
        throw std::runtime_error("Incorrect actual Vertex query");
      const auto data = Json{
          {"candidates",
           Json::array({Json{
               {"content",
                {{"parts",
                  Json::array({Json{{"text", "Grounded fixture answer"}}})}}},
               {"groundingMetadata",
                {{"groundingChunks",
                  Json::array({Json{{"web",
                                     {{"uri", "https://fixture.invalid/source"},
                                      {"title", "Local fixture"}}}}})}}}}})}};
      return Json{{"status", 200}, {"body", data.dump()}}.dump();
    };
    grants.operations["provider:native:open"] = [](auto) {
      return "\"cursor\"";
    };
    grants.operations["provider:native:next"] = [&](auto) {
      return next++ ? "{\"done\":true}"
                    : "{\"done\":false,\"value\":{\"type\":\"chunk\","
                      "\"content\":\"native\"}}";
    };
    grants.operations["provider:native:close"] = [&](auto) {
      ++closed;
      return "null";
    };
    gr::host::installContext(*engine, context, grants);
    engine->set(host, "context", context);
    auto sandbox = engine->object();
    gr::host::installSandbox(*engine, sandbox,
                             [&] { return cancelled.load(); });
    engine->set(host, "sandbox", sandbox);
    std::ifstream input(argv[1]);
    std::string source{std::istreambuf_iterator<char>(input), {}};
    guest.load({source.begin(), source.end()}, argv[1]);
    std::cout << engine->toString(engine->evaluateScript(
                     "JSON.stringify(__g5Result)", "result.js"))
              << '\n';
    if (modelResourceDenials != 4)
      throw std::runtime_error("Model weight grant denials were not exercised");
    if (httpCalls != 1)
      throw std::runtime_error(
          "Fetch grant count or private address policy differs");
    if (closed != 1)
      throw std::runtime_error("Native stream was not closed");
    const auto expectOcrError = [&](const gr::js::Value &object,
                                    const std::string &language,
                                    const std::string &expected) {
      const uint8_t invalidImage = 0;
      try {
        engine->call(
            engine->get(object, "ocr"), object,
            {engine->bytes(&invalidImage, 1), engine->string(language)});
        throw std::logic_error(
            "OCR accepted a missing or escaping resource grant");
      } catch (const gr::js::JsError &error) {
        if (std::string(error.what()).find(expected) == std::string::npos)
          throw;
      }
    };
    auto noOcr = engine->object();
    gr::host::installContext(*engine, noOcr, {});
    expectOcrError(noOcr, "eng", "not granted");
    expectOcrError(context, "../eng", "Invalid OCR language");
    const auto ocrRoot = temp / "ocr";
    std::filesystem::create_directory(ocrRoot);
    std::filesystem::create_symlink(std::filesystem::path(GR_TEST_TESSDATA) / "eng.traineddata",
                                    ocrRoot / "eng.traineddata");
    auto escapedOcr = engine->object();
    auto escapedGrants = grants;
    escapedGrants.ocrDataDirectory = ocrRoot.string();
    gr::host::installContext(*engine, escapedOcr, escapedGrants);
    expectOcrError(escapedOcr, "eng", "escapes its grant");
    cancelled = true;
    expectOcrError(context, "eng", "OCR cancelled");
    cancelled = false;
    const auto invoke = [&](Json options) {
      auto id = engine->call(engine->get(sandbox, "start"), sandbox,
                             {engine->string(options.dump())});
      auto output = engine->call(engine->get(sandbox, "step"), sandbox, {id});
      auto result = Json::parse(engine->toString(output));
      engine->call(engine->get(sandbox, "close"), sandbox, {id});
      if (!result.at("done").get<bool>())
        throw std::runtime_error("Pure sandbox did not settle");
      return result.at("result");
    };
    if (invoke({{"code", "return typeof __host + ':' + typeof process;"}})
            .at("result") != "undefined:undefined")
      throw std::runtime_error("Sandbox leaked host globals");
    if (invoke({{"code", "while(true) {}"}, {"timeoutMs", 5}}).at("success") !=
        false)
      throw std::runtime_error("Timeout not enforced");
    if (invoke({{"code",
                 "const x=[]; while(true) x.push(new Array(10000).fill(1));"},
                {"limits", {{"memoryLimitBytes", 1024 * 1024}}}})
            .at("success") != false)
      throw std::runtime_error("Memory not enforced");
    if (invoke({{"code", "return 'x'.repeat(5000);"},
                {"limits", {{"maxOutputSize", 1024}}}})
            .at("success") != false)
      throw std::runtime_error("Output not enforced");
    cancelled = true;
    if (invoke({{"code", "while(true) {}"}}).at("success") != false)
      throw std::runtime_error("Cancellation not enforced");
    try {
      engine->call(engine->get(context, "call"), context,
                   {engine->string("no-grant"), engine->string("{}")});
      throw std::logic_error("Missing grant accepted");
    } catch (const gr::js::JsError &) {
    }
    cancelled = false;
    {
      std::jthread cancelCpu([&] {
        std::this_thread::sleep_for(std::chrono::milliseconds(5));
        cancelled = true;
      });
      const auto started = std::chrono::steady_clock::now();
      if (invoke({{"code", "while(true) {}"}, {"timeoutMs", 5000}})
              .at("success") != false)
        throw std::runtime_error("Live CPU cancellation ignored");
      if (std::chrono::steady_clock::now() - started > std::chrono::seconds(1))
        throw std::runtime_error("CPU cancellation waited for deadline");
    }
    cancelled = false;
    auto small = engine->object();
    grants.maxCalls = 1;
    grants.maxPayloadBytes = 32;
    grants.operations["small"] = [](auto input) { return input; };
    grants.operations["large"] = [](auto) { return std::string(100, 'x'); };
    gr::host::installContext(*engine, small, grants);
    auto call = [&](const char *op) {
      return engine->call(engine->get(small, "call"), small,
                          {engine->string(op), engine->string("{}")});
    };
    call("small");
    try {
      call("small");
      throw std::logic_error("Call limit ignored");
    } catch (const gr::js::JsError &) {
    }
    auto large = engine->object();
    grants.maxCalls = 100;
    gr::host::installContext(*engine, large, grants);
    try {
      engine->call(engine->get(large, "call"), large,
                   {engine->string("large"), engine->string("{}")});
      throw std::logic_error("Response limit ignored");
    } catch (const gr::js::JsError &) {
    }
    {
      // A 5 MB buffer crosses the bridge in each direction in < 100 ms. The
      // fastest of three crossings is measured, so one slow scheduling slice
      // on a shared runner does not decide the result.
      const std::string zeros64((5u << 20) / 3 * 4 + 4, 'A');
      const auto ms = [](auto d) {
        return std::chrono::duration_cast<std::chrono::milliseconds>(d)
            .count();
      };
      long long outMs = -1, inMs = -1;
      for (int attempt = 0; attempt < 3; ++attempt) {
        const auto started = std::chrono::steady_clock::now();
        auto out = invoke({{"code", "return new Uint8Array(5*1024*1024);"},
                           {"limits", {{"maxOutputSize", 10 * 1024 * 1024}}}});
        const auto mid = std::chrono::steady_clock::now();
        auto in = invoke({{"code", "return buf.length;"},
                          {"globals",
                           {{"buf", {{"__nodetool_sandbox_bytes__", zeros64}}}}}});
        const auto ended = std::chrono::steady_clock::now();
        if (out.at("success") != true ||
            in.at("result") != (5u << 20) / 3 * 3 + 3)
          throw std::runtime_error("5 MB bridge result differs: " +
                                   in.dump().substr(0, 200));
        const auto o = ms(mid - started), i = ms(ended - mid);
        outMs = outMs < 0 ? o : std::min(outMs, static_cast<long long>(o));
        inMs = inMs < 0 ? i : std::min(inMs, static_cast<long long>(i));
      }
      std::cout << "bridge 5MB out " << outMs << " ms, in " << inMs
                << " ms (fastest of 3)\n";
      const long long budget = 100 * gr::test::kSanitizerTimeScale;
      if (outMs >= budget || inMs >= budget)
        throw std::runtime_error("5 MB bridge crossing took >= " +
                                 std::to_string(budget) + " ms");
    }
    for (const char *bad : {"NaN", "-1", "1e20", "1.5", "Infinity"}) {
      for (const char *fn : {"step", "close"}) {
        try {
          engine->call(engine->get(sandbox, fn), sandbox,
                       {engine->evaluateScript(bad, "bad-id.js")});
          throw std::logic_error(std::string("Sandbox ") + fn +
                                 " accepted id " + bad);
        } catch (const gr::js::JsError &error) {
          if (std::string(error.what()).find("RangeError") ==
              std::string::npos)
            throw std::runtime_error(std::string("Sandbox ") + fn + " id " +
                                     bad + " was not a RangeError: " +
                                     error.what());
        }
      }
    }
    std::cout << "context grants, real nodes, sandbox isolation and resource "
                 "limits passed\n";
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
