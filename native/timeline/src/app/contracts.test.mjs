import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compare } from './compare-ctest.mjs';
import { loadSuites, checkSuiteReport } from '../../scripts/op-conformance.mjs';

test('main uses the resolved source after default startup dispatch', () => {
  const source = readFileSync(new URL('../main.cpp', import.meta.url), 'utf8');
  const main = source.match(/\bint\s+main\s*\(/);
  assert.ok(main, 'main entry point must be inspected');
  const body = source.slice(main.index);
  const dispatch = body.match(/\bnt::app::dispatchDefaultStartup\s*\(/);
  assert.ok(dispatch, 'main must dispatch default startup');
  assert.doesNotMatch(body.slice(dispatch.index), /\bpositionalArguments\s*\(/,
    'use the resolved source instead of rereading positional arguments after default startup');
});

test('ctest contract comparison detects missing tests and changed properties', () => {
  const before = { tests: [{ name: 'existing', command: ['/build/test', '--arg'], properties: [
    { name: 'ENVIRONMENT', value: ['QT_QPA_PLATFORM=offscreen'] },
    { name: 'FIXTURES_REQUIRED', value: ['media'] }, { name: 'LABELS', value: ['render'] },
    { name: 'PASS_REGULAR_EXPRESSION', value: ['pass'] } ] }] };
  const after = { tests: [...structuredClone(before.tests), ...['s1_contracts', 'tst_inspectorprimitives', 'tst_seamexample'].map(name => ({ name }))] };
  compare(before, after);
  assert.throws(() => compare(before, { tests: [] }), /dropped test/);
  for (const property of before.tests[0].properties) {
    const broken = structuredClone(after);
    broken.tests[0].properties.find(p => p.name === property.name).value = ['broken'];
    assert.throws(() => compare(before, broken), /changed test/);
  }
  const broken = structuredClone(after);
  broken.tests[0].command.push('--broken');
  assert.throws(() => compare(before, broken), /changed test/);
  assert.throws(() => compare({ tests: [] }, after), /inspected no tests/);
});

test('suite discovery rejects load errors, empty suites and invalid configs', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 's1-suites-'));
  try {
    writeFileSync(path.join(directory, 'a.mjs'), 'throw new Error("planted load error")');
    writeFileSync(path.join(directory, 'b.mjs'), 'export default {config:"vitest.config.mts", tests:[]}');
    writeFileSync(path.join(directory, 'c.mjs'), 'export default {config:"missing.mts", tests:["test.ts"]}');
    const result = await loadSuites(directory, { bin: '/tmp/timeline-ops' });
    assert.equal(result.problems.length, 3);
    assert.equal(result.runs.length, 0);
    writeFileSync(path.join(directory, 'd.mjs'), 'export default {config:"vitest.config.mts", tests:["/test.ts"]}');
    const next = await loadSuites(directory, { bin: '/tmp/timeline-ops' });
    assert.equal(next.runs.length, 1);
    assert.equal(next.problems.length, 3);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('suite report fails closed on missing, empty, failed and uncollected suites', () => {
  const requested = '/comparison.test.ts';
  const report = { exitCode: 0, tests: [requested], testResults: [] };
  assert.match(checkSuiteReport(report).problems.join(), /suite missing/);
  report.testResults.push({ name: requested, status: 'passed', assertionResults: [] });
  assert.match(checkSuiteReport(report).problems.join(), /no passing comparison/);
  report.testResults[0].status = 'failed';
  report.testResults[0].message = 'planted collection error';
  assert.match(checkSuiteReport(report).problems.join(), /suite error/);
  report.testResults[0] = { name: requested, status: 'passed', assertionResults: [{ status: 'passed', title: 'comparison', ancestorTitles: [] }] };
  assert.equal(checkSuiteReport(report).passed, 1);
  assert.equal(checkSuiteReport(report).problems.length, 0);
  report.exitCode = 1;
  assert.match(checkSuiteReport(report).problems.join(), /vitest exited 1/);
});

test('QML-only packages discover resources, singletons, panels and nested modules', { timeout: 180000 }, () => {
  const directory = mkdtempSync(path.join(tmpdir(), 's1-qml-'));
  const source = path.resolve(import.meta.dirname, '../..');
  const build = path.join(directory, 'build');
  const run = (command, args) => {
    const result = spawnSync(command, args, { encoding: 'utf8', env: { ...process.env, QT_QPA_PLATFORM: 'offscreen' } });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return result.stdout + result.stderr;
  };
  try {
    for (const entry of readdirSync(source)) {
      if (/^build/.test(entry)) continue;
      const from = path.join(source, entry);
      const to = path.join(directory, entry);
      if (entry === 'src' || entry === 'qml' || entry === 'CMakeLists.txt') cpSync(from, to, { recursive: true });
      else symlinkSync(from, to);
    }
    const qml = path.join(directory, 'qml', 'seamProbe');
    mkdirSync(qml);
    writeFileSync(path.join(qml, 'UnlistedPanel.qml'), '// nt-panel: slot=overlay id=unlisted order=-10 title="Unlisted panel"\nimport QtQuick\nItem {}\n');
    writeFileSync(path.join(qml, 'UnlistedSingleton.qml'), 'pragma Singleton\nimport QtQml\nQtObject {}\n');
    writeFileSync(path.join(qml, 'helper.js'), '.pragma library\nfunction answer() { return 42 }\n');
    writeFileSync(path.join(qml, 'module.cmake'), `
function(nt_qml_probe)
    if(NOT EXISTS "\$\{CMAKE_CURRENT_BINARY_DIR\}/nt_qml_panels.cpp")
        message(FATAL_ERROR "QML panel registration was not generated")
    endif()
    get_source_file_property(singleton qml/seamProbe/UnlistedSingleton.qml QT_QML_SINGLETON_TYPE)
    if(NOT singleton)
        message(FATAL_ERROR "unlisted singleton was not detected")
    endif()
    foreach(resource qml/seamProbe/UnlistedPanel.qml qml/seamProbe/UnlistedSingleton.qml qml/seamProbe/helper.js)
        if(NOT resource IN_LIST NT_qml_files)
            message(FATAL_ERROR "unlisted resource missing: \$\{resource\}")
        endif()
    endforeach()
    qt_add_executable(qml_probe src/app/qml_probe.cpp src/app/PanelRegistry.cpp
        "\$\{CMAKE_CURRENT_BINARY_DIR\}/nt_qml_panels.cpp")
    target_include_directories(qml_probe PRIVATE src)
    target_link_libraries(qml_probe PRIVATE Qt6::Core Qt6::Qml)
    qt_add_resources(qml_probe probe PREFIX /qt/qml/NodeTool/Timeline
        FILES qml/seamProbe/UnlistedPanel.qml)
endfunction()
nt_tests(nt_qml_probe)
`);
    writeFileSync(path.join(directory, 'src/app/qml_probe.cpp'), `#include "app/PanelRegistry.h"
#include <QCoreApplication>
#include <QFile>
int main(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    const auto panels = PanelRegistry().forSlot("overlay");
    if (panels.size() != 1) return 1;
    const auto panel = panels[0].toMap();
    if (panel["id"] != "unlisted" || panel["order"] != -10 || panel["title"] != "Unlisted panel") return 2;
    const auto url = panel["source"].toUrl();
    return url == QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/seamProbe/UnlistedPanel.qml") && QFile::exists(":" + url.path()) ? 0 : 3;
}
`);
    const cache = [path.join(process.cwd(), 'CMakeCache.txt'), path.join(source, 'build/CMakeCache.txt')].find(existsSync);
    const qtDir = cache && readFileSync(cache, 'utf8').match(/^Qt6_DIR:PATH=(.+)$/m)?.[1].trim();
    const prefix = process.env.CMAKE_PREFIX_PATH ?? (qtDir ? path.resolve(qtDir, '../../..') : undefined);
    const args = ['-S', directory, '-B', build, '-G', 'Ninja', '-DCMAKE_BUILD_TYPE=Release',
      ...(prefix ? [`-DCMAKE_PREFIX_PATH=${prefix}`] : [])];
    const output = run('cmake', args);
    assert.doesNotMatch(output, /Warning \(dev\)/);
    const expected = [...readdirSync(path.join(directory, 'qml'), { recursive: true })
      .filter(file => /\.(qml|js)$/.test(file)).map(file => `qml/${file}`), 'src/app/PanelSlot.qml'].sort();
    // The shared module keeps the complete discovered resource list for every host.
    for (const target of ['timeline_qml']) {
      const resources = readFileSync(path.join(build, '.qt', 'rcc', `${target}_raw_qml_0.qrc`), 'utf8');
      assert.match(resources, /qml\/seamProbe\/UnlistedPanel.qml/);
      assert.match(resources, /qml\/seamProbe\/helper.js/);
      assert.doesNotMatch(resources, /src\/app\/example/);
      const aliases = [...resources.matchAll(/<file alias="([^"]+)"/g)].map(match => match[1]).sort();
      assert.deepEqual(aliases, expected, `${target} resources must match discovery without duplicates`);
    }
    run('cmake', ['--build', build, '--target', 'qml_probe', '-j', '2']);
    run(path.join(build, 'qml_probe'), []);
    writeFileSync(path.join(qml, 'UnlistedPanel.qml'), '// nt-panel: slot=unknown id=broken order=oops\nimport QtQuick\nItem {}\n');
    const malformed = spawnSync('cmake', args, { encoding: 'utf8' });
    assert.notEqual(malformed.status, 0);
    assert.match(malformed.stdout + malformed.stderr, /UnlistedPanel.qml/);
    assert.match(malformed.stdout + malformed.stderr, /[Mm]alformed.*nt-panel/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
