#include "host/intl.h"
#include "kernel/json.h"
#include <unicode/coll.h>
#include <unicode/unum.h>
#include <unicode/udat.h>
#include <unicode/udatpg.h>
#include <unicode/ureldatefmt.h>
#include <unicode/ulistformatter.h>
#include <unicode/ustring.h>
#include <unicode/locid.h>
#include <unicode/uloc.h>
#include <unicode/unistr.h>
#include <memory>
#include <limits>
#include <algorithm>
#include <stdexcept>

namespace gr::host {
namespace {
void status(UErrorCode error) {
  if (U_FAILURE(error)) throw std::runtime_error(std::string("Intl: ") + u_errorName(error));
}
icu::Locale locale(const std::string& tag) {
  UErrorCode error = U_ZERO_ERROR;
  int32_t parsed = 0;
  uloc_forLanguageTag(tag.c_str(),nullptr,0,&parsed,&error);
  if (error == U_BUFFER_OVERFLOW_ERROR) error = U_ZERO_ERROR;
  status(error);
  if (parsed != static_cast<int32_t>(tag.size())) throw std::runtime_error("Intl: invalid locale " + tag);
  auto result = icu::Locale::forLanguageTag(tag,error);
  status(error);
  if (result.isBogus()) throw std::runtime_error("Intl: invalid locale " + tag);
  return result;
}
struct Collation { std::unique_ptr<icu::Collator> value; };
}
void installIntl(js::Engine& engine, const js::Value& object) {
  engine.set(object,"number",engine.function("number",3,[](js::Engine& e,const std::vector<js::Value>& args) {
    const auto tag = locale(e.toString(args.at(0)));
    const auto options = Json::parse(e.toString(args.at(1)));
    const auto input = e.toString(args.at(2));
    const auto style = options.value("style",std::string("decimal"));
    UNumberFormatStyle formatStyle = UNUM_DECIMAL;
    if (style == "percent") formatStyle = UNUM_PERCENT;
    else if (style == "currency") formatStyle = UNUM_CURRENCY;
    else if (style != "decimal") throw std::runtime_error("Intl: unsupported number style " + style);
    UErrorCode error = U_ZERO_ERROR;
    std::unique_ptr<UNumberFormat,decltype(&unum_close)> format(unum_open(formatStyle,nullptr,0,tag.getName(),nullptr,&error),unum_close); status(error);
    if (style == "currency") {
      if (!options.contains("currency")) throw std::runtime_error("Intl: currency is required");
      auto currency = icu::UnicodeString::fromUTF8(options.at("currency").get<std::string>());
      if (currency.length() != 3) throw std::runtime_error("Intl: invalid currency");
      unum_setTextAttribute(format.get(),UNUM_CURRENCY_CODE,currency.getBuffer(),currency.length(),&error); status(error);
    }
    auto digit = [&](const char* key, UNumberFormatAttribute attr,int lo,int hi) {
      if (!options.contains(key)) return;
      int n = options.at(key).get<int>();
      if (n < lo || n > hi) throw std::runtime_error(std::string("Intl: invalid ") + key);
      unum_setAttribute(format.get(),attr,n);
    };
    if (options.contains("minimumFractionDigits") && !options.contains("maximumFractionDigits")) {
      const int minimum = options.at("minimumFractionDigits").get<int>();
      if (minimum > unum_getAttribute(format.get(),UNUM_MAX_FRACTION_DIGITS)) unum_setAttribute(format.get(),UNUM_MAX_FRACTION_DIGITS,minimum);
    }
    if (options.contains("minimumFractionDigits") && options.contains("maximumFractionDigits") &&
        options.at("minimumFractionDigits").get<int>() > options.at("maximumFractionDigits").get<int>()) throw std::runtime_error("Intl: maximumFractionDigits is below minimumFractionDigits");
    digit("minimumIntegerDigits",UNUM_MIN_INTEGER_DIGITS,1,21);
    digit("minimumFractionDigits",UNUM_MIN_FRACTION_DIGITS,0,100);
    digit("maximumFractionDigits",UNUM_MAX_FRACTION_DIGITS,0,100);
    if (unum_getAttribute(format.get(),UNUM_MIN_FRACTION_DIGITS) > unum_getAttribute(format.get(),UNUM_MAX_FRACTION_DIGITS)) throw std::runtime_error("Intl: maximumFractionDigits is below minimumFractionDigits");
    if (options.contains("useGrouping")) {
      const auto& grouping = options.at("useGrouping");
      if (grouping.is_boolean()) unum_setAttribute(format.get(),UNUM_GROUPING_USED,grouping.get<bool>());
      else if (grouping == "min2") { unum_setAttribute(format.get(),UNUM_GROUPING_USED,true); unum_setAttribute(format.get(),UNUM_MINIMUM_GROUPING_DIGITS,2); }
      else if (grouping != "auto" && grouping != "always") throw std::runtime_error("Intl: invalid useGrouping");
    }
    unum_setAttribute(format.get(),UNUM_ROUNDING_MODE,UNUM_ROUND_HALFUP);
    const bool special = input == "NaN" || input == "Infinity" || input == "-Infinity";
    const double value = input == "NaN" ? std::numeric_limits<double>::quiet_NaN() : input == "-Infinity" ? -std::numeric_limits<double>::infinity() : std::numeric_limits<double>::infinity();
    auto render = [&](UChar* output,int capacity) {
      return special ? unum_formatDouble(format.get(),value,output,capacity,nullptr,&error)
        : unum_formatDecimal(format.get(),input.c_str(),input.size(),output,capacity,nullptr,&error);
    };
    int length = render(nullptr,0);
    if (error == U_BUFFER_OVERFLOW_ERROR) error = U_ZERO_ERROR; status(error);
    std::vector<UChar> output(length+1);
    render(output.data(),output.size()); status(error);
    std::string result; icu::UnicodeString(output.data(),length).toUTF8String(result);
    return e.string(result);
  }));
  engine.set(object,"date",engine.function("date",3,[](js::Engine& e,const std::vector<js::Value>& args) {
    const auto tag = locale(e.toString(args.at(0)));
    const auto options = Json::parse(e.toString(args.at(1)));
    UErrorCode error = U_ZERO_ERROR;
    auto style = [&](const char* key) -> UDateFormatStyle {
      const auto value = options.value(key,std::string());
      if (value.empty()) return UDAT_NONE;
      if (value == "full") return UDAT_FULL;
      if (value == "long") return UDAT_LONG;
      if (value == "medium") return UDAT_MEDIUM;
      if (value == "short") return UDAT_SHORT;
      throw std::runtime_error(std::string("Intl: invalid ") + key);
    };
    auto date = style("dateStyle"), time = style("timeStyle");
    icu::UnicodeString pattern;
    if (date == UDAT_NONE && time == UDAT_NONE) {
      std::string skeleton;
      const std::map<std::string,std::map<std::string,std::string>> fields = {
        {"year",{{"numeric","y"},{"2-digit","yy"}}},
        {"month",{{"numeric","M"},{"2-digit","MM"},{"short","MMM"},{"long","MMMM"},{"narrow","MMMMM"}}},
        {"day",{{"numeric","d"},{"2-digit","dd"}}},
        {"weekday",{{"short","EEE"},{"long","EEEE"},{"narrow","EEEEE"}}},
        {"hour",{{"numeric","j"},{"2-digit","jj"}}},
        {"minute",{{"numeric","m"},{"2-digit","mm"}}},
        {"second",{{"numeric","s"},{"2-digit","ss"}}}
      };
      for (const auto& [field,values] : fields) if (options.contains(field)) {
        const auto value = options.at(field).get<std::string>();
        const auto it = values.find(value);
        if (it == values.end()) throw std::runtime_error("Intl: invalid " + field);
        skeleton += it->second;
      }
      if (skeleton.empty()) skeleton = "yMd";
      if (options.contains("hour12")) {
        const auto replacement = options.at("hour12").get<bool>() ? 'h' : 'H';
        std::replace(skeleton.begin(),skeleton.end(),'j',replacement);
      }
      std::unique_ptr<UDateTimePatternGenerator,decltype(&udatpg_close)> generator(udatpg_open(tag.getName(),&error),udatpg_close); status(error);
      const auto input = icu::UnicodeString::fromUTF8(skeleton);
      UChar buffer[256];
      const auto length = udatpg_getBestPattern(generator.get(),input.getBuffer(),input.length(),buffer,256,&error); status(error);
      pattern = icu::UnicodeString(buffer,length); date = time = UDAT_PATTERN;
    }
    icu::UnicodeString zone;
    if (options.contains("timeZone")) zone = icu::UnicodeString::fromUTF8(options.at("timeZone").get<std::string>());
    else { UChar buffer[128]; const auto length=ucal_getDefaultTimeZone(buffer,128,&error); status(error); zone=icu::UnicodeString(buffer,length); }
    UChar canonical[128]; UBool system = false;
    ucal_getCanonicalTimeZoneID(zone.getBuffer(),zone.length(),canonical,128,&system,&error); status(error);
    if (!system && zone != icu::UnicodeString("UTC")) throw std::runtime_error("Intl: invalid timeZone");
    std::unique_ptr<UDateFormat,decltype(&udat_close)> format(udat_open(time,date,tag.getName(),zone.getBuffer(),zone.length(),pattern.isEmpty() ? nullptr : pattern.getBuffer(),pattern.length(),&error),udat_close); status(error);
    const auto value = e.toNumber(args.at(2));
    int length = udat_format(format.get(),value,nullptr,0,nullptr,&error);
    if (error == U_BUFFER_OVERFLOW_ERROR) error = U_ZERO_ERROR; status(error);
    std::vector<UChar> output(length+1);
    udat_format(format.get(),value,output.data(),output.size(),nullptr,&error); status(error);
    std::string result; icu::UnicodeString(output.data(),length).toUTF8String(result);
    // Match ECMA-402's regular-space day-period pattern handling.
    for (size_t pos = 0; (pos = result.find("\xe2\x80\xaf",pos)) != std::string::npos;) result.replace(pos,3," ");
    return e.string(result);
  }));

  engine.set(object,"relative",engine.function("relative",4,[](js::Engine& e,const std::vector<js::Value>& args) {
    const auto tag = locale(e.toString(args.at(0)));
    const auto options = Json::parse(e.toString(args.at(1)));
    const auto unit = e.toString(args.at(3));
    const std::map<std::string,URelativeDateTimeUnit> units = {{"year",UDAT_REL_UNIT_YEAR},{"quarter",UDAT_REL_UNIT_QUARTER},{"month",UDAT_REL_UNIT_MONTH},{"week",UDAT_REL_UNIT_WEEK},{"day",UDAT_REL_UNIT_DAY},{"hour",UDAT_REL_UNIT_HOUR},{"minute",UDAT_REL_UNIT_MINUTE},{"second",UDAT_REL_UNIT_SECOND}};
    const auto it = units.find(unit.ends_with("s") ? unit.substr(0,unit.size()-1) : unit);
    if (it == units.end()) throw std::runtime_error("Intl: invalid relative time unit");
    const auto style = options.value("style",std::string("long"));
    UDateRelativeDateTimeFormatterStyle formatStyle;
    if (style == "long") formatStyle = UDAT_STYLE_LONG;
    else if (style == "short") formatStyle = UDAT_STYLE_SHORT;
    else if (style == "narrow") formatStyle = UDAT_STYLE_NARROW;
    else throw std::runtime_error("Intl: invalid relative time style");
    const auto numeric = options.value("numeric",std::string("always"));
    if (numeric != "always" && numeric != "auto") throw std::runtime_error("Intl: invalid numeric");
    UErrorCode error = U_ZERO_ERROR;
    std::unique_ptr<URelativeDateTimeFormatter,decltype(&ureldatefmt_close)> format(ureldatefmt_open(tag.getName(),nullptr,formatStyle,UDISPCTX_CAPITALIZATION_NONE,&error),ureldatefmt_close); status(error);
    auto render = numeric == "auto" ? ureldatefmt_format : ureldatefmt_formatNumeric;
    int length = render(format.get(),e.toNumber(args.at(2)),it->second,nullptr,0,&error);
    if (error == U_BUFFER_OVERFLOW_ERROR) error = U_ZERO_ERROR; status(error);
    std::vector<UChar> output(length+1);
    render(format.get(),e.toNumber(args.at(2)),it->second,output.data(),output.size(),&error); status(error);
    std::string result; icu::UnicodeString(output.data(),length).toUTF8String(result);
    return e.string(result);
  }));
  engine.set(object,"list",engine.function("list",3,[](js::Engine& e,const std::vector<js::Value>& args) {
    const auto tag = locale(e.toString(args.at(0)));
    const auto options = Json::parse(e.toString(args.at(1)));
    const auto values = Json::parse(e.toString(args.at(2)));
    const auto type = options.value("type",std::string("conjunction"));
    UListFormatterType formatType;
    if (type == "conjunction") formatType = ULISTFMT_TYPE_AND;
    else if (type == "disjunction") formatType = ULISTFMT_TYPE_OR;
    else if (type == "unit") formatType = ULISTFMT_TYPE_UNITS;
    else throw std::runtime_error("Intl: invalid list type");
    const auto style = options.value("style",std::string("long"));
    UListFormatterWidth width;
    if (style == "long") width = ULISTFMT_WIDTH_WIDE;
    else if (style == "short") width = ULISTFMT_WIDTH_SHORT;
    else if (style == "narrow") width = ULISTFMT_WIDTH_NARROW;
    else throw std::runtime_error("Intl: invalid list style");
    UErrorCode error = U_ZERO_ERROR;
    std::unique_ptr<UListFormatter,decltype(&ulistfmt_close)> format(ulistfmt_openForType(tag.getName(),formatType,width,&error),ulistfmt_close); status(error);
    std::vector<icu::UnicodeString> strings;
    for (const auto& value : values) strings.push_back(icu::UnicodeString::fromUTF8(value.get<std::string>()));
    std::vector<const UChar*> buffers; std::vector<int32_t> lengths;
    for (const auto& value : strings) { buffers.push_back(value.getBuffer()); lengths.push_back(value.length()); }
    int length = ulistfmt_format(format.get(),buffers.data(),lengths.data(),strings.size(),nullptr,0,&error);
    if (error == U_BUFFER_OVERFLOW_ERROR) error = U_ZERO_ERROR; status(error);
    std::vector<UChar> output(length+1);
    ulistfmt_format(format.get(),buffers.data(),lengths.data(),strings.size(),output.data(),output.size(),&error); status(error);
    std::string result; icu::UnicodeString(output.data(),length).toUTF8String(result);
    return e.string(result);
  }));
  engine.set(object,"collator",engine.function("collator",2,[](js::Engine& e,const std::vector<js::Value>& args) {
    const auto tag = e.toString(args.at(0));
    const auto options = Json::parse(e.toString(args.at(1)));
    UErrorCode error = U_ZERO_ERROR;
    // native-rules #1: state shared by the collator host functions, no justification
    auto state = std::make_shared<Collation>();
    state->value.reset(icu::Collator::createInstance(locale(tag),error)); status(error);
    auto set = [&](UColAttribute key,UColAttributeValue value) { state->value->setAttribute(key,value,error); status(error); };
    const auto sensitivity = options.value("sensitivity",std::string("variant"));
    if (sensitivity == "base") state->value->setStrength(icu::Collator::PRIMARY);
    else if (sensitivity == "accent") state->value->setStrength(icu::Collator::SECONDARY);
    else if (sensitivity == "case") { state->value->setStrength(icu::Collator::PRIMARY); set(UCOL_CASE_LEVEL,UCOL_ON); }
    else if (sensitivity != "variant") throw std::runtime_error("Intl: invalid sensitivity");
    set(UCOL_NORMALIZATION_MODE,UCOL_ON);
    if (options.contains("numeric")) set(UCOL_NUMERIC_COLLATION,options.at("numeric").get<bool>() ? UCOL_ON : UCOL_OFF);
    if (options.value("ignorePunctuation",false)) set(UCOL_ALTERNATE_HANDLING,UCOL_SHIFTED);
    const auto first = options.value("caseFirst",std::string("false"));
    if (first == "upper") set(UCOL_CASE_FIRST,UCOL_UPPER_FIRST);
    else if (first == "lower") set(UCOL_CASE_FIRST,UCOL_LOWER_FIRST);
    else if (first != "false") throw std::runtime_error("Intl: invalid caseFirst");
    return e.function("compare",2,[state](js::Engine& en,const std::vector<js::Value>& a) {
      UErrorCode error = U_ZERO_ERROR;
      const auto left = icu::UnicodeString::fromUTF8(en.toString(a.at(0)));
      const auto right = icu::UnicodeString::fromUTF8(en.toString(a.at(1)));
      const auto result = state->value->compare(left,right,error); status(error);
      return en.number(result < 0 ? -1 : result > 0 ? 1 : 0);
    });
  }));
}
} // namespace gr::host
