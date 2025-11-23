# Comprehensive Plan: Restore Embed Rendering Functionality

## Problem Summary

The Embed macro stopped rendering after renaming `embed-display.jsx` to `EmbedContainer.jsx` (~3 hours ago). The component was working before the rename, but now:
- Component never renders
- Console shows "Cannot access 'Ae' before initialization" errors
- Errors reference `embed-display.js` (the old filename) in minified code
- Thousands of console errors

## Root Cause Analysis

### What Changed

1. **File Rename**: `embed-display.jsx` → `EmbedContainer.jsx` (commit 686eaf1)
   - The rename itself was fine - manifest.yml was updated correctly
   - The working version at rename time had **top-level React Query imports**

2. **Lazy-Loading Added**: After the rename, lazy-loading was added to fix "Cannot access before initialization" errors
   - This introduced complex dependency injection
   - Added `EmbedContainerWrapper` component
   - Modified `embed-hooks.js` to use `initReactQuery()` instead of top-level imports
   - Added pre-loading logic with `window.__reactQueryPreload`

3. **The Problem**: The lazy-loading approach is causing the very error it was meant to fix
   - Complex initialization order creates circular dependencies
   - Minified code can't resolve the initialization sequence
   - The error references `embed-display.js` because the bundle name is based on the resource key, not the source filename

### Key Differences: Working vs Broken

**WORKING VERSION (before rename):**
```javascript
// embed-display.jsx
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
const queryClient = new QueryClient({...});
const App = () => {
  const queryClient = useQueryClient();
  // ... rest of component
};

// embed-hooks.js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
export const useExcerptData = (excerptId, enabled) => {
  return useQuery({...});
};
```

**BROKEN VERSION (current):**
```javascript
// EmbedContainer.jsx
// No top-level imports - lazy-loaded via wrapper
const EmbedContainerWrapper = () => {
  // Complex async loading logic
  // Dependency injection
};

// embed-hooks.js
// Dependency injection via initReactQuery()
export function initReactQuery(module) {...}
function getReactQueryHooks() {...}
```

## Solution Strategy

### Phase 1: Revert to Working Approach (Primary Solution)

**Goal**: Restore the simple top-level import approach that was working before.

**Steps**:

1. **Revert `embed-hooks.js` to top-level imports**
   - Remove `initReactQuery()` function
   - Remove `getReactQueryHooks()` function
   - Add back: `import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';`
   - Update all hooks to use direct imports

2. **Revert `EmbedContainer.jsx` to simple structure**
   - Remove `EmbedContainerWrapper` component
   - Remove all lazy-loading logic
   - Remove pre-loading code at bottom of file
   - Add back top-level imports: `import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';`
   - Create `QueryClient` instance at module level
   - Use `useQueryClient()` hook directly in `App` component
   - Wrap `App` in `QueryClientProvider` at the render call

3. **Clean up any references**
   - Remove `window.__reactQueryPreload` references
   - Remove `window.__embedHooks` references
   - Remove any `setTimeout` workarounds

### Phase 2: If Minified Errors Persist (Fallback)

If reverting to top-level imports still causes minified errors, try:

1. **Singleton QueryClient Pattern**
   - Create QueryClient in a separate module
   - Export singleton instance
   - Import singleton in both files

2. **Module Ordering**
   - Ensure React Query is imported before any hooks
   - Check webpack/bundler configuration

3. **Forge-Specific Solutions**
   - Check if Forge has specific requirements for React Query
   - Consider using Forge's built-in state management if available

## Implementation Plan

### Step 1: Backup Current State
- [ ] Create a backup branch: `backup/broken-embed-lazy-loading`
- [ ] Document current state for reference

### Step 2: Revert embed-hooks.js
- [ ] Remove dependency injection code (`initReactQuery`, `getReactQueryHooks`)
- [ ] Add top-level React Query imports
- [ ] Update all hooks to use direct imports
- [ ] Test that hooks compile without errors

### Step 3: Revert EmbedContainer.jsx
- [ ] Remove `EmbedContainerWrapper` component
- [ ] Remove all lazy-loading and pre-loading code
- [ ] Add top-level React Query imports
- [ ] Create `QueryClient` at module level
- [ ] Simplify `App` component to use `useQueryClient()` directly
- [ ] Update render call to wrap `App` in `QueryClientProvider`
- [ ] Remove all `window.*` global references

### Step 4: Test
- [ ] Build the app: `npm run build` or `forge deploy`
- [ ] Test in Dev mode (tunneled)
- [ ] Verify Embed renders in Edit Mode
- [ ] Verify Embed renders in View Mode
- [ ] Check console for errors

### Step 5: If Still Broken
- [ ] Investigate bundle output
- [ ] Check if manifest.yml resource key needs to match filename
- [ ] Try singleton QueryClient pattern
- [ ] Check Forge documentation for React Query best practices

## Files to Modify

1. **src/EmbedContainer.jsx**
   - Major refactor: Remove ~200 lines of lazy-loading code
   - Add back ~10 lines of top-level imports and QueryClient creation

2. **src/hooks/embed-hooks.js**
   - Remove dependency injection (~75 lines)
   - Add back top-level imports (~3 lines)
   - Simplify all hooks (~10 lines changed)

## Expected Outcome

After implementing this plan:
- Embed component should render in both Edit and View modes
- No "Cannot access before initialization" errors
- Console should be clean (or only show expected warnings)
- Component should work as it did ~3 hours ago

## Risk Assessment

**Low Risk**: Reverting to a known-working approach
- The code was working before, so reverting should restore functionality
- If it doesn't work, we know the issue is elsewhere (bundler, Forge platform, etc.)

**Medium Risk**: May need to investigate why minified errors occurred originally
- If top-level imports cause errors again, we'll need Phase 2 solutions
- May need to investigate Forge's bundling process

## Timeline Estimate

- Step 1 (Backup): 5 minutes
- Step 2 (Revert embed-hooks.js): 15 minutes
- Step 3 (Revert EmbedContainer.jsx): 30 minutes
- Step 4 (Test): 15 minutes
- Step 5 (If needed): Variable

**Total**: ~1 hour for primary solution, +variable if fallback needed

## Notes

- The error referencing `embed-display.js` is expected - that's the bundle name based on the resource key in manifest.yml
- The real issue is the initialization order, not the filename
- The lazy-loading approach was well-intentioned but over-engineered for this use case
- Simple top-level imports work fine in most React applications, including Forge apps

