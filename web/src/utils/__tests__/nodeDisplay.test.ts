/**
 * @jest-environment node
 */

import { getNodeDisplayName, getNodeNamespace } from '../nodeDisplay';

describe('getNodeDisplayName', () => {
  it('should return the last part after splitting by dot', () => {
    expect(getNodeDisplayName('com.example.MyNode')).toBe('MyNode');
    expect(getNodeDisplayName('org.project.module.Component')).toBe('Component');
    expect(getNodeDisplayName('a.b.c.d.e')).toBe('e');
  });

  it('should return the whole string if no dots present', () => {
    expect(getNodeDisplayName('SimpleNode')).toBe('SimpleNode');
    expect(getNodeDisplayName('Node123')).toBe('Node123');
    expect(getNodeDisplayName('node-with-dashes')).toBe('node-with-dashes');
  });

  it('should handle empty string', () => {
    expect(getNodeDisplayName('')).toBe('');
  });

  it('should handle string ending with dot', () => {
    // When string ends with dot, the last part is empty but function returns original text
    expect(getNodeDisplayName('com.example.')).toBe('com.example.');
    expect(getNodeDisplayName('a.b.c.')).toBe('a.b.c.');
  });

  it('should handle string starting with dot', () => {
    expect(getNodeDisplayName('.MyNode')).toBe('MyNode');
    expect(getNodeDisplayName('.com.example.MyNode')).toBe('MyNode');
  });

  it('should handle multiple consecutive dots', () => {
    expect(getNodeDisplayName('com..example..MyNode')).toBe('MyNode');
    expect(getNodeDisplayName('a...b')).toBe('b');
  });

  it('should handle single dot', () => {
    // A single dot returns the original text since last part is empty
    expect(getNodeDisplayName('.')).toBe('.');
  });

  it('should handle multiple dots only', () => {
    // Multiple dots return the original text since last part is empty
    expect(getNodeDisplayName('...')).toBe('...');
    expect(getNodeDisplayName('..')).toBe('..');
  });

  it('should handle special characters', () => {
    expect(getNodeDisplayName('com.example.My-Node_v2')).toBe('My-Node_v2');
    expect(getNodeDisplayName('org.project.Node@2.0')).toBe('0'); // splits on dot, last part is "0"
    expect(getNodeDisplayName('package.Class$Inner')).toBe('Class$Inner');
  });

  it('should handle unicode characters', () => {
    expect(getNodeDisplayName('com.example.节点')).toBe('节点');
    expect(getNodeDisplayName('org.emoji.🚀Node')).toBe('🚀Node');
  });

  it('should handle very long paths', () => {
    const longPath = 'a.b.c.d.e.f.g.h.i.j.k.l.m.n.o.p.q.r.s.t.u.v.w.x.y.z.FinalNode';
    expect(getNodeDisplayName(longPath)).toBe('FinalNode');
  });

  it('should handle spaces in names', () => {
    expect(getNodeDisplayName('com.example.My Node')).toBe('My Node');
    expect(getNodeDisplayName('org. project . Component ')).toBe(' Component ');
  });

  it('should handle numeric values', () => {
    expect(getNodeDisplayName('com.example.123')).toBe('123');
    expect(getNodeDisplayName('1.2.3.4')).toBe('4');
  });
});

