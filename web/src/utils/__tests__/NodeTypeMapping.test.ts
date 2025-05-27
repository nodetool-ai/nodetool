import {
  contentTypeToNodeType,
  inputForType,
  outputForType,
  constantForType
} from '../NodeTypeMapping';

describe('NodeTypeMapping', () => {
  test('contentTypeToNodeType maps known types', () => {
    expect(contentTypeToNodeType('image/jpeg')).toBe('image');
    expect(contentTypeToNodeType('application/pdf')).toBe('document');
    expect(contentTypeToNodeType('unknown/unknown')).toBeNull();
  });

  test('inputForType returns correct mapping', () => {
    expect(inputForType('str')).toBe('nodetool.input.StringInput');
    expect(inputForType('image')).toBe('nodetool.input.ImageInput');
    expect(inputForType('bogus' as any)).toBeNull();
  });

  test('outputForType returns correct mapping', () => {
    expect(outputForType('text')).toBe('nodetool.output.TextOutput');
    expect(outputForType('audio')).toBe('nodetool.output.AudioOutput');
    expect(outputForType('bogus' as any)).toBeNull();
  });

  test('constantForType returns correct mapping', () => {
    expect(constantForType('float')).toBe('nodetool.constant.Float');
    expect(constantForType('folder')).toBe('nodetool.input.Folder');
    expect(constantForType('bogus' as any)).toBeNull();
  });
});
