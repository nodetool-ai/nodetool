#!/bin/bash
# OpenCode Quality Check Script
# This script runs quality checks and provides detailed feedback

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CHECK_TYPE="${1:-post}"  # pre or post
RESULTS_FILE="${2:-quality-results.txt}"

cd "$REPO_ROOT"

echo "========================================" | tee -a "$RESULTS_FILE"
echo "OpenCode Quality Check - $CHECK_TYPE" | tee -a "$RESULTS_FILE"
echo "========================================" | tee -a "$RESULTS_FILE"
echo "" | tee -a "$RESULTS_FILE"

TYPECHECK_EXIT=0
LINT_EXIT=0
TEST_EXIT=0

# TypeScript Type Check
echo "Running TypeScript type check..." | tee -a "$RESULTS_FILE"
if make typecheck 2>&1 | tee typecheck.log; then
    echo "✅ TypeScript: PASSED" | tee -a "$RESULTS_FILE"
else
    TYPECHECK_EXIT=$?
    ERROR_COUNT=$(grep -c "error TS" typecheck.log || echo "0")
    echo "❌ TypeScript: FAILED ($ERROR_COUNT errors)" | tee -a "$RESULTS_FILE"
fi
echo "" | tee -a "$RESULTS_FILE"

# ESLint Check
echo "Running ESLint..." | tee -a "$RESULTS_FILE"
if make lint 2>&1 | tee lint.log; then
    echo "✅ ESLint: PASSED" | tee -a "$RESULTS_FILE"
else
    LINT_EXIT=$?
    ERROR_COUNT=$(grep -c " error " lint.log || echo "0")
    WARNING_COUNT=$(grep -c " warning " lint.log || echo "0")
    echo "❌ ESLint: FAILED ($ERROR_COUNT errors, $WARNING_COUNT warnings)" | tee -a "$RESULTS_FILE"
fi
echo "" | tee -a "$RESULTS_FILE"

# Test Suite
echo "Running test suite..." | tee -a "$RESULTS_FILE"
if make test 2>&1 | tee test.log; then
    echo "✅ Tests: PASSED" | tee -a "$RESULTS_FILE"
else
    TEST_EXIT=$?
    echo "❌ Tests: FAILED" | tee -a "$RESULTS_FILE"
fi
echo "" | tee -a "$RESULTS_FILE"

# Summary
echo "========================================" | tee -a "$RESULTS_FILE"
echo "Summary" | tee -a "$RESULTS_FILE"
echo "========================================" | tee -a "$RESULTS_FILE"
echo "TypeScript: Exit code $TYPECHECK_EXIT" | tee -a "$RESULTS_FILE"
echo "Lint:       Exit code $LINT_EXIT" | tee -a "$RESULTS_FILE"
echo "Test:       Exit code $TEST_EXIT" | tee -a "$RESULTS_FILE"
echo "" | tee -a "$RESULTS_FILE"

# Store exit codes in environment file if provided
if [ -n "$GITHUB_ENV" ]; then
    echo "TYPECHECK_${CHECK_TYPE^^}_EXIT=$TYPECHECK_EXIT" >> "$GITHUB_ENV"
    echo "LINT_${CHECK_TYPE^^}_EXIT=$LINT_EXIT" >> "$GITHUB_ENV"
    echo "TEST_${CHECK_TYPE^^}_EXIT=$TEST_EXIT" >> "$GITHUB_ENV"
fi

# Exit with failure if any check failed
if [ $TYPECHECK_EXIT -ne 0 ] || [ $LINT_EXIT -ne 0 ] || [ $TEST_EXIT -ne 0 ]; then
    echo "⚠️ Some quality checks failed" | tee -a "$RESULTS_FILE"
    exit 1
else
    echo "✅ All quality checks passed!" | tee -a "$RESULTS_FILE"
    exit 0
fi
