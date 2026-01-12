### Port Already in Use

**Issue**: E2E tests or dev server fails with "Port 7777 (or 3000) already in use".

**Solution**: Kill existing process:
```bash
lsof -ti:7777 | xargs kill -9
lsof -ti:3000 | xargs kill -9
```
