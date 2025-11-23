# CRITICAL DEPLOYMENT RULES

⚠️ **READ THIS BEFORE ANY DEPLOYMENT** ⚠️

## Deployment Environment

**ALL deployments MUST go to PRODUCTION environment.**

```bash
# CORRECT - Always use this (generates build timestamp automatically):
npm run deploy
# OR
npm run deploy:prod

# ALTERNATIVE - If you must use forge directly, generate timestamp first:
node scripts/generate-build-timestamp.js && forge deploy --environment production --no-verify

# WRONG - Never use development:
forge deploy --environment development  # ❌ NEVER DO THIS
forge deploy                             # ❌ Defaults to development
```

## Why Production Only?

- Development environment is not connected to the live Confluence instance
- Users cannot see changes deployed to development
- All testing happens in production with live users

## Deployment Checklist

Before every deployment:
1. ✅ Run `npm run deploy` (automatically generates build timestamp)
2. ✅ Wait for deployment to complete
3. ✅ Ask user to hard refresh (Cmd+Shift+R) to clear cache
4. ✅ Verify changes in browser (check build timestamp is updated)

## Common Mistakes to Avoid

- ❌ Running `forge deploy` directly (bypasses build timestamp generation)
- ❌ Deploying to development by default
- ❌ Forgetting `--environment production` flag
- ❌ Assuming user's browser will auto-update (requires hard refresh)
- ❌ Not verifying which environment is active before testing

## Build Timestamp

The deployment process automatically generates a build timestamp that appears on the admin page loading screen. This timestamp shows when the app was built/deployed and is automatically updated each time you run `npm run deploy` or `npm run deploy:prod`.

If you run `forge deploy` directly, the timestamp won't update. Always use `npm run deploy` to ensure the timestamp is generated.
