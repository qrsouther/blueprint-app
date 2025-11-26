# Resolver Return Value Standard

## Standard Pattern

All resolvers must follow this consistent return format:

### Success Case
```javascript
{
  success: true,
  data: {
    // All response data goes here
    // e.g., { categories: [...] }
    // e.g., { excerpt: {...} }
    // e.g., { localId, status, ... }
  }
}
```

### Error Case
```javascript
{
  success: false,
  error: "error message string",
  errorCode?: "ERROR_CODE"  // Optional: Error code constant for programmatic handling
}
```

## Rules

1. **Always wrap data in `data` property** - Even for single values, wrap them in `data`
2. **Never return data directly** - Don't return `{ excerptId, excerptName }`, use `{ success: true, data: { excerptId, excerptName } }`
3. **Never throw errors** - Always return `{ success: false, error: "..." }`
4. **No partial data on error** - Don't include data fields in error responses
5. **Consistent error format** - Always use `error` property (not `errorMessage`, `err`, etc.)
6. **Use error codes for programmatic handling** - Include `errorCode` for common error scenarios (see Error Codes section)

## Examples

### Getter Resolver
```javascript
export async function getCategories() {
  try {
    const categories = await storage.get('categories') || defaultCategories;
    return {
      success: true,
      data: {
        categories
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
```

### Resolver with Error Code
```javascript
import { createErrorResponse, ERROR_CODES } from '../utils/error-codes.js';

export async function saveExcerpt(req) {
  try {
    // Validation
    if (!req.payload.excerptName) {
      return createErrorResponse(
        ERROR_CODES.VALIDATION_REQUIRED,
        'excerptName is required and must be a non-empty string',
        { field: 'excerptName' }
      );
    }
    
    // ... save logic ...
    
    return {
      success: true,
      data: { excerptId, excerptName }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      errorCode: ERROR_CODES.INTERNAL_ERROR
    };
  }
}
```

### Setter Resolver (no return data)
```javascript
export async function setAdminUrl(req) {
  try {
    await storage.set('app-config:adminUrl', req.payload.adminUrl);
    return {
      success: true,
      data: {} // Empty data object for consistency
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
```

### Resolver with Complex Data
```javascript
export async function getExcerpt(req) {
  try {
    const excerpt = await storage.get(`excerpt:${req.payload.excerptId}`);
    if (!excerpt) {
      return {
        success: false,
        error: 'Excerpt not found'
      };
    }
    return {
      success: true,
      data: {
        excerpt
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
```

## Frontend Usage

Frontend code should always check `result.success` first, then access `result.data`:

```javascript
const result = await invoke('getCategories');
if (result.success && result.data) {
  const categories = result.data.categories;
  // Use categories...
} else {
  // Handle error: result.error
}
```

## Migration Checklist

When standardizing a resolver:

1. ✅ Update resolver to return `{ success: true, data: {...} }` format
2. ✅ Update all frontend code that calls this resolver
3. ✅ Test the resolver in the UI
4. ✅ Verify error handling works correctly
5. ✅ Check for any other code that might depend on the old format

## Error Codes

Error codes enable programmatic error handling and better user experience. Use error codes for common error scenarios:

- **Validation errors**: `VALIDATION_REQUIRED`, `VALIDATION_INVALID_TYPE`, etc.
- **Not found errors**: `NOT_FOUND_EXCERPT`, `NOT_FOUND_EMBED`, etc.
- **Storage errors**: `STORAGE_READ_FAILED`, `STORAGE_WRITE_FAILED`, etc.
- **API errors**: `API_RATE_LIMIT`, `API_UNAUTHORIZED`, etc.
- **Business logic errors**: `DUPLICATE_EXCERPT`, `INVALID_STATE_TRANSITION`, etc.

See `src/utils/error-codes.js` for all available error codes and the `createErrorResponse()` helper function.

**When to use error codes:**
- Common error scenarios that need programmatic handling
- Errors that should show user-friendly messages
- Errors that need special handling in the frontend

**When NOT to use error codes:**
- One-off errors that are unlikely to recur
- Errors that are already handled gracefully
- Internal errors that don't need user-facing messages

## Reference Implementation

See `src/resolvers/simple-resolvers.js::getCategories()` as the reference implementation for basic resolvers.

See `src/resolvers/excerpt-resolvers.js::saveExcerpt()` as the reference implementation for resolvers with error codes.

