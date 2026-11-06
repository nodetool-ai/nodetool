import { execFileSync } from 'node:child_process';
import { describe, it, expect } from 'vitest';
import * as oracle from '../../../../../web/src/components/timeline/Inspector/InspectorPrimitives.helpers';

describe('QML inspector helpers against TypeScript', () => {
  const cases: Record<string, unknown[][]> = {
    formatTimecode: [0, 1, 33, 999, 1000, 59999, 3600000, -10, 1001000].flatMap(ms => [0, 1, 24, 29.97, 30, 59.94].map(fps => [ms, fps])),
    parseTimecode: ['', ' ', '1000', '12.5', '-2', '1:02', '1:02:03', '01:02:03:14', ' 1 : 02 ', '1:2:3:4:5', 'abc', '1::2', 'Infinity', '2:99:99:99'].flatMap(s => [0, 24, 29.97, 60].map(fps => [s, fps])),
    parseSeconds: ['', ' ', '4.60s', '1S', '0', '-1', 'NaN', 'Infinity', '0x10', '.25', '1e2', '5ms'].map(s => [s]),
    parseNumberList: ['', '4, 2, 1', '2 3\t4', '1,', ',1', '0x10, -2', 'NaN', 'Infinity', 'a'].map(s => [s]),
    formatNumberList: [[[]], [[4, 2, 1]], [[0, -1, 0.25]], []],
    parseGradientStops: ['', '1:#fff, 0:#000', '-1:red,2:rgb(0:0:0)', 'x:red', '0:', '0:red,', ':blue'].map(s => [s]),
    formatGradientStops: [[[]], [[{ offset: 0, color: '#000' }, { offset: 1, color: 'rgb(0:0:0)' }]], []],
    parseCurvePoints: ['', '0,0 0.5,0.6 1,1', '2,-1 -1,2', '0', '0,0,0', 'a,1', ',1'].map(s => [s]),
    formatCurvePoints: [[[]], [[{ x: 0.5, y: 0.6 }]], []],
    parseFiniteNumber: ['', ' ', '0', ' -2 ', '.2', '1e3', 'NaN', 'Infinity', '0x20', '3px'].map(s => [s])
  };
  for (const [name, args] of Object.entries(cases)) {
    it(name, () => {
      const binary = process.env.NT_INSPECTOR_HELPERS;
      if (!binary) throw new Error('NT_INSPECTOR_HELPERS is required');
      const actual: unknown = JSON.parse(execFileSync(binary, ['--helpers'], {
        input: JSON.stringify(args.map(a => [name, a])), encoding: 'utf8',
        env: { ...process.env, QT_QPA_PLATFORM: 'offscreen', QT_QUICK_BACKEND: 'software' }
      }));
      const fn = Reflect.get(oracle, name);
      expect(actual).toEqual(args.map(a => Reflect.apply(fn, null, a)));
    });
  }
});
