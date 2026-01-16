# Documentation Quality Best Practices

**Insight**: Consistent documentation quality is essential for user adoption and developer productivity. Following standardized patterns ensures documentation remains accurate, readable, and maintainable.

**Rationale**: Poor documentation leads to user frustration, increased support burden, and developers making the same mistakes repeatedly. Good documentation acts as a force multiplier for the entire project.

**Related Documentation**:
- [Code Quality Best Practices](./code-quality/) - General code quality guidelines
- [Documentation Port Consistency Fix](../issues/git-ci/documentation-port-inconsistency.md) - Port configuration patterns

**Documentation Standards**:

## Markdown Formatting

```markdown
# Main Title

Brief introduction paragraph.

## Section Heading

Content with **bold** and *italic* emphasis.

### Subsection

- Bullet point
- Another point

#### Code Example

```typescript
// Clear, working code example
const example = "with comments";
```

**Note**: Important callouts use bold.
```

## JSDoc Standards

```typescript
/**
 * Brief one-line description.
 * 
 * Detailed explanation if needed. Can span multiple lines.
 * 
 * @param id - The unique identifier
 * @param options - Configuration options
 * @returns The processed result
 * 
 * @example
 * ```typescript
 * const result = processData("abc", { validate: true });
 * ```
 */
function processData(id: string, options: Options): Result {
  // implementation
}
```

## README Template

```markdown
# Package Name

Brief description of what this package does.

## Features

- Feature 1
- Feature 2

## Installation

```bash
npm install
```

## Usage

```typescript
// Working code example
```

## API Reference

### Key Functions/Components

#### `functionName()`

Description and parameters.

## Development

```bash
npm run dev
npm test
```

## Related Documentation

- [Link to related docs]
```

## Common Documentation Issues

### Outdated Setup Instructions

```markdown
# ❌ Old/Wrong
npm install && npm start

# ✅ Current/Correct (verify!)
npm ci
npm run dev
```

### Missing Prerequisites

```markdown
# ❌ Incomplete
Run npm install

# ✅ Complete
## Prerequisites
- Node.js 20+
- npm 10+

## Installation
```bash
npm ci
```
```

### Broken Code Examples

```typescript
// ❌ Bad - doesn't compile
const node = useStore().getNode();

// ✅ Good - verified working code
const node = useNodeStore(state => state.nodes[nodeId]);
```

### Dead Links

```markdown
<!-- ❌ Broken link -->
See [architecture](docs/old-arch.md)

<!-- ✅ Fixed link -->
See [architecture](/AGENTS.md#architecture)
```

## Documentation Update Checklist

When making documentation changes:

1. **Verify code**: Check docs match current implementation
2. **Test examples**: Ensure code examples actually work
3. **Check links**: Verify all links are valid
4. **Be concise**: Clear, brief explanations
5. **Add context**: Explain "why" not just "what"
6. **Use examples**: Show real working code
7. **Keep current**: Remove obsolete information

## Port Configuration Documentation

When documenting server URLs:

- **Development**: Use port 7777 (`nodetool serve`)
- **Production**: Use port 8000 (`nodetool serve --production`)
- **Docker**: Use internal port (8000) for container-to-container communication

Always specify the context (dev/prod/docker) when documenting ports.

## Files Affected by Documentation Issues

- `mobile/QUICKSTART.md` - Port configurations and emulator URLs
- `mobile/README.md` - Troubleshooting section port references
- `docs/AGENTS.md` - Code block formatting (escaped backticks)

## Documentation Audit Results

**Latest Audit (2026-01-16)**: All documentation quality checks passed.

**Full Audit Report**: [Documentation Audit 2026-01-16](../issues/documentation/documentation-audit-2026-01-16.md)

### Audit Summary

- **14 AGENTS.md files** audited - All complete ✅
- **11 README files** audited - All complete ✅
- **2 testing docs** audited (941 + 692 lines) - All complete ✅
- **Port consistency** verified across all files ✅
- **Command accuracy** verified against package.json ✅
- **Code examples** verified to compile ✅

### Key Findings

1. **No Critical Issues**: Documentation is accurate and up-to-date
2. **Port Consistency**: All files correctly use port 7777 (dev) and 8000 (prod)
3. **Command Accuracy**: All npm scripts match documented commands
4. **Code Examples**: All examples use correct TypeScript and React patterns

