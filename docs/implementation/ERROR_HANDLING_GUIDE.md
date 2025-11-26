# Error Handling Guide

This guide documents the standardized error handling patterns used throughout the Blueprint App codebase.

## Overview

The error handling system provides:
- **Consistent error responses** from resolvers
- **Error codes** for programmatic error handling
- **User-friendly error messages** in the frontend
- **Error boundaries** to catch React rendering errors

## Error Code System

### Error Code Constants

All error codes are defined in `src/utils/error-codes.js`:

```javascript
import { ERROR_CODES } from '../utils/error-codes.js';

// Validation errors (1xxx)
ERROR_CODES.VALIDATION_REQUIRED
ERROR_CODES.VALIDATION_INVALID_TYPE
ERROR_CODES.VALIDATION_INVALID_FORMAT
ERROR_CODES.VALIDATION_INVALID_VALUE

// Not found errors (2xxx)
ERROR_CODES.NOT_FOUND_EXCERPT
ERROR_CODES.NOT_FOUND_EMBED
ERROR_CODES.NOT_FOUND_PAGE
ERROR_CODES.NOT_FOUND_VERSION
ERROR_CODES.NOT_FOUND_USER

// Storage errors (3xxx)
ERROR_CODES.STORAGE_READ_FAILED
ERROR_CODES.STORAGE_WRITE_FAILED
ERROR_CODES.STORAGE_DELETE_FAILED
ERROR_CODES.STORAGE_QUOTA_EXCEEDED

// API errors (4xxx)
ERROR_CODES.API_RATE_LIMIT
ERROR_CODES.API_UNAUTHORIZED
ERROR_CODES.API_FORBIDDEN
ERROR_CODES.API_NOT_FOUND
ERROR_CODES.API_TIMEOUT
ERROR_CODES.API_SERVER_ERROR

// Business logic errors (5xxx)
ERROR_CODES.DUPLICATE_EXCERPT
ERROR_CODES.INVALID_STATE_TRANSITION
ERROR_CODES.OPERATION_NOT_ALLOWED
ERROR_CODES.DEPENDENCY_EXISTS

// System errors (9xxx)
ERROR_CODES.UNKNOWN_ERROR
ERROR_CODES.INTERNAL_ERROR
ERROR_CODES.CONFIGURATION_ERROR
```

## Resolver Error Handling

### Standard Error Response Format

All resolvers must return errors in this format:

```javascript
{
  success: false,
  error: "error message string",
  errorCode: "ERROR_CODE",  // Optional but recommended
  details: {}  // Optional additional context
}
```

### Creating Error Responses

Use the `createErrorResponse()` helper function:

```javascript
import { createErrorResponse, ERROR_CODES } from '../utils/error-codes.js';

// Validation error
if (!excerptName) {
  return createErrorResponse(
    ERROR_CODES.VALIDATION_REQUIRED,
    'excerptName is required and must be a non-empty string',
    { field: 'excerptName' }
  );
}

// Not found error
const excerpt = await storage.get(`excerpt:${excerptId}`);
if (!excerpt) {
  return createErrorResponse(
    ERROR_CODES.NOT_FOUND_EXCERPT,
    'Excerpt not found',
    { excerptId }
  );
}

// Internal error (catch block)
} catch (error) {
  return createErrorResponse(
    ERROR_CODES.INTERNAL_ERROR,
    error.message,
    { excerptId }
  );
}
```

### When to Use Error Codes

**Use error codes for:**
- Common error scenarios that need programmatic handling
- Errors that should show user-friendly messages
- Errors that need special handling in the frontend
- Validation errors
- Not found errors
- API errors

**Don't use error codes for:**
- One-off errors that are unlikely to recur
- Errors that are already handled gracefully
- Internal errors that don't need user-facing messages (though INTERNAL_ERROR is fine)

## Utility Error Handling

Utilities should throw errors (not return error objects). Resolvers catch these and format them:

```javascript
// In utility function
if (!excerptId || typeof excerptId !== 'string') {
  throw new Error('excerptId must be a non-empty string');
}

// In resolver
try {
  const result = await someUtilityFunction(excerptId);
  return { success: true, data: result };
} catch (error) {
  return createErrorResponse(
    ERROR_CODES.INTERNAL_ERROR,
    error.message,
    { excerptId }
  );
}
```

