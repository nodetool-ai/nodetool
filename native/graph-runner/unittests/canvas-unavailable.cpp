#include <iostream>

#include "host/canvas.h"
#include "js/engine.h"
int main() {
  try {
    auto engine = gr::js::createQuickJsEngine();
    auto object = engine->object();
    gr::host::installCanvas(*engine, object, {});
    engine->set(engine->global(), "canvas", object);
    engine->evaluateScript(R"(
      if(canvas.available!==false)throw new Error('unavailable capability was advertised');
      for(const name of ['create','registerFont']) {
        let message='';try {canvas[name](1,1);}catch(e){message=e.message;}
        if(message!=='canvas: Cairo/Pango support was not built')throw new Error(name+' did not fail explicitly');
      }
    )",
                           "canvas-unavailable.js");
    std::cout << "Canvas unavailable checks passed\n";
    return 0;
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
