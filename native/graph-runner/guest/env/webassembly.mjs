// Wasmtime executes the installed module. JavaScript owns only API wrappers.
export function installWebAssembly(target = globalThis) {
  if (target.WebAssembly) return;
  const host = target.__host?.webassembly;
  if (!host) return;
  class CompileError extends Error {}
  class LinkError extends Error {}
  class RuntimeError extends Error {}
  const modules = new WeakMap();
  class Module {
    constructor(bytes) {
      try { modules.set(this, host.compile(bytes)); }
      catch (error) { throw new CompileError(error.message); }
    }
  }
  class Memory {
    constructor() { throw new TypeError('Standalone WebAssembly.Memory is unsupported'); }
    get buffer() { return memories.get(this).buffer(); }
    grow(pages) { return memories.get(this).grow(pages); }
  }
  const memories = new WeakMap();
  class Table {
    constructor() { throw new TypeError('Standalone WebAssembly.Table is unsupported'); }
    get length() { return tables.get(this).length(); }
    get(index) { return tables.get(this).get(index); }
  }
  const tables = new WeakMap();
  class Instance {
    constructor(module, imports = {}) {
      if (!modules.has(module)) throw new TypeError('Expected WebAssembly.Module');
      let exports;
      try { exports = host.instantiate(modules.get(module), imports); }
      catch (error) { throw new LinkError(error.message); }
      for (const name of Object.keys(exports)) {
        const value = exports[name];
        if (value.kind === 'memory') {
          exports[name] = Object.create(Memory.prototype);
          memories.set(exports[name], value);
        } else if (value.kind === 'table') {
          exports[name] = Object.create(Table.prototype);
          tables.set(exports[name], value);
        }
      }
      Object.defineProperty(this, 'exports', { value: Object.freeze(exports), enumerable: true });
    }
  }
  target.WebAssembly = {
    Module, Instance, Memory, Table, CompileError, LinkError, RuntimeError,
    async compile(bytes) { return new Module(bytes); },
    async instantiate(bytes, imports) {
      if (bytes instanceof Module) return new Instance(bytes, imports);
      const module = new Module(bytes);
      return { module, instance: new Instance(module, imports) };
    },
    validate(bytes) { try { new Module(bytes); return true; } catch { return false; } },
  };
}
installWebAssembly();
