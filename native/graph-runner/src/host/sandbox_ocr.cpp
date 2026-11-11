#include "host/sandbox_ocr.h"
#include "host/image.h"
#include "kernel/async_jobs.h"
#include "kernel/job_inputs.h"
#include <cmath>
#include <filesystem>
#include <allheaders.h>
#include <memory>
#include <nlohmann/json.hpp>
#include <regex>
#include <span>
#include <functional>
#include <stdexcept>
#include <tesseract/capi.h>
namespace gr::host {
namespace {

using nodetool::jobs::JobCost;
using nodetool::jobs::JobOutcome;
using nodetool::jobs::JobPayload;
using nodetool::jobs::checkedAdd;
using nodetool::jobs::checkedMul;

constexpr size_t kMaxOcrInputBytes = 10 * 1024 * 1024;
constexpr uint64_t kMaxOcrPixels = 32 * 1024 * 1024;
// The most a result's JSON text holds: the page text and at most 20000
// words with their boxes.
constexpr uint64_t kOcrOutputBytes = 8 * 1024 * 1024;

// Decodes `bytes` and recognizes them with Tesseract. `stop` is polled by
// Tesseract's cancel callback and between the steps. Returns the result as
// JSON text. Throws std::runtime_error when recognition fails.
//
// Thread affinity: any thread. Every Leptonica and Tesseract object lives
// inside the call.
std::string recognize(std::span<const uint8_t> bytes, const std::filesystem::path &root,
                      const std::string &language, int timeout,
                      const std::function<bool()> &stop) {
            if (stop && stop()) {
              throw std::runtime_error("OCR cancelled");
            }
            const auto image = decodeImage(bytes.data(), bytes.size());
            const auto destroyPix = [](PIX *pix) { pixDestroy(&pix); };
            std::unique_ptr<PIX, decltype(destroyPix)> pix(
                pixCreate(image.width, image.height, 32), destroyPix);
            if (!pix) {
              throw std::runtime_error("Cannot allocate OCR image");
            }
            for (uint32_t y = 0; y < image.height; ++y) {
              for (uint32_t x = 0; x < image.width; ++x) {
                const auto i = (size_t(y) * image.width + x) * 4;
                const auto a = image.pixels[i + 3];
                const auto channel = [&](size_t offset) {
                  return (uint32_t(image.pixels[i + offset]) * a +
                          255 * (255 - a)) /
                         255;
                };
                l_uint32 pixel;
                composeRGBPixel(channel(0), channel(1), channel(2), &pixel);
                pixSetPixel(pix.get(), x, y, pixel);
              }
            }
            std::unique_ptr<TessBaseAPI, decltype(&TessBaseAPIDelete)> api(
                TessBaseAPICreate(), TessBaseAPIDelete);
            if (TessBaseAPIInit2(api.get(), root.string().c_str(),
                                 language.c_str(),
                                 tesseract::OEM_LSTM_ONLY) != 0) {
              throw std::runtime_error(
                  "Cannot initialize granted OCR language resource");
            }
            TessBaseAPISetPageSegMode(api.get(), tesseract::PSM_AUTO);
            TessBaseAPISetImage2(api.get(), pix.get());
            std::unique_ptr<ETEXT_DESC, decltype(&TessMonitorDelete)> monitor(
                TessMonitorCreate(), TessMonitorDelete);
            TessMonitorSetDeadlineMSecs(monitor.get(), timeout);
            TessMonitorSetCancelThis(monitor.get(),
                                     const_cast<std::function<bool()> *>(&stop));
            TessMonitorSetCancelFunc(monitor.get(), [](void *opaque, int) {
              const auto &fn = *static_cast<std::function<bool()> *>(opaque);
              return fn && fn();
            });
            if (TessBaseAPIRecognize(api.get(), monitor.get()) != 0) {
              throw std::runtime_error(
                  "OCR recognition failed or exceeded its deadline");
            }
            if (stop && stop()) {
              throw std::runtime_error("OCR cancelled");
            }
            std::unique_ptr<char, decltype(&TessDeleteText)> text(
                TessBaseAPIGetUTF8Text(api.get()), TessDeleteText);
            nlohmann::json words = nlohmann::json::array();
            std::unique_ptr<TessResultIterator,
                            decltype(&TessResultIteratorDelete)>
                iterator(TessBaseAPIGetIterator(api.get()),
                         TessResultIteratorDelete);
            if (iterator) {
              do {
                std::unique_ptr<char, decltype(&TessDeleteText)> word(
                    TessResultIteratorGetUTF8Text(iterator.get(),
                                                  tesseract::RIL_WORD),
                    TessDeleteText);
                int x0 = 0, y0 = 0, x1 = 0, y1 = 0;
                if (word &&
                    TessPageIteratorBoundingBox(
                        TessResultIteratorGetPageIterator(iterator.get()),
                        tesseract::RIL_WORD, &x0, &y0, &x1, &y1)) {
                  words.push_back(
                      {{"text", word.get()},
                       {"confidence", TessResultIteratorConfidence(
                                          iterator.get(), tesseract::RIL_WORD)},
                       {"bbox",
                        {{"x0", x0}, {"y0", y0}, {"x1", x1}, {"y1", y1}}}});
                }
                if (words.size() > 20000) {
                  throw std::runtime_error("OCR word limit exceeded");
                }
              } while (
                  TessResultIteratorNext(iterator.get(), tesseract::RIL_WORD));
            }
            return nlohmann::json{
                {"text", text ? text.get() : ""},
                {"confidence", TessBaseAPIMeanTextConf(api.get())},
                {"words", words}}.dump();
}

// The JSON text of a recognition.
//
// Thread affinity: none. Created on the lane thread, then moved in its
// JobResult to the worker or destroyed where a closed mailbox disposes it.
struct OcrText final : JobPayload {
  explicit OcrText(std::string t) : text(std::move(t)) {}
  std::string text;
};

// Recognizes a snapshot of image bytes on the run's CPU lane. A cancel of
// the run requests stop, and Tesseract's cancel callback ends the
// recognition at its next check.
//
// Thread affinity: the lane thread that runs it, one call at a time.
// Created, and possibly destroyed, on the worker.
class OcrJob final : public nodetool::jobs::NativeJob {
public:
  OcrJob(std::vector<uint8_t> bytes, std::filesystem::path root, std::string language,
         int timeout, uint64_t pixels)
      : bytes_(std::move(bytes)), root_(std::move(root)), language_(std::move(language)),
        timeout_(timeout), pixels_(pixels) {}

