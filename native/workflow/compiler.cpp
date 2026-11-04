#include "compiler.hpp"
#include "gpu.hpp"
#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <functional>
#include <llvm/Config/llvm-config.h>
#include <unistd.h>
#if __has_include(<llvm/TargetParser/Host.h>)
#include <llvm/TargetParser/Host.h>
#else
#include <llvm/Support/Host.h>
#endif
#include <llvm/Support/JSON.h>
#include <llvm/Support/MemoryBuffer.h>
#include <llvm/Support/Program.h>
#include <llvm/Support/SHA256.h>
#include <llvm/Support/raw_ostream.h>
#include <map>
#include <set>
#include <sstream>
#include <stdexcept>

namespace nw {
namespace {
using Shape = std::vector<int64_t>;
struct Node {
  std::string id, op, name, dtype = "f32";
  llvm::json::Object props;
  std::map<std::string, size_t> in;
  Shape shape;
  size_t binding = 0;
  size_t origin = 0;
};
[[noreturn]] void fail(const std::string &message) {
  throw std::runtime_error(message);
}
std::string str(const llvm::json::Object &o, const char *key,
                std::string fallback = "") {
  auto v = o.getString(key);
  if (o.get(key) && !v) {
    fail(std::string("expected string: ") + key);
  }
  return v ? v->str() : fallback;
}
int64_t integer(const llvm::json::Object &o, const char *key,
                int64_t fallback = 0) {
  auto v = o.getInteger(key);
  if (o.get(key) && !v) {
    fail(std::string("expected integer: ") + key);
  }
  return v ? *v : fallback;
}
Shape dims(const llvm::json::Object &o, const char *key) {
  Shape s;
  if (o.get(key) && !o.getArray(key)) {
    fail(std::string("expected shape array: ") + key);
  }
  if (auto a = o.getArray(key)) {
    for (auto &v : *a) {
      auto n = v.getAsInteger();
      if (!n || *n <= 0) {
        fail(std::string("invalid ") + key);
      }
      s.push_back(*n);
    }
  }
  return s;
}
size_t count(const Shape &s) {
  size_t n = 1;
  for (auto d : s) {
    if (d <= 0 || uint64_t(d) > (1ULL << 28) / n) {
      fail("tensor exceeds allocation limit");
    }
    n *= d;
  }
  return n;
}
Shape broadcast(Shape a, Shape b) {
  Shape r(std::max(a.size(), b.size()), 1);
  for (size_t k = 0; k < r.size(); ++k) {
    auto x = k < a.size() ? a[a.size() - 1 - k] : 1;
    auto y = k < b.size() ? b[b.size() - 1 - k] : 1;
    if (x != y && x != 1 && y != 1) {
      fail("incompatible broadcast shapes");
    }
    r[r.size() - 1 - k] = std::max(x, y);
  }
  count(r);
  return r;
}
std::string indexFor(const Shape &from, const Shape &to, const std::string &i) {
  std::string r = "0";
  size_t fs = 1, ts = 1;
  for (size_t k = 0; k < from.size(); ++k) {
    auto d = from[from.size() - 1 - k];
    auto td = to[to.size() - 1 - k];
    if (d != 1) {
      r += "+((" + i + ")/" + std::to_string(ts) + "%" + std::to_string(td) +
           ")*" + std::to_string(fs);
    }
    fs *= d;
    ts *= td;
  }
  return "(" + r + ")";
}
std::string number(double n) {
  std::ostringstream s;
  s.precision(17);
  s << n;
  return "float(" + s.str() + ")";
}
void write(const std::filesystem::path &p, const std::string &s) {
  std::ofstream f(p);
  if (!(f << s)) {
    fail("cannot write " + p.string());
  }
}
} // namespace
CompileResult compile(const std::string &graphPath, const std::string &outDir,
                      const std::string &target, const std::string &mode) {
  if (target != "cpu" && target != "cuda") {
    fail("target has no registered lowering: " + target);
  }
  if (mode != "strict" && mode != "fast") {
    fail("invalid numerical mode");
  }
  auto buffer = llvm::MemoryBuffer::getFile(graphPath);
  if (!buffer) {
    fail("cannot read graph");
  }
  if ((*buffer)->getBufferSize() > 16 * 1024 * 1024) {
    fail("graph exceeds 16 MiB document limit");
  }
  auto parsed = llvm::json::parse((*buffer)->getBuffer());
  if (!parsed) {
    fail("malformed graph JSON");
  }
  auto root = parsed->getAsObject();
  if (!root) {
    fail("graph must be an object");
  }
  auto nodes = root->getArray("nodes");
  auto edges = root->getArray("edges");
  if (!nodes || !edges || nodes->empty()) {
    fail("graph requires nodes and edges");
  }
  if (nodes->size() > 4096) {
    fail("graph exceeds node limit");
  }
  std::vector<Node> ns;
  std::map<std::string, size_t> ids;
  const std::set<std::string> supported = {
      "Input",       "Weight",    "Constant",   "Output",      "Add",
      "Subtract",    "Multiply",  "Divide",     "Minimum",     "Maximum",
      "Negate",      "Abs",       "Sin",        "Cos",         "Exp",
      "Log",         "Sqrt",      "Relu",       "Sigmoid",     "Tanh",
      "Floor",       "Cast",      "Greater",    "Less",        "Equal",
      "Select",      "Reshape",   "Transpose",  "MatMul",      "ReduceSum",
      "ReduceMean",  "Softmax",   "Coordinate", "SeededNoise", "CFG",
      "DenoiseStep", "Stencil2D", "Biquad",     "Conv2D",      "MaxPool2D"};
  for (auto &value : *nodes) {
    auto o = value.getAsObject();
    if (!o) {
      fail("node must be object");
    }
    Node n;
    n.id = str(*o, "id");
    n.op = str(*o, "type");
    const std::string prefix = "nodetool.native.";
    if (n.op.rfind(prefix, 0) != 0) {
      fail("unsupported node type at " + n.id + ": " + n.op);
    }
    n.op = n.op.substr(prefix.size());
    if (!supported.count(n.op)) {
      fail("unsupported native operation " + n.op);
    }
    if (n.id.empty() || ids.count(n.id)) {
      fail("missing or duplicate node ID");
    }
    for (auto key :
         {"dynamic_properties", "parent_id", "parentId", "streaming",
          "is_streaming", "is_streaming_input", "is_streaming_output",
          "dynamic_inputs", "dynamic_outputs", "dynamic_output_correlation"}) {
      if (auto field = o->get(key)) {
        if ((std::string(key) == "parent_id" ||
             std::string(key) == "parentId") &&
            field->getAsNull()) {
          continue;
        }
        fail(n.id + ": forbidden execution field " + key);
      }
    }
    if (o->get("properties") && !o->getObject("properties")) {
      fail(n.id + ": properties must be object");
    }
    auto p = o->getObject("properties");
    if (!o->get("properties")) {
      if (o->get("data") && !o->getObject("data")) {
        fail(n.id + ": data must be object");
      }
      p = o->getObject("data");
    }
    if (p) {
      n.props = *p;
    }
    std::set<std::string> properties = {"dtype"};
    if (n.op == "Input" || n.op == "Weight" || n.op == "Output") {
      properties.insert("name");
    }
    if (n.op == "Input" || n.op == "Weight" || n.op == "Constant" ||
        n.op == "Coordinate" || n.op == "SeededNoise" || n.op == "Reshape") {
      properties.insert("shape");
    }
    if (n.op == "Constant") {
      properties.insert("value");
    }
    if (n.op == "Coordinate") {
      properties.insert("axis");
      properties.insert("normalized");
    }
    if (n.op == "SeededNoise") {
      properties.insert("seed");
    }
    if (n.op == "Transpose") {
      properties.insert("axes");
    }
    if (n.op == "ReduceSum" || n.op == "ReduceMean" || n.op == "Softmax") {
      properties.insert("axis");
      properties.insert("keepdims");
    }
    if (n.op == "Stencil2D") {
      properties.insert("kernel");
      properties.insert("kernel_shape");
      properties.insert("border");
    }
    if (n.op == "Biquad") {
      properties.insert("coefficients");
    }
    if (n.op == "Conv2D" || n.op == "MaxPool2D") {
      properties.insert("stride");
      properties.insert("padding");
    }
    if (n.op == "MaxPool2D") {
      properties.insert("kernel_shape");
    }
    if (n.op == "CFG") {
      properties.insert("scale");
    }
    if (n.op == "DenoiseStep") {
      properties.insert("step");
    }
    for (auto &field : n.props) {
      if (!properties.count(field.first.str())) {
        fail(n.id + ": unsupported property " + field.first.str());
      }
    }
    for (auto key : {"normalized", "keepdims"}) {
      if (n.props.get(key) && !n.props.getBoolean(key)) {
        fail(n.id + ": expected boolean property " + key);
      }
    }
    for (auto key : {"scale", "step"}) {
      if (n.props.get(key) && (!n.props.getNumber(key) ||
                               !std::isfinite(*n.props.getNumber(key)))) {
        fail(n.id + ": expected finite numeric property " + key);
      }
    }
    n.name = str(n.props, "name", n.id);
    n.dtype = str(n.props, "dtype", "f32");
    if (n.dtype != "f32") {
      fail(n.id + ": unsupported dtype " + n.dtype);
    }
    ids[n.id] = ns.size();
    ns.push_back(std::move(n));
  }
  std::map<size_t, size_t> biquadStates;
  for (auto &value : *edges) {
    auto e = value.getAsObject();
    if (!e) {
      fail("edge must be object");
    }
    auto s = str(*e, "source"), t = str(*e, "target"),
         sh = str(*e, "sourceHandle"), th = str(*e, "targetHandle");
    if (!ids.count(s) || !ids.count(t)) {
      fail("edge references missing node");
    }
    if ((sh != "output" && sh != "state_out") || th.empty() ||
        str(*e, "type") == "control") {
      fail("invalid edge handles or control edge");
    }
    size_t source = ids[s];
    if (sh == "state_out") {
      if (ns[source].op != "Biquad") {
        fail("state_out requires Biquad");
      }
      if (!biquadStates.count(source)) {
        Node state = ns[source];
        state.op = "BiquadState";
        state.origin = source;
        biquadStates[source] = ns.size();
        ns.push_back(std::move(state));
      }
      source = biquadStates[source];
    }
    auto edgeType = str(*e, "edge_type", "data");
    if (edgeType != "data") {
      fail("unsupported edge type " + edgeType);
    }
    auto &n = ns[ids[t]];
    if (n.in.count(th)) {
      fail("multiple producers for " + t + "." + th);
    }
    n.in[th] = source;
  }
  for (auto &n : ns) {
    if (n.op == "BiquadState") {
      n.in = ns[n.origin].in;
    }
  }
  std::vector<int> state(ns.size());
  std::vector<size_t> order;
  std::function<void(size_t)> visit = [&](size_t i) {
    if (state[i] == 1) {
      fail("cycle at " + ns[i].id);
    }
    if (state[i] == 2) {
      return;
    }
    state[i] = 1;
    if (ns[i].op == "BiquadState") {
      visit(ns[i].origin);
    }
    for (auto &p : ns[i].in) {
      visit(p.second);
    }
    state[i] = 2;
    order.push_back(i);
  };
  for (size_t i = 0; i < ns.size(); ++i) {
    visit(i);
  }
  auto input = [&](Node &n, const std::string &port) -> Node & {
    auto p = n.in.find(port);
    if (p == n.in.end()) {
      fail(n.id + ": missing input " + port);
    }
    return ns[p->second];
  };
  if (auto settings = root->get("settings")) {
    auto object = settings->getAsObject();
    if (!object) {
      fail("settings must be an object");
    }
    if (auto execution = object->get("execution")) {
      auto config = execution->getAsObject();
      if (!config || str(*config, "kind") != "native" ||
          integer(*config, "version") != 1) {
        fail("unsupported native execution profile");
      }
      for (auto &field : *config) {
        if (field.first != "kind" && field.first != "version") {
          fail("unsupported execution option");
        }
      }
    }
  }
  std::vector<size_t> ins, outs;
  for (auto i : order) {
    auto &n = ns[i];
    std::set<std::string> allowed;
    const std::set<std::string> binary = {
        "Add",     "Subtract", "Multiply", "Divide", "Minimum",
        "Maximum", "Greater",  "Less",     "Equal",  "MatMul"};
    if (n.op == "Input" || n.op == "Weight" || n.op == "Constant" ||
        n.op == "Coordinate" || n.op == "SeededNoise") {
    } else if (n.op == "Conv2D") {
      allowed = {"input", "weight"};
    } else if (n.op == "Biquad" || n.op == "BiquadState") {
      allowed = {"audio", "state"};
    } else if (n.op == "Select") {
      allowed = {"condition", "a", "b"};
    } else if (n.op == "CFG") {
      allowed = {"uncond", "cond"};
    } else if (n.op == "DenoiseStep") {
      allowed = {"latent", "noise"};
    } else if (binary.count(n.op)) {
      allowed = {"a", "b"};
    } else {
      allowed = {"input"};
    }
    if (n.in.size() != allowed.size()) {
      fail(n.id + ": wrong input count");
    }
    for (auto &port : allowed) {
      if (!n.in.count(port)) {
        fail(n.id + ": missing input " + port);
      }
    }
    for (auto &p : n.in) {
      if (!allowed.count(p.first)) {
        fail(n.id + ": unknown input port " + p.first);
      }
    }
    if (target == "cuda" &&
        std::set<std::string>{"Sin", "Cos", "Exp", "Log", "Tanh", "Sigmoid",
                              "Softmax", "Biquad", "BiquadState"}
            .count(n.op)) {
      fail(n.id + ": operation has no CUDA math lowering");
    }
    if (n.op == "Input" || n.op == "Weight" || n.op == "Constant" ||
        n.op == "Coordinate" || n.op == "SeededNoise") {
      n.shape = dims(n.props, "shape");
    } else if (n.op == "Output") {
      n.shape = input(n, "input").shape;
      outs.push_back(i);
    } else if (n.op == "Reshape") {
      n.shape = dims(n.props, "shape");
      if (count(n.shape) != count(input(n, "input").shape)) {
        fail("reshape size mismatch");
      }
    } else if (n.op == "Transpose") {
      auto s = input(n, "input").shape;
      auto axes = n.props.getArray("axes");
      if (!axes || axes->size() != s.size()) {
        fail("transpose axes required");
      }
      std::set<int64_t> seen;
      for (auto &a : *axes) {
        auto d = a.getAsInteger();
        if (!d || *d < 0 || size_t(*d) >= s.size() || !seen.insert(*d).second) {
          fail("invalid permutation");
        }
        n.shape.push_back(s[*d]);
      }
    } else if (n.op == "MatMul") {
      auto a = input(n, "a").shape, b = input(n, "b").shape;
      if (a.size() != 2 || b.size() != 2 || a[1] != b[0]) {
        fail("MatMul requires compatible rank-two tensors");
      }
      n.shape = {a[0], b[1]};
    } else if (n.op == "ReduceSum" || n.op == "ReduceMean") {
      auto s = input(n, "input").shape;
      auto axis = integer(n.props, "axis", 0);
      if (axis < 0 || size_t(axis) >= s.size()) {
        fail("invalid reduction axis");
      }
      n.shape = s;
      if (n.props.getBoolean("keepdims").value_or(false)) {
        n.shape[axis] = 1;
      } else {
        n.shape.erase(n.shape.begin() + axis);
      }
    } else if (n.op == "Conv2D" || n.op == "MaxPool2D") {
      auto a = input(n, "input").shape;
      if (a.size() != 4) {
        fail("Conv2D/MaxPool2D require NCHW input");
      }
      auto stride = integer(n.props, "stride", 1),
           padding = integer(n.props, "padding", 0);
      if (stride < 1 || padding < 0 || padding > 1024) {
        fail("invalid convolution stride/padding");
      }
      Shape w = n.op == "Conv2D" ? input(n, "weight").shape
                                 : dims(n.props, "kernel_shape");
      if (n.op == "Conv2D" && (w.size() != 4 || w[1] != a[1])) {
        fail("Conv2D weight must be OIHW");
      }
      if (n.op == "MaxPool2D" && w.size() != 2) {
        fail("MaxPool2D kernel_shape must rank two");
      }
      count(w);
      auto kh = w[w.size() - 2], kw = w.back();
      if (a[2] + 2 * padding < kh || a[3] + 2 * padding < kw) {
        fail("kernel exceeds padded input");
      }
      n.shape = {a[0], n.op == "Conv2D" ? w[0] : a[1],
                 (a[2] + 2 * padding - kh) / stride + 1,
                 (a[3] + 2 * padding - kw) / stride + 1};
    } else if (n.op == "Stencil2D") {
      n.shape = input(n, "input").shape;
      if (n.shape.size() != 3) {
        fail("Stencil2D requires HWC tensor");
      }
      auto ks = dims(n.props, "kernel_shape");
      auto kernel = n.props.getArray("kernel");
      if (ks.size() != 2 || !kernel || kernel->size() != count(ks)) {
        fail("invalid stencil kernel");
      }
      for (auto &v : *kernel) {
        if (!v.getAsNumber() || !std::isfinite(*v.getAsNumber())) {
          fail("invalid stencil coefficient");
        }
      }
      auto border = str(n.props, "border", "clamp");
      if (border != "clamp" && border != "zero" && border != "repeat") {
        fail("invalid stencil border");
      }
    } else if (n.op == "Biquad" || n.op == "BiquadState") {
      auto a = input(n, "audio").shape, s = input(n, "state").shape;
      if (a.size() != 2 || s != Shape{a[0], 2}) {
        fail("Biquad requires audio[C,T], state[C,2]");
      }
      auto coeff = n.props.getArray("coefficients");
      if (!coeff || coeff->size() != 5) {
        fail("Biquad requires five coefficients");
      }
      for (auto &v : *coeff) {
        if (!v.getAsNumber() || !std::isfinite(*v.getAsNumber())) {
          fail("invalid biquad coefficient");
        }
      }
      n.shape = n.op == "Biquad" ? a : s;
    } else if (n.op == "Select") {
      n.shape =
          broadcast(broadcast(input(n, "condition").shape, input(n, "a").shape),
                    input(n, "b").shape);
    } else if (n.op == "CFG") {
      n.shape = broadcast(input(n, "uncond").shape, input(n, "cond").shape);
    } else if (n.op == "DenoiseStep") {
      n.shape = broadcast(input(n, "latent").shape, input(n, "noise").shape);
    } else if (n.in.count("a")) {
      n.shape = broadcast(input(n, "a").shape, input(n, "b").shape);
    } else {
      n.shape = input(n, "input").shape;
    }
    count(n.shape);
    if ((n.op == "Input" || n.op == "Weight" || n.op == "Coordinate" ||
         n.op == "SeededNoise" || n.op == "Reshape") &&
        !n.props.get("shape")) {
      fail(n.id + ": explicit shape required");
    }
    if (n.op == "Constant") {
      auto value = n.props.get("value");
      if (!value) {
        fail(n.id + ": Constant value required");
      }
      if (auto a = value->getAsArray()) {
        if (a->size() != count(n.shape)) {
          fail("Constant size mismatch");
        }
        for (auto &v : *a) {
          auto d = v.getAsNumber();
          if (!d || !std::isfinite(*d)) {
            fail("invalid Constant value");
          }
        }
      } else {
        auto d = value->getAsNumber();
        if (!d || !std::isfinite(*d)) {
          fail("invalid Constant value");
        }
      }
    }
    if (n.op == "Coordinate" || n.op == "Softmax") {
      auto axis = integer(n.props, "axis",
                          n.op == "Softmax" ? int64_t(n.shape.size()) - 1 : 0);
      if (axis < 0 || size_t(axis) >= n.shape.size()) {
        fail(n.id + ": invalid axis");
      }
    }
    if (n.op == "SeededNoise") {
      integer(n.props, "seed", 0);
    }
  }
  std::set<size_t> reachable;
  std::function<void(size_t)> mark = [&](size_t i) {
    if (!reachable.insert(i).second) {
      return;
    }
    if (ns[i].op == "BiquadState") {
      mark(ns[i].origin);
    }
    for (auto &port : ns[i].in) {
      mark(port.second);
    }
  };
  for (auto i : outs) {
    mark(i);
  }
  order.erase(std::remove_if(order.begin(), order.end(),
                             [&](size_t i) { return !reachable.count(i); }),
              order.end());
  for (size_t i = 0; i < ns.size(); ++i) {
    if (reachable.count(i) && (ns[i].op == "Input" || ns[i].op == "Weight")) {
      ns[i].binding = ins.size();
      ins.push_back(i);
    }
  }
  if (outs.empty()) {
    fail("graph requires Output nodes");
  }
  std::map<size_t, size_t> offsets;
  size_t scratchCount = 0;
  const std::set<std::string> materialized = {
      "MatMul",  "Conv2D",    "MaxPool2D", "ReduceSum",  "ReduceMean",
      "Softmax", "Stencil2D", "Biquad",    "BiquadState"};
  std::map<size_t, size_t> uses;
  for (auto i : order) {
    for (auto &port : ns[i].in) {
      ++uses[port.second];
    }
  }
  if (target == "cpu") {
    for (auto i : order) {
      if (materialized.count(ns[i].op) ||
          (uses[i] > 1 && ns[i].op != "Input" && ns[i].op != "Weight" &&
           ns[i].op != "Constant" && ns[i].op != "Coordinate")) {
        offsets[i] = scratchCount;
        scratchCount += count(ns[i].shape);
        if (scratchCount > (1ULL << 28)) {
          fail("scratch exceeds allocation limit");
        }
      }
    }
  }
  std::ostringstream code;
  code << "#include <cstddef>\n#include <cmath>\n#include <cstdint>\n";
  for (auto i : order) {
    auto &n = ns[i];
    auto call = [&](const std::string &port, const std::string &ix = "i") {
      auto j = n.in.at(port);
      return "v" + std::to_string(j) + "(" +
             indexFor(ns[j].shape, n.shape, ix) + ",inputs,scratch)";
    };
    auto direct = [&](const std::string &port, const std::string &ix) {
      return "v" + std::to_string(n.in.at(port)) + "(" + ix +
             ",inputs,scratch)";
    };
    if (offsets.count(i)) {
      code << "static inline float v" << i
           << "(size_t i,const void* const*,const float* scratch){return "
              "scratch["
           << offsets[i] << "+i];}\n";
    }
    if (target == "cpu" && (n.op == "Biquad" || n.op == "BiquadState")) {
      continue;
    }
    code << "static inline float " << (offsets.count(i) ? "c" : "v") << i
         << "(size_t i,const void* const* inputs,const float* scratch){";
    std::string e;
    if (n.op == "Input" || n.op == "Weight") {
      e = "static_cast<const float*>(inputs[" + std::to_string(n.binding) +
          "])[i]";
    } else if (n.op == "Constant") {
      auto value = n.props.get("value");
      if (!value) {
        fail(n.id + ": Constant value required");
      }
      if (auto a = value->getAsArray()) {
        if (a->size() != count(n.shape)) {
          fail("Constant size mismatch");
        }
        code << "static const float data[]={";
        for (auto &v : *a) {
          auto d = v.getAsNumber();
          if (!d || !std::isfinite(*d)) {
            fail("invalid Constant value");
          }
          code << number(*d) << ",";
        }
        code << "};";
        e = "data[i]";
      } else {
        auto d = value->getAsNumber();
        if (!d || !std::isfinite(*d)) {
          fail("invalid Constant value");
        }
        e = number(*d);
      }
    } else if (n.op == "Output" || n.op == "Reshape" || n.op == "Cast") {
      e = direct("input", "i");
    } else if (n.op == "Coordinate") {
      auto axis = integer(n.props, "axis", 0);
      if (axis < 0 || size_t(axis) >= n.shape.size()) {
        fail("invalid coordinate axis");
      }
      size_t stride = 1;
      for (size_t k = axis + 1; k < n.shape.size(); ++k) {
        stride *= n.shape[k];
      }
      e = "float(i/" + std::to_string(stride) + "%" +
          std::to_string(n.shape[axis]) + ")";
      if (n.props.getBoolean("normalized").value_or(false)) {
        e = "(" + e + "+0.5f)/" + number(n.shape[axis]);
      }
    } else if (n.op == "SeededNoise") {
      code << "uint32_t x=uint32_t(i)+uint32_t(" << integer(n.props, "seed", 0)
           << ");x^=x>>16;x*=0x7feb352du;x^=x>>15;x*=0x846ca68bu;x^=x>>16;";
      e = "float(x>>8)*(1.0f/16777216.0f)";
    } else if (n.op == "Transpose") {
      auto s = input(n, "input").shape;
      auto a = n.props.getArray("axes");
      Shape stride(s.size(), 1);
      for (size_t k = s.size(); k > 1; --k) {
        stride[k - 2] = stride[k - 1] * s[k - 1];
      }
      std::string ix = "0";
      size_t os = 1;
      for (size_t k = n.shape.size(); k > 0; --k) {
        ix += "+(i/" + std::to_string(os) + "%" +
              std::to_string(n.shape[k - 1]) + ")*" +
              std::to_string(stride[*(*a)[k - 1].getAsInteger()]);
        os *= n.shape[k - 1];
      }
      e = direct("input", ix);
    } else if (n.op == "MatMul") {
      auto a = input(n, "a").shape, b = input(n, "b").shape;
      code << "float sum=0;for(size_t k=0;k<" << a[1] << ";++k)sum+="
           << direct("a", "(i/" + std::to_string(b[1]) + ")*" +
                              std::to_string(a[1]) + "+k")
           << "*"
           << direct("b",
                     "k*" + std::to_string(b[1]) + "+i%" + std::to_string(b[1]))
           << ";";
      e = "sum";
    } else if (n.op == "ReduceSum" || n.op == "ReduceMean") {
      auto s = input(n, "input").shape;
      auto axis = integer(n.props, "axis", 0);
      size_t stride = 1;
      for (size_t k = axis + 1; k < s.size(); ++k) {
        stride *= s[k];
      }
      auto ix = "(i/" + std::to_string(stride) + ")*" +
                std::to_string(stride * s[axis]) + "+i%" +
                std::to_string(stride) + "+k*" + std::to_string(stride);
      code << "float sum=0;for(size_t k=0;k<" << s[axis]
           << ";++k)sum+=" << direct("input", ix) << ";";
      e = n.op == "ReduceMean" ? "sum/" + number(s[axis]) : "sum";
    } else if (n.op == "Softmax") {
      auto axis = integer(n.props, "axis", int64_t(n.shape.size()) - 1);
      if (axis < 0 || size_t(axis) >= n.shape.size()) {
        fail("invalid softmax axis");
      }
      size_t stride = 1;
      for (size_t k = axis + 1; k < n.shape.size(); ++k) {
        stride *= n.shape[k];
      }
      auto ix = "i-(i/" + std::to_string(stride) + "%" +
                std::to_string(n.shape[axis]) + ")*" + std::to_string(stride) +
                "+k*" + std::to_string(stride);
      code << "float m=-INFINITY;for(size_t k=0;k<" << n.shape[axis]
           << ";++k)m=fmaxf(m," << direct("input", ix)
           << ");float sum=0;for(size_t k=0;k<" << n.shape[axis]
           << ";++k)sum+=expf(" << direct("input", ix) << "-m);";
      e = "expf(" + call("input") + "-m)/sum";
    } else if (n.op == "Conv2D" || n.op == "MaxPool2D") {
      auto a = input(n, "input").shape;
      auto w = n.op == "Conv2D" ? input(n, "weight").shape
                                : dims(n.props, "kernel_shape");
      auto kh = w[w.size() - 2], kw = w.back(),
           stride = integer(n.props, "stride", 1),
           padding = integer(n.props, "padding", 0);
      auto oc = n.shape[1], oh = n.shape[2], ow = n.shape[3];
      code << "size_t batch=i/" << oc * oh * ow << ",channel=i/" << oh * ow
           << "%" << oc << ";long y=long(i/" << ow << "%" << oh << ")*"
           << stride << "-" << padding << ",x=long(i%" << ow << ")*" << stride
           << "-" << padding
           << ";float sum=" << (n.op == "Conv2D" ? "0" : "-INFINITY") << ";";
      code << "for(size_t c=0;c<" << (n.op == "Conv2D" ? a[1] : 1)
           << ";++c)for(long ky=0;ky<" << kh << ";++ky)for(long kx=0;kx<" << kw
           << ";++kx){long yy=y+ky,xx=x+kx;if(yy>=0&&yy<" << a[2]
           << "&&xx>=0&&xx<" << a[3] << "){float v="
           << direct("input", "((batch*" + std::to_string(a[1]) + "+" +
                                  (n.op == "Conv2D" ? "c" : "channel") + ")*" +
                                  std::to_string(a[2]) + "+yy)*" +
                                  std::to_string(a[3]) + "+xx")
           << ";";
      if (n.op == "Conv2D") {
        code << "sum+=v*"
             << direct("weight", "((channel*" + std::to_string(a[1]) + "+c)*" +
                                     std::to_string(kh) + "+ky)*" +
                                     std::to_string(kw) + "+kx")
             << ";";
      } else {
        code << "sum=fmaxf(sum,v);";
      }
      code << "}}";
      e = "sum";
    } else if (n.op == "Stencil2D") {
      auto ks = dims(n.props, "kernel_shape");
      auto kernel = n.props.getArray("kernel");
      auto h = n.shape[0], w = n.shape[1], c = n.shape[2];
      auto border = str(n.props, "border", "clamp");
      code << "float sum=0;long y=long(i/" << w * c << "),x=long(i/" << c << "%"
           << w << ");";
      for (int64_t ky = 0; ky < ks[0]; ++ky) {
        for (int64_t kx = 0; kx < ks[1]; ++kx) {
          code << "{long yy=y+(" << ky - ks[0] / 2 << "),xx=x+("
               << kx - ks[1] / 2 << ");";
          if (border == "zero") {
            code << "if(yy>=0&&yy<" << h << "&&xx>=0&&xx<" << w << "){";
          } else if (border == "clamp") {
            code << "yy=yy<0?0:(yy>=" << h << "?" << h - 1
                 << ":yy);xx=xx<0?0:(xx>=" << w << "?" << w - 1 << ":xx);";
          } else {
            code << "yy=(yy%" << h << "+" << h << ")%" << h << ";xx=(xx%" << w
                 << "+" << w << ")%" << w << ";";
          }
          code << "sum+=" << number(*(*kernel)[ky * ks[1] + kx].getAsNumber())
               << "*"
               << direct("input", "(yy*" + std::to_string(w) + "+xx)*" +
                                      std::to_string(c) + "+i%" +
                                      std::to_string(c))
               << ";";
          if (border == "zero") {
            code << "}";
          }
          code << "}";
        }
      }
      e = "sum";
    } else if (n.op == "Biquad" || n.op == "BiquadState") {
      auto a = input(n, "audio").shape;
      auto coeff = n.props.getArray("coefficients");
      auto c = [&](size_t k) { return number(*(*coeff)[k].getAsNumber()); };
      auto channel = n.op == "Biquad" ? "i/" + std::to_string(a[1]) : "i/2";
      auto end = n.op == "Biquad" ? "i%" + std::to_string(a[1]) + "+1"
                                  : std::to_string(a[1]);
      code << "size_t channel=" << channel
           << ";float z1=" << direct("state", "channel*2")
           << ",z2=" << direct("state", "channel*2+1")
           << ",y=0;for(size_t t=0;t<" << end << ";++t){float x="
           << direct("audio", "channel*" + std::to_string(a[1]) + "+t")
           << ";y=" << c(0) << "*x+z1;z1=" << c(1) << "*x-" << c(3)
           << "*y+z2;z2=" << c(2) << "*x-" << c(4) << "*y;}";
      e = n.op == "Biquad" ? "y" : "(i%2==0?z1:z2)";
    } else if (n.op == "Select") {
      e = "(" + call("condition") + "!=0?" + call("a") + ":" + call("b") + ")";
    } else if (n.op == "CFG") {
      e = call("uncond") + "+" +
          number(n.props.getNumber("scale").value_or(1)) + "*(" + call("cond") +
          "-" + call("uncond") + ")";
    } else if (n.op == "DenoiseStep") {
      e = call("latent") + "-" + number(n.props.getNumber("step").value_or(1)) +
          "*" + call("noise");
    } else if (n.in.count("a")) {
      auto a = call("a"), b = call("b");
      std::map<std::string, std::string> ops = {
          {"Add", "+"},    {"Subtract", "-"}, {"Multiply", "*"},
          {"Divide", "/"}, {"Greater", ">"},  {"Less", "<"},
          {"Equal", "=="}};
      if (ops.count(n.op)) {
        e = "(" + a + ops[n.op] + b + ")";
      } else {
        e = (n.op == "Minimum" ? "fminf(" : "fmaxf(") + a + "," + b + ")";
      }
    } else {
      auto a = call("input");
      std::map<std::string, std::string> f = {
          {"Sin", "sinf"},   {"Cos", "cosf"},    {"Exp", "expf"},
          {"Log", "logf"},   {"Sqrt", "sqrtf"},  {"Abs", "fabsf"},
          {"Tanh", "tanhf"}, {"Floor", "floorf"}};
      if (f.count(n.op)) {
        e = f[n.op] + "(" + a + ")";
      } else if (n.op == "Relu") {
        e = "fmaxf(" + a + ",0.0f)";
      } else if (n.op == "Sigmoid") {
        e = "1.0f/(1.0f+expf(-(" + a + ")))";
      } else if (n.op == "Negate") {
        e = "-(" + a + ")";
      } else {
        fail("missing lowering " + n.op);
      }
    }
    code << "return " << e << ";}\n";
  }
  code << "extern \"C\" int nw_run(const void* const* inputs,size_t ni,void* "
          "const* outputs,size_t no,void* workspace,size_t "
          "workspaceBytes){if(ni!="
       << ins.size() << "||no!=" << outs.size() << "||workspaceBytes<"
       << scratchCount * 4
       << ")return 1;float* scratch=static_cast<float*>(workspace);";
  for (auto i : order) {
    if (offsets.count(i)) {
      auto &n = ns[i];
      if (n.op == "BiquadState") {
        continue;
      }
      if (n.op == "Biquad") {
        auto a = input(n, "audio").shape;
        auto coeff = n.props.getArray("coefficients");
        auto c = [&](size_t k) { return number(*(*coeff)[k].getAsNumber()); };
        auto call = [&](const std::string &port, const std::string &ix) {
          return "v" + std::to_string(n.in.at(port)) + "(" + ix +
                 ",inputs,scratch)";
        };
        code << "for(size_t channel=0;channel<" << a[0]
             << ";++channel){float z1=" << call("state", "channel*2")
             << ",z2=" << call("state", "channel*2+1") << ";for(size_t t=0;t<"
             << a[1] << ";++t){float x="
             << call("audio", "channel*" + std::to_string(a[1]) + "+t")
             << ";float y=" << c(0) << "*x+z1;z1=" << c(1) << "*x-" << c(3)
             << "*y+z2;z2=" << c(2) << "*x-" << c(4) << "*y;scratch["
             << offsets[i] << "+channel*" << a[1] << "+t]=y;}";
        if (biquadStates.count(i) && offsets.count(biquadStates.at(i))) {
          auto state = biquadStates.at(i);
          code << "scratch[" << offsets[state] << "+channel*2]=z1;scratch["
               << offsets[state] << "+channel*2+1]=z2;";
        }
        code << "}";
      } else {
        code << "for(size_t i=0;i<" << count(n.shape) << ";++i)scratch["
             << offsets[i] << "+i]=c" << i << "(i,inputs,scratch);";
      }
    }
  }
  for (size_t j = 0; j < outs.size(); ++j) {
    code << "for(size_t i=0;i<" << count(ns[outs[j]].shape)
         << ";++i)static_cast<float*>(outputs[" << j << "])[i]=v" << outs[j]
         << "(i,inputs,scratch);";
  }
  code << "return 0;}\n";
  if (target == "cuda") {
    auto generated = code.str();
    for (const std::string token :
         {",const float* scratch", ",inputs,scratch"}) {
      size_t at = 0;
      while ((at = generated.find(token, at)) != std::string::npos) {
        generated.replace(at, token.size(),
                          token == ",inputs,scratch" ? ",inputs" : "");
      }
    }
    code.str(generated);
  }
  const auto destination = std::filesystem::absolute(outDir);
  std::filesystem::create_directories(destination.parent_path());
  auto clang = llvm::sys::findProgramByName("clang++");
  if (!clang) {
    fail("clang++ is required for native compilation");
  }
  llvm::json::Object manifest;
  manifest["abi_version"] = 1;
  manifest["target"] = target;
  manifest["mode"] = mode;
  manifest["library"] = target == "cpu" ? "library.so" : "kernel.ptx";
  manifest["entry"] = target == "cpu" ? "nw_run" : "nw_kernel";
  manifest["alignment"] = 64;
  manifest["scratch_bytes"] = int64_t(scratchCount * 4);
  manifest["compiler"] =
      std::string("nodetool-native-v1 LLVM ") + LLVM_VERSION_STRING;
  manifest["compiler_build"] = NW_COMPILER_BUILD_HASH;
  manifest["target_features"] = target == "cpu" ? "generic" : "sm_52";
  manifest["target_triple"] = target == "cpu"
                                  ? llvm::sys::getDefaultTargetTriple()
                                  : "nvptx64-nvidia-cuda";
  manifest["kernel_count"] = target == "cuda" ? 1 : 0;
  manifest["output_loops"] = int64_t(outs.size());
  manifest["library_calls"] = llvm::json::Array{};
  size_t transferBytes = 0;
  if (target == "cuda") {
    for (auto i : ins) {
      transferBytes += count(ns[i].shape) * 4;
    }
    for (auto i : outs) {
      transferBytes += count(ns[i].shape) * 4;
    }
  }
  manifest["transfer_bytes_per_run"] = int64_t(transferBytes);
  auto contracts = [&](const std::vector<size_t> &list) {
    llvm::json::Array result;
    std::set<std::string> names;
    for (auto i : list) {
      auto &n = ns[i];
      if (!names.insert(n.name).second) {
        fail("duplicate binding name " + n.name);
      }
      llvm::json::Array shape;
      for (auto d : n.shape) {
        shape.push_back(d);
      }
      result.push_back(
          llvm::json::Object{{"name", n.name},
                             {"dtype", n.dtype},
                             {"shape", std::move(shape)},
                             {"bytes", int64_t(count(n.shape) * 4)},
                             {"alignment", 64}});
    }
    return result;
  };
  manifest["inputs"] = contracts(ins);
  manifest["outputs"] = contracts(outs);
  std::string identity;
  llvm::raw_string_ostream identityStream(identity);
  identityStream << llvm::json::Value(llvm::json::Object(manifest));
  identityStream.flush();
  llvm::SHA256 digest;
  digest.update(code.str());
  digest.update(identity);
  auto clangBinary = llvm::MemoryBuffer::getFile(*clang);
  if (!clangBinary) {
    fail("cannot identify clang++ executable");
  }
  digest.update((*clangBinary)->getBuffer());
  std::string hash;
  const char *hex = "0123456789abcdef";
  for (auto byte : digest.final()) {
    hash.push_back(hex[byte >> 4]);
    hash.push_back(hex[byte & 15]);
  }
  manifest["content_hash"] = hash;
  llvm::json::Array nodeMap;
  for (auto i : order) {
    if (ns[i].op != "BiquadState") {
      nodeMap.push_back(llvm::json::Object{
          {"function", "v" + std::to_string(i)}, {"node_id", ns[i].id}});
    }
  }
  manifest["diagnostic_nodes"] = std::move(nodeMap);
  if (std::filesystem::exists(destination)) {
    auto old =
        llvm::MemoryBuffer::getFile((destination / "manifest.json").string());
    if (old) {
      auto previous = llvm::json::parse((*old)->getBuffer());
      if (previous && previous->getAsObject() &&
          previous->getAsObject()->getString("content_hash") == hash &&
          std::filesystem::is_regular_file(
              destination / (target == "cpu" ? "library.so" : "kernel.ptx"))) {
        std::string refreshed;
        llvm::raw_string_ostream refreshedStream(refreshed);
        refreshedStream << llvm::json::Value(llvm::json::Object(manifest));
        refreshedStream.flush();
        std::string temporary = (destination / ".manifest-XXXXXX").string();
        int descriptor = mkstemp(temporary.data());
        if (descriptor < 0) {
          fail("cannot refresh cached diagnostic mapping");
        }
        close(descriptor);
        try {
          write(temporary, refreshed);
          std::filesystem::rename(temporary, destination / "manifest.json");
        } catch (...) {
          std::error_code ignored;
          std::filesystem::remove(temporary, ignored);
          throw;
        }
        return {refreshed};
      }
      if (!previous) {
        llvm::consumeError(previous.takeError());
      }
    }
    fail("output directory already exists with a different artifact. Choose a "
         "new --output directory");
  }
  std::string staging =
      (destination.parent_path() / ".nw-compile-XXXXXX").string();
  if (!mkdtemp(staging.data())) {
    fail("cannot create private compilation directory");
  }
  const std::filesystem::path dir(staging);
  struct Cleanup {
    std::filesystem::path path;
    ~Cleanup() {
      std::error_code error;
      std::filesystem::remove_all(path, error);
    }
  } cleanup{dir};
  write(dir / "source.cpp", code.str());
  auto invoke = [&](std::vector<std::string> arguments) {
    arguments.insert(arguments.begin(), *clang);
    std::vector<llvm::StringRef> refs;
    for (auto &argument : arguments) {
      refs.push_back(argument);
    }
    std::string error;
    const int status = llvm::sys::ExecuteAndWait(*clang, refs, std::nullopt, {},
                                                 60, 2048, &error);
    if (status != 0) {
      fail("native compiler failed (status " + std::to_string(status) +
           "): " + error);
    }
  };
  const std::string numerical =
      mode == "strict" ? "-fno-fast-math" : "-ffast-math";
  if (target == "cuda") {
    std::vector<std::pair<std::string, size_t>> kernels;
    for (auto i : outs) {
      kernels.emplace_back("v" + std::to_string(i), count(ns[i].shape));
    }
    compileGpu(code.str(), dir, mode, kernels);
  } else {
    invoke({"-std=c++17", "-O3", "-fPIC", "-shared", "-ffp-contract=off",
            numerical, (dir / "source.cpp").string(), "-o",
            (dir / "library.so").string()});
    invoke({"-std=c++17", "-O3", "-S", "-emit-llvm", "-ffp-contract=off",
            numerical, (dir / "source.cpp").string(), "-o",
            (dir / "optimized.ll").string()});
  }
  std::string text;
  llvm::raw_string_ostream stream(text);
  stream << llvm::json::Value(std::move(manifest));
  stream.flush();
  write(dir / "manifest.json", text);
  std::filesystem::rename(dir, destination);
  return {text};
}
} // namespace nw
