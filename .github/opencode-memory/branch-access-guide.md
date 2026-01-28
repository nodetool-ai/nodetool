# OpenCode Branch Access Guide

## Overview

As of 2026-01-12, all OpenCode workflows have been configured with full branch access, enabling agents to merge branches and resolve conflicts.

## What Changed

### Before
```yaml
- name: Checkout repository
  uses: actions/checkout@v4
```

This used the default `fetch-depth: 1`, which creates a shallow clone with only:
- The current branch
- Single commit history
- No access to other branches

### After
```yaml
- name: Checkout repository
  uses: actions/checkout@v4
  with:
    fetch-depth: 0  # Fetch all history for all branches
```

This fetches:
- All branches in the repository
- Complete commit history
- All tags and references

## What This Enables

### 1. View All Branches
```bash
git branch -a
# Shows:
# * current-branch
#   remotes/origin/main
#   remotes/origin/feature-branch
#   remotes/origin/...
```

### 2. Merge Main Branch
```bash
# Check for updates from main
git fetch origin main

# Merge main into current branch
git merge origin/main

# Or use git pull
git pull origin main
```

### 3. Resolve Merge Conflicts
When conflicts occur, agents can:
```bash
# See conflicted files
git status

# Resolve conflicts in files
# (edit files to resolve conflicts)

# Mark as resolved
git add <resolved-files>

# Complete the merge
git commit -m "Merge main and resolve conflicts"
```

### 4. Check Out Other Branches
```bash
# Switch to existing branch
git checkout -b feature-branch origin/feature-branch

# Create new branch from main
git checkout -b new-feature origin/main
```

### 5. Access Full History
```bash
# View commit history
git log --oneline

# Compare branches
git diff origin/main..HEAD

# Find when a change was introduced
git log --all -- path/to/file
```

## Workflow-Specific Capabilities

### opencode.yml (Comment-Triggered)
- **Permissions**: `contents: read` (cannot push)
- **Use Case**: Respond to user comments with analysis
- **Branch Access**: Can view and compare branches, but not merge or push

### opencode-features.yaml (Scheduled Features)
- **Permissions**: `contents: write` (can push)
- **Use Case**: Autonomous feature development
- **Branch Access**: Can merge main, resolve conflicts, and push changes

### opencode-hourly-test.yaml (Quality Assurance)
- **Permissions**: `contents: write` (can push)
- **Use Case**: Fix test failures and quality issues
- **Branch Access**: Can merge main, resolve conflicts, and push fixes

### opencode-hourly-improve.yaml (Code Quality)
- **Permissions**: `contents: write` (can push)
- **Use Case**: Improve code quality and remove technical debt
- **Branch Access**: Can merge main, resolve conflicts, and push improvements

## Best Practices for Agents

### Before Making Changes
1. Check current branch: `git branch --show-current`
2. Fetch latest changes: `git fetch origin`
3. Check if main has updates: `git log HEAD..origin/main`
4. Consider merging main first: `git merge origin/main`

### When Merging Main
1. Ensure working directory is clean: `git status`
2. Fetch latest: `git fetch origin main`
3. Merge: `git merge origin/main`
4. If conflicts occur:
   - View conflicted files: `git status`
   - Resolve conflicts in each file
   - Test that resolution works: `make typecheck lint test`
   - Stage resolved files: `git add <files>`
   - Complete merge: `git commit`
5. Verify tests pass after merge

### Avoiding Duplicate Work
1. List all branches: `git branch -a`
2. Check for similar branch names
3. Review existing branch if found: `git log origin/similar-branch`
4. Consider continuing that work instead of starting fresh

## Example: Merging Main Before Changes

```bash
#!/bin/bash
# Example script agents can use

# 1. Check current state
CURRENT_BRANCH=$(git branch --show-current)
echo "Current branch: $CURRENT_BRANCH"

# 2. Fetch latest from main
git fetch origin main
echo "Fetched latest from main"

# 3. Check if main has new commits
BEHIND=$(git rev-list --count HEAD..origin/main)
if [ "$BEHIND" -gt 0 ]; then
  echo "Main has $BEHIND new commits. Merging..."
  
  # 4. Merge main
  if git merge origin/main --no-edit; then
    echo "✓ Merged main successfully"
  else
    echo "✗ Merge conflicts detected. Resolving..."
    # Conflict resolution would happen here
    # Then: git add <files> && git commit
  fi
else
  echo "✓ Already up to date with main"
fi

# 5. Proceed with changes
echo "Ready to make changes on $CURRENT_BRANCH"
```

## Troubleshooting

### "fatal: refusing to merge unrelated histories"
This happens when branches don't share a common ancestor.
```bash
# Force merge with --allow-unrelated-histories
git merge origin/main --allow-unrelated-histories
```

### Detached HEAD State
If you checkout a commit directly:
```bash
# Return to branch
git checkout <branch-name>
```

### Need to Abort Merge
If merge conflicts are too complex:
```bash
git merge --abort
# Returns to state before merge
```

## Performance Considerations

### Download Size
- `fetch-depth: 1` (shallow): ~10-50 MB (single commit)
- `fetch-depth: 0` (full): ~100-500 MB (all history)

For NodeTool repository:
- Minimal impact on workflow runtime (usually <10 seconds extra)
- Well worth the capability to merge and resolve conflicts

### When Full History Isn't Needed
The default shallow clone is fine for workflows that:
- Only read code (no merging)
- Don't need to compare branches
- Don't access commit history

For OpenCode agents that need to merge and collaborate, full history is essential.

## References

- [actions/checkout Documentation](https://github.com/actions/checkout)
- [Git Branching Strategies](https://git-scm.com/book/en/v2/Git-Branching-Branching-Workflows)
- [Resolving Merge Conflicts](https://git-scm.com/book/en/v2/Git-Branching-Basic-Branching-and-Merging)

## Related Files

- `.github/workflows/opencode.yml` - Comment-triggered workflow
- `.github/workflows/opencode-features.yaml` - Feature development workflow
- `.github/workflows/opencode-hourly-test.yaml` - Quality assurance workflow
- `.github/workflows/opencode-hourly-improve.yaml` - Code improvement workflow
- `.github/opencode-memory/project-context.md` - Project documentation

---

*Last Updated: 2026-01-12*
*Issue: Give OpenCode actions permission to access other branches*
