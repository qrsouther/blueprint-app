# File Naming Conventions

This document outlines the file naming conventions used in the Blueprint App codebase, following React best practices.

## Overview

We follow a consistent naming convention to improve code readability, maintainability, and to align with React community standards.

## File Naming Rules

### 1. React Components
**Convention:** PascalCase (UpperCamelCase)

**Examples:**
- `EmbedContainer.jsx` - Container component for Embed macro
- `EmbedEditMode.jsx` - Presentational component for editing UI
- `EmbedViewMode.jsx` - Presentational component for viewing UI
- `AdminToolbar.jsx` - Admin UI component
- `VariableConfigPanel.jsx` - Configuration panel component

**Rationale:** 
- Matches React component naming convention
- Immediately identifies files that export React components
- Aligns with JSX syntax where components are PascalCase

**Location:** All files in `src/components/` and React component entry points in `src/`

### 2. Non-Component Files
**Convention:** kebab-case (words separated by hyphens)

**Examples:**
- `embed-hooks.js` - Custom React hooks for Embed functionality
- `admin-hooks.js` - Custom React hooks for Admin functionality
- `adf-rendering-utils.js` - Utility functions for ADF rendering
- `storage-utils.js` - Utility functions for storage operations
- `include-resolvers.js` - Backend resolver functions
- `excerpt-resolvers.js` - Backend resolver functions

**Rationale:**
- URL-friendly and web-standard
- Consistent with many JavaScript/Node.js projects
- Prevents case-sensitivity issues across operating systems

**Location:** 
- `src/hooks/` - Custom React hooks
- `src/utils/` - Utility functions
- `src/resolvers/` - Backend resolver functions
- `src/workers/` - Background worker functions

### 3. Custom Hooks
**Convention:** kebab-case with `use` prefix

**Examples:**
- `use-intersection-observer.js` - Custom hook for intersection observer
- `embed-hooks.js` - File containing multiple hooks (useExcerptData, useSaveVariableValues, etc.)

**Rationale:**
- The `use` prefix is a React convention indicating a hook
- kebab-case for filenames is consistent with other non-component files
- Individual hook functions inside files use camelCase (e.g., `useExcerptData`)

### 4. Entry Point Files
**Convention:** PascalCase if component-like, kebab-case if pure config

**Examples:**
- `EmbedContainer.jsx` - Container component (PascalCase) ✅
- `AdminPage.jsx` - Page component (should be PascalCase, currently `admin-page.jsx`)
- `SourceDisplay.jsx` - Display component (should be PascalCase, currently `source-display.jsx`)
- `SourceConfig.jsx` - Config component (should be PascalCase, currently `source-config.jsx`)

**Rationale:**
- If the file exports a React component that gets rendered, use PascalCase
- If it's a pure configuration file, kebab-case is acceptable
- Entry points that use `ForgeReconciler.render()` should be PascalCase

### 5. Directories
**Convention:** lowercase

**Examples:**
- `components/`
- `hooks/`
- `utils/`
- `resolvers/`
- `components/admin/`
- `components/embed/`

**Rationale:**
- Prevents case-sensitivity issues across different operating systems
- Common convention in many projects
- Easier to type and reference

### 6. Workers
**Convention:** Currently camelCase, consider standardizing to kebab-case

**Examples:**
- `checkIncludesWorker.js` (camelCase) - Consider `check-includes-worker.js`
- `migrationWorker.js` (camelCase) - Consider `migration-worker.js`

**Rationale:**
- For consistency with other non-component files (utils, resolvers, hooks)
- kebab-case is more standard for non-component files

## Code Naming Conventions

### Variables and Functions
**Convention:** camelCase

**Examples:**
```javascript
const fetchData = () => { ... };
let userName = 'John Doe';
const handleClick = () => { ... };
```

### Constants
**Convention:** UPPER_SNAKE_CASE

**Examples:**
```javascript
const API_BASE_URL = 'https://api.example.com';
const MAX_RETRIES = 5;
const APP_VERSION = '8.0.0';
```

### React Components (in code)
**Convention:** PascalCase

**Examples:**
```javascript
function EmbedContainer() { ... }
const AdminToolbar = () => { ... }
export default function SourceDisplay() { ... }
```

### Custom Hooks (in code)
**Convention:** camelCase with `use` prefix

**Examples:**
```javascript
function useExcerptData() { ... }
const useSaveVariableValues = () => { ... }
```

### Boolean Variables
**Convention:** Prefix with `is`, `has`, or `should`

**Examples:**
```javascript
const isLoading = true;
let hasError = false;
const shouldRetry = true;
```

### Event Handlers
**Convention:** Prefix with `handle` followed by event name

**Examples:**
```javascript
function handleClick() { ... }
const handleFormSubmit = (event) => { ... };
const handleExcerptSelection = async (option) => { ... };
```

## Architecture Pattern: Container/Presentational

This codebase follows the Container/Presentational pattern:

### Container Components
- **Location:** Entry point files in `src/` (e.g., `EmbedContainer.jsx`)
- **Responsibility:** Manage state, business logic, data fetching
- **Naming:** PascalCase (they are React components)

### Presentational Components
- **Location:** `src/components/`
- **Responsibility:** Render UI based on props, no business logic
- **Naming:** PascalCase

**Example:**
- `EmbedContainer.jsx` - Container (manages state/logic)
- `EmbedEditMode.jsx` - Presentational (receives props, renders UI)
- `EmbedViewMode.jsx` - Presentational (receives props, renders UI)

## Migration Notes

### Completed
- ✅ `embed-display.jsx` → `EmbedContainer.jsx` (renamed to reflect Container pattern)

### Recommended (Future)
- Consider renaming `admin-page.jsx` → `AdminPage.jsx`
- Consider renaming `source-display.jsx` → `SourceDisplay.jsx`
- Consider renaming `source-config.jsx` → `SourceConfig.jsx`
- Consider standardizing workers to kebab-case for consistency

## References

- [React Naming Conventions](https://react.dev/learn/thinking-in-react)
- [Container/Presentational Pattern](https://www.patterns.dev/react/container-presentational-pattern)
- [JavaScript Naming Conventions](https://developer.mozilla.org/en-US/docs/MDN/Writing_guidelines/Writing_style_guide/Code_style_guide/JavaScript)

