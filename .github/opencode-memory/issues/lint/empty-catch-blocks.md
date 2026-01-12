### Empty Catch Blocks

**Issue**: ESLint error `no-empty` for empty catch blocks.

**Solution**: Add comment explaining why catch is empty:
```typescript
try {
  JSON.parse(jsonString);
} catch (error) {
  // JSON parse failed, return original string as fallback
  return jsonString;
}
```
