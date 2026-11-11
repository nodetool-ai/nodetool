import { BaseNode } from '@nodetool-ai/node-sdk';
import { yogaLayoutFixture } from './webassembly-yoga-fixture.mjs';
export class YogaLayoutNode extends BaseNode {
  static nodeType = 'nodetool.test.YogaLayout';
  static title = 'Yoga Layout Fixture';
  static metadataOutputTypes = { output: 'list' };
  async process() { return { output: yogaLayoutFixture() }; }
}
