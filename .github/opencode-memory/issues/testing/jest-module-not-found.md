# Jest Can't Find Modules

**Problem**: Jest tests fail with "Cannot find module" for TypeScript imports.

**Solution**: Ensure jest.config.js has proper transform:
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
};
```

**Date**: 2026-01-10