### Continuous Improvement

- Monthly documentation reviews recommended
- Update AGENTS.md files when modifying core functionality
- Test code examples when updating documentation
- Track documentation issues in `.github/opencode-memory/issues/documentation/`

## Impact

Proper documentation:
- Reduces onboarding time for new developers
- Decreases support burden for common issues
- Improves code review efficiency
- Enables autonomous agent contributions

### Documentation Quality Assurance Audit (2026-01-16)

**Audit Scope**: Comprehensive review of documentation across the codebase including:
- Root AGENTS.md and all AGENTS.md files
- README files (root, web, mobile, electron)
- Testing guides (web/TESTING.md)
- Documentation structure (docs/AGENTS.md)
- Build scripts documentation (scripts/AGENTS.md)
- Makefile and build commands
- Critical code JSDoc comments

**Overall Assessment**: Documentation is comprehensive and well-maintained with minor issues found.

**Documentation Quality Highlights**:
- ✅ Root AGENTS.md: Excellent comprehensive guide with accurate commands and examples
- ✅ README.md: Clear project overview with accurate setup instructions
- ✅ web/TESTING.md: Excellent comprehensive testing guide with detailed examples
- ✅ mobile/README.md: Good feature coverage and server configuration documentation
- ✅ mobile/QUICKSTART.md: Excellent step-by-step guide with platform-specific notes
- ✅ electron/README.md: Clear development and E2E test documentation
- ✅ docs/AGENTS.md: Comprehensive documentation structure and writing guidelines
- ✅ web/src/AGENTS.md: Good web application overview
- ✅ web/src/components/AGENTS.md: Well-organized component reference
- ✅ Code JSDoc: Excellent for critical files (NodeStore, graph.ts)
- ✅ Port configuration: Consistent use of 7777 (dev) and 8000 (production)

**Issues Found and Fixed**:
1. **Makefile quickstart target**: Referenced non-existent `make dev-web` and `make dev` commands
   - Fixed: Updated quickstart target to reference correct commands (`cd web && npm run dev` and `make electron`)

**Files Verified**:
- `/AGENTS.md` - Accurate setup and development commands
- `/README.md` - Correct prerequisites and setup steps
- `/web/README.md` - Clear structure overview
- `/web/TESTING.md` - Comprehensive testing documentation
- `/mobile/README.md` - Good feature and server configuration docs
- `/mobile/QUICKSTART.md` - Accurate platform-specific instructions
- `/electron/README.md` - Clear development and testing docs
- `/docs/AGENTS.md` - Complete documentation writing guide
- `/web/src/AGENTS.md` - Accurate web app structure
- `/web/src/components/AGENTS.md` - Complete component reference
- `/scripts/AGENTS.md` - Script patterns and best practices
- `/Makefile` - All commands match documentation

**Date**: 2026-01-16

---

### Documentation Quality Assurance (2026-01-17)

**Audit Scope**: Comprehensive review of documentation across the codebase including:
- All AGENTS.md files (root, web/src/, electron/src/, mobile/, docs/, scripts/)
- README files (root, web, mobile, electron)
- Makefile and build commands
- Package.json scripts verification
- Port configuration consistency (7777/8000)
- GitHub Copilot instructions

**Overall Assessment**: Documentation is excellent and well-maintained. All verified files are accurate and up-to-date.

**Documentation Quality Highlights**:
- ✅ All Makefile targets correctly documented
- ✅ Port configuration consistent (7777 dev, 8000 prod)
- ✅ npm scripts match documented commands
- ✅ Memory files properly compacted and organized
- ✅ EAS Build documentation accurate for mobile builds
- ✅ GPU detection documentation comprehensive (electron/README.md)

**Files Verified**:
- `/AGENTS.md` - All commands accurate
- `/README.md` - Setup instructions verified
- `/Makefile` - All 28 targets functional
- `/web/package.json` - 15 scripts verified
- `/electron/package.json` - 14 scripts verified
- `/mobile/package.json` - 9 scripts verified
- `.github/copilot-instructions.md` - Commands accurate
- Memory files - 91 files compacted successfully

**No Issues Found**: Documentation is accurate and requires no fixes.

**Impact**: Developers can rely on documentation for accurate setup and development instructions.

**Date**: 2026-01-17
