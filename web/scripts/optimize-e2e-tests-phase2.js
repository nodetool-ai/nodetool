#!/usr/bin/env node
/**
 * Phase 2 optimization script - Handle remaining longer timeouts
 * 
 * This script replaces medium-length timeouts (500ms-1000ms) with waitForAnimation
 * and ensures all wait helper imports are present.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testsDir = path.join(__dirname, '../tests/e2e');

// Get all spec files
const specFiles = fs.readdirSync(testsDir)
  .filter(file => file.endsWith('.spec.ts'))
  .map(file => path.join(testsDir, file));

console.log(`Found ${specFiles.length} test files to optimize (Phase 2)`);

let totalOptimizations = 0;

for (const filePath of specFiles) {
  const fileName = path.basename(filePath);
  console.log(`\nProcessing ${fileName}...`);
  
  let content = fs.readFileSync(filePath, 'utf-8');
  let fileOptimizations = 0;
  
  // Track if we need waitForAnimation
  let needsWaitForAnimation = false;
  
  // Pattern 1: Replace medium timeouts (500ms-1000ms) with waitForAnimation
  const mediumTimeoutPattern = /await page\.waitForTimeout\((500|1000)\);/g;
  const matches = content.match(mediumTimeoutPattern);
  if (matches && matches.length > 0) {
    content = content.replace(mediumTimeoutPattern, 'await waitForAnimation(page);');
    needsWaitForAnimation = true;
    console.log(`  ✓ Replaced ${matches.length} medium timeouts (500-1000ms) with waitForAnimation`);
    fileOptimizations += matches.length;
  }
  
  // Add import if needed and not already present
  if (needsWaitForAnimation && !content.includes('waitForAnimation')) {
    // Check if waitHelpers import already exists
    const hasWaitHelpersImport = content.includes('from "./helpers/waitHelpers"');
    
    if (hasWaitHelpersImport) {
      // Add to existing import
      const importMatch = content.match(/import \{([^}]+)\} from "\.\/helpers\/waitHelpers";/);
      if (importMatch) {
        const existingImports = importMatch[1].split(',').map(s => s.trim());
        if (!existingImports.includes('waitForAnimation')) {
          const newImports = [...existingImports, 'waitForAnimation'].join(',\n  ');
          content = content.replace(
            /import \{[^}]+\} from "\.\/helpers\/waitHelpers";/,
            `import {\n  ${newImports},\n} from "./helpers/waitHelpers";`
          );
          console.log(`  ✓ Added waitForAnimation to existing imports`);
        }
      }
    } else {
      // Create new import
      const importStatement = `import {\n  waitForAnimation,\n} from "./helpers/waitHelpers";\n`;
      const lastImportIndex = content.lastIndexOf('import ');
      const endOfLine = content.indexOf('\n', lastImportIndex);
      content = content.slice(0, endOfLine + 1) + importStatement + content.slice(endOfLine + 1);
      console.log(`  ✓ Added waitHelpers import`);
    }
  }
  
  // Write back the optimized content
  if (fileOptimizations > 0) {
    fs.writeFileSync(filePath, content);
    console.log(`  ✓ Saved ${fileOptimizations} optimizations to ${fileName}`);
    totalOptimizations += fileOptimizations;
  } else {
    console.log(`  - No optimizations needed`);
  }
}

console.log(`\n✅ Phase 2 optimization complete! Total optimizations: ${totalOptimizations}`);
