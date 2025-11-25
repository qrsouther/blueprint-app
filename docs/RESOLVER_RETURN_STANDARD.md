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
  error: "error message string"
}
```

## Rules

1. **Always wrap data in `data` property** - Even for single values, wrap them in `data`
2. **Never return data directly** - Don't return `{ excerptId, excerptName }`, use `{ success: true, data: { excerptId, excerptName } }`
3. **Never throw errors** - Always return `{ success: false, error: "..." }`
4. **No partial data on error** - Don't include data fields in error responses
5. **Consistent error format** - Always use `error` property (not `errorMessage`, `err`, etc.)

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

## Reference Implementation

See `src/resolvers/simple-resolvers.js::getCategories()` as the reference implementation.

