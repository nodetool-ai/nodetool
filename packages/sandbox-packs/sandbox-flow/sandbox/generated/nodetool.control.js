// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode, streamNode } from "../guest-core.js";
function if_(inputs) {
  return callNode("nodetool.control.If", inputs);
}
if_.stream = function(inputs) {
  return streamNode("nodetool.control.If", inputs);
};
function forEach(inputs) {
  return callNode("nodetool.control.ForEach", inputs);
}
forEach.stream = function(inputs) {
  return streamNode("nodetool.control.ForEach", inputs);
};
function collection(inputs) {
  return callNode("nodetool.control.Collection", inputs);
}
collection.stream = function(inputs) {
  return streamNode("nodetool.control.Collection", inputs);
};
function repeatCount(inputs) {
  return callNode("nodetool.control.RepeatCount", inputs);
}
repeatCount.stream = function(inputs) {
  return streamNode("nodetool.control.RepeatCount", inputs);
};
function repeatValue(inputs) {
  return callNode("nodetool.control.RepeatValue", inputs);
}
repeatValue.stream = function(inputs) {
  return streamNode("nodetool.control.RepeatValue", inputs);
};
function take(inputs) {
  return callNode("nodetool.control.Take", inputs);
}
take.stream = function(inputs) {
  return streamNode("nodetool.control.Take", inputs);
};
function drop(inputs) {
  return callNode("nodetool.control.Drop", inputs);
}
drop.stream = function(inputs) {
  return streamNode("nodetool.control.Drop", inputs);
};
function takeWhile(inputs) {
  return callNode("nodetool.control.TakeWhile", inputs);
}
takeWhile.stream = function(inputs) {
  return streamNode("nodetool.control.TakeWhile", inputs);
};
function dropWhile(inputs) {
  return callNode("nodetool.control.DropWhile", inputs);
}
dropWhile.stream = function(inputs) {
  return streamNode("nodetool.control.DropWhile", inputs);
};
function filterEqual(inputs) {
  return callNode("nodetool.control.FilterEqual", inputs);
}
filterEqual.stream = function(inputs) {
  return streamNode("nodetool.control.FilterEqual", inputs);
};
function filterCode(inputs) {
  return callNode("nodetool.control.FilterCode", inputs);
}
filterCode.stream = function(inputs) {
  return streamNode("nodetool.control.FilterCode", inputs);
};
function chunk(inputs) {
  return callNode("nodetool.control.Chunk", inputs);
}
chunk.stream = function(inputs) {
  return streamNode("nodetool.control.Chunk", inputs);
};
function last(inputs) {
  return callNode("nodetool.control.Last", inputs);
}
last.stream = function(inputs) {
  return streamNode("nodetool.control.Last", inputs);
};
function count(inputs) {
  return callNode("nodetool.control.Count", inputs);
}
count.stream = function(inputs) {
  return streamNode("nodetool.control.Count", inputs);
};
function distinct(inputs) {
  return callNode("nodetool.control.Distinct", inputs);
}
distinct.stream = function(inputs) {
  return streamNode("nodetool.control.Distinct", inputs);
};
function tap(inputs) {
  return callNode("nodetool.control.Tap", inputs);
}
tap.stream = function(inputs) {
  return streamNode("nodetool.control.Tap", inputs);
};
function collect(inputs) {
  return callNode("nodetool.control.Collect", inputs);
}
collect.stream = function(inputs) {
  return streamNode("nodetool.control.Collect", inputs);
};
function reroute(inputs) {
  return callNode("nodetool.control.Reroute", inputs);
}
reroute.stream = function(inputs) {
  return streamNode("nodetool.control.Reroute", inputs);
};
function switch_(inputs) {
  return callNode("nodetool.control.Switch", inputs);
}
switch_.stream = function(inputs) {
  return streamNode("nodetool.control.Switch", inputs);
};
function tryCatch(inputs) {
  return callNode("nodetool.control.TryCatch", inputs);
}
tryCatch.stream = function(inputs) {
  return streamNode("nodetool.control.TryCatch", inputs);
};
function zip(inputs) {
  return callNode("nodetool.control.Zip", inputs);
}
zip.stream = function(inputs) {
  return streamNode("nodetool.control.Zip", inputs);
};
function cross(inputs) {
  return callNode("nodetool.control.Cross", inputs);
}
cross.stream = function(inputs) {
  return streamNode("nodetool.control.Cross", inputs);
};
export {
  chunk,
  collect,
  collection,
  count,
  cross,
  distinct,
  drop,
  dropWhile,
  filterCode,
  filterEqual,
  forEach,
  if_,
  last,
  repeatCount,
  repeatValue,
  reroute,
  switch_,
  take,
  takeWhile,
  tap,
  tryCatch,
  zip
};