describe('getNodeNamespace', () => {
  it('should return all parts except the last one', () => {
    expect(getNodeNamespace('com.example.MyNode')).toBe('com.example');
    expect(getNodeNamespace('org.project.module.Component')).toBe('org.project.module');
    expect(getNodeNamespace('a.b.c.d.e')).toBe('a.b.c.d');
  });

  it('should return empty string if no namespace', () => {
    expect(getNodeNamespace('SimpleNode')).toBe('');
    expect(getNodeNamespace('Node123')).toBe('');
  });

  it('should handle empty string', () => {
    expect(getNodeNamespace('')).toBe('');
  });

  it('should handle string ending with dot', () => {
    expect(getNodeNamespace('com.example.')).toBe('com.example');
    expect(getNodeNamespace('a.b.c.')).toBe('a.b.c');
  });

  it('should handle string starting with dot', () => {
    expect(getNodeNamespace('.MyNode')).toBe('');
    expect(getNodeNamespace('.com.example.MyNode')).toBe('.com.example');
  });

  it('should handle multiple consecutive dots', () => {
    expect(getNodeNamespace('com..example..MyNode')).toBe('com..example.');
    expect(getNodeNamespace('a...b')).toBe('a..');
  });

  it('should handle single dot', () => {
    expect(getNodeNamespace('.')).toBe('');
  });

  it('should handle multiple dots only', () => {
    expect(getNodeNamespace('...')).toBe('..');
    expect(getNodeNamespace('..')).toBe('.');
  });

  it('should handle two-part namespace', () => {
    expect(getNodeNamespace('package.Class')).toBe('package');
    expect(getNodeNamespace('org.Node')).toBe('org');
  });

  it('should handle special characters in namespace', () => {
    expect(getNodeNamespace('com-vendor.example_v2.MyNode')).toBe('com-vendor.example_v2');
    expect(getNodeNamespace('org@2.0.project.Node')).toBe('org@2.0.project');
  });

  it('should handle unicode in namespace', () => {
    expect(getNodeNamespace('公司.项目.节点')).toBe('公司.项目');
    expect(getNodeNamespace('🚀.🌟.Node')).toBe('🚀.🌟');
  });

  it('should handle very long namespaces', () => {
    const longPath = 'a.b.c.d.e.f.g.h.i.j.k.l.m.n.o.p.q.r.s.t.u.v.w.x.y.z.FinalNode';
    expect(getNodeNamespace(longPath)).toBe('a.b.c.d.e.f.g.h.i.j.k.l.m.n.o.p.q.r.s.t.u.v.w.x.y.z');
  });

  it('should handle spaces in namespace', () => {
    expect(getNodeNamespace('com .example .My Node')).toBe('com .example ');
    expect(getNodeNamespace(' org. project .Component')).toBe(' org. project ');
  });

  it('should handle numeric namespaces', () => {
    expect(getNodeNamespace('1.2.3.Node')).toBe('1.2.3');
    expect(getNodeNamespace('123.456.789')).toBe('123.456');
  });
});

describe('getNodeDisplayName and getNodeNamespace together', () => {
  it('should split a full path correctly', () => {
    const fullPath = 'com.example.module.MyComponent';
    const displayName = getNodeDisplayName(fullPath);
    const namespace = getNodeNamespace(fullPath);
    
    expect(displayName).toBe('MyComponent');
    expect(namespace).toBe('com.example.module');
    
    // Reconstructing should give us the original (minus any trailing dots)
    if (namespace) {
      expect(`${namespace}.${displayName}`).toBe(fullPath);
    } else {
      expect(displayName).toBe(fullPath);
    }
  });

  it('should handle edge cases consistently', () => {
    const testCases = [
      { input: '', displayName: '', namespace: '' },
      { input: 'Node', displayName: 'Node', namespace: '' },
      { input: 'a.b', displayName: 'b', namespace: 'a' },
      { input: '.', displayName: '.', namespace: '' },  // Returns original when empty
      { input: 'a.', displayName: 'a.', namespace: 'a' },  // Returns original when empty
      { input: '.a', displayName: 'a', namespace: '' },
    ];

    testCases.forEach(({ input, displayName, namespace }) => {
      expect(getNodeDisplayName(input)).toBe(displayName);
      expect(getNodeNamespace(input)).toBe(namespace);
    });
  });

  it('should handle real-world node names', () => {
    // Example node names that might appear in a node-based system
    const examples = [
      { 
        input: 'nodetool.image.ImageGenerate',
        displayName: 'ImageGenerate',
        namespace: 'nodetool.image'
      },
      {
        input: 'ml.tensorflow.layers.Dense',
        displayName: 'Dense',
        namespace: 'ml.tensorflow.layers'
      },
      {
        input: 'CustomNode',
        displayName: 'CustomNode',
        namespace: ''
      },
      {
        input: 'audio.effects.Reverb',
        displayName: 'Reverb',
        namespace: 'audio.effects'
      },
    ];

    examples.forEach(({ input, displayName, namespace }) => {
      expect(getNodeDisplayName(input)).toBe(displayName);
      expect(getNodeNamespace(input)).toBe(namespace);
    });
  });
});