  // The snapshot, the decoded RGBA and Leptonica's 32-bit copy of it, and
  // the result text. Tesseract's own buffers stay outside the ledger.
  JobCost cost() const override {
    const uint64_t snapshot =
        checkedAdd(checkedAdd(bytes_.size(), language_.size()), root_.native().size());
    return {snapshot, kOcrOutputBytes, checkedMul(pixels_, 8)};
  }

  JobOutcome run(std::stop_token stop) override {
    const std::function<bool()> stopped = [stop] { return stop.stop_requested(); };
    if (stopped()) return JobOutcome::stopped();
    try {
      std::string text = recognize(bytes_, root_, language_, timeout_, stopped);
      if (stopped()) return JobOutcome::stopped();
      return JobOutcome::value(std::make_unique<OcrText>(std::move(text)));
    } catch (const std::exception &error) {
      if (stopped()) return JobOutcome::stopped();
      return JobOutcome::failure(error.what());
    }
  }

private:
  std::vector<uint8_t> bytes_;
  std::filesystem::path root_;
  std::string language_;
  int timeout_;
  uint64_t pixels_;
};

} // namespace

void installSandboxOcr(js::Engine &e, const js::Value &object,
                       const std::string &directory,
                       std::function<bool()> cancelled) {
  auto binding = RunBinding::of(e);
  // Inside a run, returns a promise and recognizes a snapshot of the bytes on
  // the run's CPU lane, cancellable. Outside a run, recognizes at the call
  // and returns the text.
  e.set(
      object, "ocr",
      e.function(
          "ocr", 2,
          [directory, cancelled, binding](js::Engine &en,
                                 const std::vector<js::Value> &args) mutable {
            if (directory.empty()) {
              throw std::runtime_error(
                  "OCR traineddata directory is not granted");
            }
            if (args.size() < 2 || args.size() > 3) {
              throw std::runtime_error("OCR requires image bytes and language");
            }
            const auto language = en.toString(args[1]);
            if (language.size() > 128 ||
                !std::regex_match(
                    language, std::regex("[A-Za-z_]{3,}(\\+[A-Za-z_]{3,})*"))) {
              throw std::runtime_error("Invalid OCR language");
            }
            const auto root = std::filesystem::canonical(directory);
            size_t cursor = 0;
            while (cursor < language.size()) {
              auto end = language.find('+', cursor);
              if (end == std::string::npos) {
                end = language.size();
              }
              const auto file = root / (language.substr(cursor, end - cursor) +
                                        ".traineddata");
              if (std::filesystem::canonical(file).parent_path() != root) {
                throw std::runtime_error(
                    "OCR language resource escapes its grant");
              }
              cursor = end + 1;
            }
            if (cancelled && cancelled()) {
              throw std::runtime_error("OCR cancelled");
            }
            const auto timeout =
                args.size() == 3 ? en.toNumber(args[2]) : 30000;
            if (!std::isfinite(timeout) || timeout < 1 || timeout > 30000) {
              throw std::runtime_error("Invalid OCR deadline");
            }
            if (!en.isBytes(args[0])) {
              throw std::runtime_error("OCR requires image bytes");
            }
            const auto bytes = en.viewBytes(args[0]);
            if (bytes.size() > kMaxOcrInputBytes) {
              throw std::runtime_error("OCR input byte limit exceeded");
            }
            uint32_t width = 0, height = 0;
            imageSize(bytes.data(), bytes.size(), width, height);
            const uint64_t pixels = uint64_t(width) * height;
            if (pixels > kMaxOcrPixels) {
              throw std::runtime_error("OCR pixel limit exceeded");
            }
            AsyncRun *run = binding->run();
            if (!run) {
              return en.string(recognize(bytes, root, language,
                                         static_cast<int>(timeout), cancelled));
            }
            nodetool::jobs::Reservation reservation = run->reserve();
            auto snapshot =
                snapshotBytes(en, args[0], "OCR image bytes", reservation);
            auto job = std::make_unique<OcrJob>(std::move(snapshot), root, language,
                                                static_cast<int>(timeout), pixels);
            return run->submit(
                run->executor(), std::move(job),
                [](ResultConversion &conversion) {
                  auto *payload = static_cast<OcrText *>(conversion.payload());
                  conversion.chargeCopy(payload->text.size());
                  return conversion.engine().string(payload->text);
                },
                true, std::move(reservation));
          }));
}
} // namespace gr::host
