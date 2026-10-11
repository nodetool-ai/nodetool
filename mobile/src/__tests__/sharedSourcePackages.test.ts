/**
 * Metro, TypeScript and Jest must resolve the shared packages to the same
 * source. When they disagree, the app ships one version and the tests check
 * another: mobile once bundled a stale `@nodetool-ai/protocol` from npm while
 * Jest compiled the current source.
 */
import path from 'path';

const mobileRoot = path.resolve(__dirname, '../..');
const repoRoot = path.resolve(mobileRoot, '..');

const metroConfig = require('../../metro.config.js');
const jestConfig = require('../../jest.config.js');
const tsconfig = require('../../tsconfig.json');
const packageJson = require('../../package.json');

const SOURCE_ENTRIES: Record<string, string> = {
  '@nodetool-ai/app-runtime': 'packages/app-runtime/src/index.ts',
  '@nodetool-ai/protocol': 'packages/protocol/src/index.ts',
};

describe('shared source packages', () => {
  it.each(Object.entries(SOURCE_ENTRIES))('Metro bundles %s from source', (name, entry) => {
    const fallback = jest.fn();
    const result = metroConfig.resolver.resolveRequest(
      { resolveRequest: fallback, originModulePath: path.join(mobileRoot, 'src/App.tsx') },
      name,
      'ios'
    );
    expect(result).toEqual({ type: 'sourceFile', filePath: path.join(repoRoot, entry) });
    expect(fallback).not.toHaveBeenCalled();
  });

  it.each(Object.entries(SOURCE_ENTRIES))('TypeScript reads %s from source', (name, entry) => {
    expect(tsconfig.compilerOptions.paths[name]).toEqual([`../${entry}`]);
  });

  it.each(Object.entries(SOURCE_ENTRIES))('Jest compiles %s from source', (name, entry) => {
    expect(jestConfig.moduleNameMapper[`^${name}$`]).toBe(`<rootDir>/../${entry}`);
  });

  it('installs no copy of a source package from the registry', () => {
    for (const name of Object.keys(SOURCE_ENTRIES)) {
      expect(packageJson.dependencies[name]).toBeUndefined();
    }
  });
});
