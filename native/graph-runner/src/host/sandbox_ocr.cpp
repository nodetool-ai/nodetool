#include "host/sandbox_ocr.h"
#include "host/image.h"
#include <cmath>
#include <filesystem>
#include <leptonica/allheaders.h>
#include <memory>
#include <nlohmann/json.hpp>
#include <regex>
#include <stdexcept>
#include <tesseract/capi.h>
namespace gr::host {
void installSandboxOcr(js::Engine &e, const js::Value &object,
                       const std::string &directory,
                       std::function<bool()> cancelled) {
  e.set(
      object, "ocr",
      e.function(
          "ocr", 2,
          [directory, cancelled](js::Engine &en,
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
            const auto bytes = en.toBytes(args[0]);
            if (bytes.size() > 10 * 1024 * 1024) {
              throw std::runtime_error("OCR input byte limit exceeded");
            }
            uint32_t width = 0, height = 0;
            imageSize(bytes.data(), bytes.size(), width, height);
            if (uint64_t(width) * height > 32 * 1024 * 1024) {
              throw std::runtime_error("OCR pixel limit exceeded");
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
            const auto timeout =
                args.size() == 3 ? en.toNumber(args[2]) : 30000;
            if (!std::isfinite(timeout) || timeout < 1 || timeout > 30000) {
              throw std::runtime_error("Invalid OCR deadline");
            }
            TessMonitorSetDeadlineMSecs(monitor.get(),
                                        static_cast<int>(timeout));
            TessMonitorSetCancelThis(monitor.get(), &cancelled);
            TessMonitorSetCancelFunc(monitor.get(), [](void *opaque, int) {
              const auto &fn = *static_cast<std::function<bool()> *>(opaque);
              return fn && fn();
            });
            if (TessBaseAPIRecognize(api.get(), monitor.get()) != 0) {
              throw std::runtime_error(
                  "OCR recognition failed or exceeded its deadline");
            }
            if (cancelled && cancelled()) {
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
            return en.string(nlohmann::json{
                {"text", text ? text.get() : ""},
                {"confidence", TessBaseAPIMeanTextConf(api.get())},
                {"words", words}}.dump());
          }));
}
} // namespace gr::host
