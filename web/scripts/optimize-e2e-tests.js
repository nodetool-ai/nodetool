#!/usr/bin/env node
/**
 * Script to automatically optimize E2E tests by replacing inefficient waiting patterns
 * 
 * This script performs the following optimizations:
 * 1. Replace waitForLoadState("networkidle") with navigateToPage
 * 2. Replace short waitForTimeout calls with waitForAnimation
 * 3. Add imports for helper functions
 * 4. Move setupMockApiRoutes to beforeEach where applicable
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

console.log(`Found ${specFiles.length} test files to optimize`);

let totalOptimizations = 0;

for (const filePath of specFiles) {
  const fileName = path.basename(filePath);
  console.log(`\nProcessing ${fileName}...`);
  
  let content = fs.readFileSync(filePath, 'utf-8');
  let fileOptimizations = 0;
  
  // Skip if file already imports waitHelpers
  if (content.includes('from "./helpers/waitHelpers"')) {
    console.log(`  ✓ Already optimized, skipping`);
    continue;
  }
  
  // Track if we need to add imports
  let needsNavigateToPage = false;
  let needsWaitForEditorReady = false;
  let needsWaitForAnimation = false;
  let needsWaitForPageReady = false;
  
  // Pattern 1: Replace page.goto + waitForLoadState("networkidle") with navigateToPage
  const gotoPattern = /await page\.goto\(([^)]+)\);\s*await page\.waitForLoadState\("networkidle"\);/g;
  if (gotoPattern.test(content)) {
    content = content.replace(gotoPattern, 'await navigateToPage(page, $1);');
    needsNavigateToPage = true;
    const count = (content.match(/navigateToPage/g) || []).length;
    console.log(`  ✓ Replaced ${count} goto+waitForLoadState with navigateToPage`);
    fileOptimizations += count;
  }
  
  // Pattern 2: Replace standalone waitForLoadState("networkidle") after navigation
  const loadStatePattern = /await page\.waitForLoadState\("networkidle"\);(?!\s*\/\/ Wait for)/g;
  if (loadStatePattern.test(content)) {
    // For standalone calls, replace with waitForPageReady
    content = content.replace(loadStatePattern, 'await waitForPageReady(page);');
    needsWaitForPageReady = true;
    const count = (content.match(/waitForPageReady/g) || []).length;
    console.log(`  ✓ Replaced ${count} standalone waitForLoadState calls`);
    fileOptimizations += count;
  }
  
  // Pattern 3: Replace short waitForTimeout (< 500ms) with waitForAnimation
  const shortTimeoutPattern = /await page\.waitForTimeout\((200|300)\);/g;
  if (shortTimeoutPattern.test(content)) {
    content = content.replace(shortTimeoutPattern, 'await waitForAnimation(page);');
    needsWaitForAnimation = true;
    const count = (content.match(/waitForAnimation/g) || []).length;
    console.log(`  ✓ Replaced short timeouts with waitForAnimation`);
    fileOptimizations += count;
  }
  
  // Pattern 4: Replace editor-specific patterns
  const editorPattern = /await page\.waitForSelector\("\.react-flow", \{ timeout: 10000 \}\);/g;
  if (editorPattern.test(content)) {
    content = content.replace(editorPattern, 'await waitForEditorReady(page);');
    needsWaitForEditorReady = true;
    const count = (content.match(/waitForEditorReady/g) || []).length;
    console.log(`  ✓ Replaced editor wait patterns with waitForEditorReady`);
    fileOptimizations += count;
  }
  
  // Pattern 5: Replace canvas wait + visibility check
  const canvasWaitPattern = /const canvas = page\.locator\("\.react-flow"\);\s*await expect\(canvas\)\.toBeVisible\(\{ timeout: 10000 \}\);/g;
  if (canvasWaitPattern.test(content)) {
    content = content.replace(
      canvasWaitPattern,
      'await waitForEditorReady(page);\n        const canvas = page.locator(".react-flow");'
    );
    needsWaitForEditorReady = true;
    console.log(`  ✓ Replaced canvas wait patterns`);
    fileOptimizations++;
  }
  
  // Add imports if needed
  if (needsNavigateToPage || needsWaitForEditorReady || needsWaitForAnimation || needsWaitForPageReady) {
    const imports = [];
    if (needsNavigateToPage) imports.push('navigateToPage');
    if (needsWaitForEditorReady) imports.push('waitForEditorReady');
    if (needsWaitForAnimation) imports.push('waitForAnimation');
    if (needsWaitForPageReady) imports.push('waitForPageReady');
    
    const importStatement = `import {\n  ${imports.join(',\n  ')},\n} from "./helpers/waitHelpers";\n`;
    
    // Insert after the last import statement
    const lastImportIndex = content.lastIndexOf('import ');
    const endOfLine = content.indexOf('\n', lastImportIndex);
    content = content.slice(0, endOfLine + 1) + importStatement + content.slice(endOfLine + 1);
    
    console.log(`  ✓ Added imports: ${imports.join(', ')}`);
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

console.log(`\n✅ Optimization complete! Total optimizations: ${totalOptimizations}`);
