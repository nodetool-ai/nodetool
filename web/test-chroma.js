import chroma from 'chroma-js';

// Test darken
console.log('darken #ff0000 by 50%:', chroma('#ff0000').darken(0.5).hex());
console.log('darken #ffffff by 10%:', chroma('#ffffff').darken(0.1).hex());

// Test brighten  
console.log('brighten #000000 by 100%:', chroma('#000000').brighten(1).hex());
console.log('brighten #808080 by 50%:', chroma('#808080').brighten(0.5).hex());

// Test invalid colors
try {
  const result = chroma('invalid').hex();
  console.log('invalid color result:', result);
} catch (err) {
  console.log('invalid color error:', err.message);
}

// Test named colors parsing
console.log('chroma("red"):', chroma('red').hex());
console.log('chroma("blue"):', chroma('blue').hex());
console.log('chroma("green"):', chroma('green').hex());

// Test hexToRgba equivalents
console.log('red with 0.5 alpha:', chroma('#ff0000').alpha(0.5).rgba());
console.log('green with 1 alpha:', chroma('#00ff00').alpha(1).rgba());
console.log('blue with 0.7 alpha:', chroma('#0000ff').alpha(0.7).rgba());