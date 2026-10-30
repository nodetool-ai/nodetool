export const prepareAsyncNodeCompatibility = async (vm, sandboxOptions) => {
    vm.unwrapResult(await vm.evalCodeAsync(`
      import 'node:buffer';
      import 'node:util';
      import 'node:url';
      import '@node_compatibility/headers';
      import '@node_compatibility/request';
      import '@node_compatibility/response';
      ${sandboxOptions.enableTestUtils ? "import 'test'" : ''}
      `, undefined, { type: 'module' })).dispose();
};