## React Query Hook Error Handling

Hooks preserve error codes when throwing errors:

```javascript
import { createErrorWithCode } from '../hooks/helpers'; // Helper in each hook file

const result = await invoke('getExcerpt', { excerptId });

if (!result.success || !result.data) {
  throw createErrorWithCode('Failed to load excerpt', result);
}
```

The `createErrorWithCode` helper preserves `errorCode` and `details` from the resolver response:

```javascript
function createErrorWithCode(defaultMessage, result) {
  const error = new Error(result?.error || defaultMessage);
  if (result?.errorCode) {
    error.errorCode = result.errorCode;
    error.details = result.details || {};
  }
  return error;
}
```

## Component Error Handling

Components use `getUserFriendlyErrorMessage()` to display user-friendly messages:

```javascript
import { getUserFriendlyErrorMessage } from '../../utils/error-utils.js';

onError: (error) => {
  // Log error code for debugging
  if (error.errorCode) {
    logger.errors('Resolver error:', { errorCode: error.errorCode, details: error.details });
  }
  
  // Display user-friendly error message
  const userMessage = getUserFriendlyErrorMessage(error);
  setValidationErrors({ 
    general: userMessage
  });
}
```

The `getUserFriendlyErrorMessage()` function:
1. Checks if error has an `errorCode`
2. If yes, uses the mapped message from `ERROR_MESSAGES`
3. Otherwise, falls back to `error.message`
4. Final fallback: "An unexpected error occurred"

## Error Boundaries

Error boundaries catch React rendering errors and display a fallback UI:

```javascript
import ErrorBoundary from './components/common/ErrorBoundary.jsx';

<ErrorBoundary>
  <App />
</ErrorBoundary>
```

Error boundaries are currently used to wrap:
- `src/admin-page.jsx` - Main admin page
- `src/EmbedContainer.jsx` - Embed macro container

## Adding New Error Codes

1. Add the error code constant to `src/utils/error-codes.js`:

```javascript
export const ERROR_CODES = {
  // ... existing codes ...
  NEW_ERROR_TYPE: 'NEW_ERROR_TYPE'
};
```

2. Add a user-friendly message to `ERROR_MESSAGES`:

```javascript
export const ERROR_MESSAGES = {
  // ... existing messages ...
  [ERROR_CODES.NEW_ERROR_TYPE]: 'User-friendly message here'
};
```

3. Use the error code in resolvers:

```javascript
return createErrorResponse(
  ERROR_CODES.NEW_ERROR_TYPE,
  'Specific error message',
  { context: 'data' }
);
```

## Best Practices

1. **Always use `createErrorResponse()`** - Don't manually construct error objects
2. **Include error codes** - Makes programmatic handling possible
3. **Provide context in details** - Include relevant IDs, field names, etc.
4. **Use appropriate error codes** - Match the error type to the code category
5. **Log error codes** - Helps with debugging and monitoring
6. **Show user-friendly messages** - Use `getUserFriendlyErrorMessage()` in components
7. **Wrap critical components** - Use ErrorBoundary for top-level components

## Examples

### Complete Flow: Resolver → Hook → Component

**Resolver:**
```javascript
export async function saveExcerpt(req) {
  if (!req.payload.excerptName) {
    return createErrorResponse(
      ERROR_CODES.VALIDATION_REQUIRED,
      'excerptName is required',
      { field: 'excerptName' }
    );
  }
  // ... save logic ...
}
```

**Hook:**
```javascript
const result = await invoke('saveExcerpt', payload);
if (!result.success) {
  throw createErrorWithCode('Failed to save excerpt', result);
}
```

**Component:**
```javascript
onError: (error) => {
  const message = getUserFriendlyErrorMessage(error);
  setValidationErrors({ general: message });
}
```

## Reference

- **Error Codes:** `src/utils/error-codes.js`
- **Error Utilities:** `src/utils/error-utils.js`
- **Error Boundary:** `src/components/common/ErrorBoundary.jsx`
- **Resolver Return Standard:** `docs/RESOLVER_RETURN_STANDARD.md`

