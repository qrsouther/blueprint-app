# ESLint Rule Proposal: Prevent Console Statements

## Overview

To prevent future console flooding and maintain clean, structured logging, we should add an ESLint rule that disallows `console.log`, `console.warn`, and `console.error` statements in production code.

## Proposed Rule Configuration

### Option 1: Strict (Recommended)
Disallow all console statements except in specific allowed files (logging utilities themselves).

**Configuration:**
```json
{
  "rules": {
    "no-console": ["error", {
      "allow": []
    }]
  },
  "overrides": [
    {
      "files": ["src/utils/logger.js", "src/utils/forge-logger.js", "src/utils/performance-logger.js"],
      "rules": {
        "no-console": "off"
      }
    }
  ]
}
```

### How It Works with Logging Utilities

**`forge-logger.js`** (Backend logging):
- Uses `console.log`, `console.error`, and `console.warn` directly (14 instances)
- These are **intentional** - this file IS the logging utility
- ESLint rule will be **disabled** for this file via `overrides`

**`logger.js`** (Frontend logging):
- Uses `debug` library (which internally uses console)
- Also has `logError()` helper that uses `console.error` directly (lines 82-84)
- These are **intentional** - this file IS the logging utility
- ESLint rule will be **disabled** for this file via `overrides`

**Result:**
- ✅ Logging utilities can use console freely
- ❌ All other files must use the logging utilities instead of direct console calls
- ✅ Developers import `forge-logger` or `logger` instead of using console directly

### Option 2: Permissive (Alternative)
Allow `console.error` for critical errors, but disallow `console.log` and `console.warn`.

**Configuration:**
```json
{
  "rules": {
    "no-console": ["warn", {
      "allow": ["error"]
    }]
  },
  "overrides": [
    {
      "files": ["src/utils/logger.js", "src/utils/forge-logger.js", "src/utils/performance-logger.js"],
      "rules": {
        "no-console": "off"
      }
    }
  ]
}
```

## Implementation Steps

1. **Install ESLint** (if not already installed):
   ```bash
   npm install --save-dev eslint
   ```

2. **Create `.eslintrc.json`** in project root with the chosen configuration

3. **Add ESLint script to `package.json`**:
   ```json
   {
     "scripts": {
       "lint": "eslint src --ext .js,.jsx",
       "lint:fix": "eslint src --ext .js,.jsx --fix"
     }
   }
   ```

4. **Add pre-commit hook** (optional but recommended):
   - Use `husky` or `lint-staged` to run ESLint before commits
   - Prevents console statements from being committed

5. **Update CI/CD** (if applicable):
   - Add linting step to CI pipeline
   - Fail builds if console statements are found

## Migration Path

Since we have existing console statements (currently ~1,000+), we can:

1. **Phase 1 (Current)**: Clean up critical files (✅ Complete)
2. **Phase 2**: Enable ESLint rule as "warn" initially
3. **Phase 3**: Gradually fix remaining warnings
4. **Phase 4**: Upgrade rule to "error" once all warnings are resolved

## Exceptions

The following files should be excluded from the rule:

1. **`src/utils/forge-logger.js`** - Backend logging utility
   - Uses `console.log` (8 instances), `console.error` (6 instances), `console.warn` (1 instance)
   - These are **intentional** - this file provides structured logging for server-side code
   - Functions: `logFunction()`, `logPhase()`, `logSuccess()`, `logFailure()`, `logWarning()`, etc.

2. **`src/utils/logger.js`** - Frontend logging utility
   - Uses `debug` library (which internally uses console)
   - Has `logError()` helper that uses `console.error` directly (lines 82-84)
   - These are **intentional** - this file provides rate-limited, namespaced logging for client-side code
   - Provides namespaces: `app:saves`, `app:errors`, `app:queries`, `app:cache`, etc.

3. **`src/utils/performance-logger.js`** - Performance logging utility (if it exists)
   - Similar to above - logging utilities need console access

4. **`*.backup` files** - Backup files (can be ignored via `.eslintignore`)

### Why This Works

The ESLint `overrides` configuration allows us to:
- **Disable** the `no-console` rule for logging utility files
- **Enable** the rule for all other files
- This creates a clear boundary: "Only logging utilities can use console directly"

When developers try to use `console.log()` in regular code:
- ESLint will show an error
- They'll be directed to use `forge-logger.js` (backend) or `logger.js` (frontend) instead
- This enforces structured, filterable logging throughout the codebase

## Benefits

1. **Prevents Regression**: New console statements will be caught immediately
2. **Enforces Best Practices**: Developers must use structured logging
3. **Better Debugging**: Structured logs are easier to filter and search
4. **Performance**: Rate-limited logging prevents console flooding
5. **Production Ready**: No accidental console statements in production builds

## Alternative: Custom ESLint Rule

If we need more granular control, we could create a custom rule that:
- Allows console statements in test files
- Allows console.error in error handlers (with a comment explaining why)
- Requires a TODO comment for temporary console statements

## Recommendation

**I recommend Option 1 (Strict)** because:
- It enforces the use of structured logging from the start
- Prevents accidental console statements
- Forces developers to think about logging strategy
- We already have comprehensive logging utilities in place

The rule can be introduced gradually:
1. Start as "warn" to identify all existing console statements
2. Fix them systematically
3. Upgrade to "error" once codebase is clean

