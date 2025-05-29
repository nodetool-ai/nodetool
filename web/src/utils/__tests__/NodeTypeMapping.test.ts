import { contentTypeToNodeType, inputForType, outputForType, constantForType } from '../NodeTypeMapping';

describe('NodeTypeMapping utilities', () => {
  describe('contentTypeToNodeType', () => {
    test('maps common content types', () => {
      expect(contentTypeToNodeType('application/json')).toBe('text');
      expect(contentTypeToNodeType('image/png')).toBe('image');
      expect(contentTypeToNodeType('video/mp4')).toBe('video');
      expect(contentTypeToNodeType('audio/webm')).toBe('audio');
      expect(contentTypeToNodeType('application/pdf')).toBe('document');
      expect(contentTypeToNodeType('folder')).toBe('folder');
    });

    test('returns null for unknown content type', () => {
      expect(contentTypeToNodeType('application/unknown')).toBeNull();
    });
  });

  describe('inputForType', () => {
    test('maps type names to input node types', () => {
      expect(inputForType('str')).toBe('nodetool.input.StringInput');
      expect(inputForType('dataframe')).toBe('nodetool.input.DataFrameInput');
      expect(inputForType('audio')).toBe('nodetool.input.AudioInput');
      expect(inputForType('document')).toBe('nodetool.input.DocumentInput');
    });

    test('returns null for unknown type', () => {
      expect(inputForType('unknown')).toBeNull();
    });
  });

  describe('outputForType', () => {
    test('maps type names to output node types', () => {
      expect(outputForType('str')).toBe('nodetool.output.StringOutput');
      expect(outputForType('text')).toBe('nodetool.output.TextOutput');
      expect(outputForType('image')).toBe('nodetool.output.ImageOutput');
      expect(outputForType('dataframe')).toBe('nodetool.output.DataFrameOutput');
    });

    test('returns null for unknown type', () => {
      expect(outputForType('unknown')).toBeNull();
    });
  });

  describe('constantForType', () => {
    test('maps type names to constant node types', () => {
      expect(constantForType('str')).toBe('nodetool.constant.String');
      expect(constantForType('text')).toBe('nodetool.constant.Text');
      expect(constantForType('image')).toBe('nodetool.constant.Image');
      expect(constantForType('folder')).toBe('nodetool.input.Folder');
    });

    test('returns null for unknown type', () => {
      expect(constantForType('unknown')).toBeNull();
    });
  });
});
