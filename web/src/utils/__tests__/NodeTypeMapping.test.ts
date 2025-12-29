import {
  contentTypeToNodeType,
  inputForType,
  outputForType,
  constantForType,
  constantToInputType,
  inputToConstantType
} from "../NodeTypeMapping";

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

  describe('constantToInputType', () => {
    test('converts String constant to StringInput', () => {
      expect(constantToInputType('nodetool.constant.String')).toBe(
        'nodetool.input.StringInput'
      );
    });

    test('converts Integer constant to IntegerInput', () => {
      expect(constantToInputType('nodetool.constant.Integer')).toBe(
        'nodetool.input.IntegerInput'
      );
    });

    test('converts Float constant to FloatInput', () => {
      expect(constantToInputType('nodetool.constant.Float')).toBe(
        'nodetool.input.FloatInput'
      );
    });

    test('converts Bool constant to BooleanInput', () => {
      expect(constantToInputType('nodetool.constant.Bool')).toBe(
        'nodetool.input.BooleanInput'
      );
    });

    test('converts Image constant to ImageInput', () => {
      expect(constantToInputType('nodetool.constant.Image')).toBe(
        'nodetool.input.ImageInput'
      );
    });

    test('converts Video constant to VideoInput', () => {
      expect(constantToInputType('nodetool.constant.Video')).toBe(
        'nodetool.input.VideoInput'
      );
    });

    test('converts Audio constant to AudioInput', () => {
      expect(constantToInputType('nodetool.constant.Audio')).toBe(
        'nodetool.input.AudioInput'
      );
    });

    test('converts Document constant to DocumentInput', () => {
      expect(constantToInputType('nodetool.constant.Document')).toBe(
        'nodetool.input.DocumentInput'
      );
    });

    test('converts DataFrame constant to DataFrameInput', () => {
      expect(constantToInputType('nodetool.constant.DataFrame')).toBe(
        'nodetool.input.DataFrameInput'
      );
    });

    test('returns null for non-convertible constant type', () => {
      expect(constantToInputType('nodetool.constant.List')).toBeNull();
      expect(constantToInputType('nodetool.constant.Date')).toBeNull();
      expect(constantToInputType('unknown.type')).toBeNull();
    });
  });

  describe('inputToConstantType', () => {
    test('converts StringInput to String constant', () => {
      expect(inputToConstantType('nodetool.input.StringInput')).toBe(
        'nodetool.constant.String'
      );
    });

    test('converts IntegerInput to Integer constant', () => {
      expect(inputToConstantType('nodetool.input.IntegerInput')).toBe(
        'nodetool.constant.Integer'
      );
    });

    test('converts FloatInput to Float constant', () => {
      expect(inputToConstantType('nodetool.input.FloatInput')).toBe(
        'nodetool.constant.Float'
      );
    });

    test('converts BooleanInput to Bool constant', () => {
      expect(inputToConstantType('nodetool.input.BooleanInput')).toBe(
        'nodetool.constant.Bool'
      );
    });

    test('converts ImageInput to Image constant', () => {
      expect(inputToConstantType('nodetool.input.ImageInput')).toBe(
        'nodetool.constant.Image'
      );
    });

    test('converts VideoInput to Video constant', () => {
      expect(inputToConstantType('nodetool.input.VideoInput')).toBe(
        'nodetool.constant.Video'
      );
    });

    test('converts AudioInput to Audio constant', () => {
      expect(inputToConstantType('nodetool.input.AudioInput')).toBe(
        'nodetool.constant.Audio'
      );
    });

    test('converts DocumentInput to Document constant', () => {
      expect(inputToConstantType('nodetool.input.DocumentInput')).toBe(
        'nodetool.constant.Document'
      );
    });

    test('converts DataFrameInput to DataFrame constant', () => {
      expect(inputToConstantType('nodetool.input.DataFrameInput')).toBe(
        'nodetool.constant.DataFrame'
      );
    });

    test('returns null for non-convertible input type', () => {
      expect(inputToConstantType('nodetool.input.FolderPathInput')).toBeNull();
      expect(inputToConstantType('nodetool.input.ColorInput')).toBeNull();
      expect(inputToConstantType('unknown.type')).toBeNull();
    });
  });
});
