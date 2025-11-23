# React Hook Form + Zod Implementation Plan

**Goal:** Replace manual form state management with industry-standard React Hook Form + Zod validation across all configuration forms in the app.

**Status:** Not Started - Planning Complete

---

## Overview

Current state management uses 15+ individual `useState` hooks per form component with manual validation logic scattered throughout. This creates:
- Verbose boilerplate code
- Inconsistent validation patterns
- Manual dirty state tracking
- Performance issues (re-renders on every keystroke)
- Difficult to add new fields

**Solution:** Adopt React Hook Form + Zod for:
- Automatic form state management
- Type-safe schema validation
- Built-in dirty/touched tracking
- Performance optimization (minimal re-renders)
- Consistent validation across frontend and backend

---

## Success Criteria

✅ All forms use React Hook Form for state management
✅ All forms use Zod schemas for validation
✅ Reduced code (~200 lines removed across all forms)
✅ Consistent validation errors across app
✅ Better performance (no re-render on every keystroke)
✅ Easier to add new fields (just update schema)
✅ Type-safe form data (compile-time safety)

---

## Phase 1: Setup & Dependencies

### 1.1 Install Dependencies

```bash
npm install react-hook-form zod @hookform/resolvers
```

**Package Info:**
- `react-hook-form` - 40M downloads/week, ~24KB minified
- `zod` - 12M downloads/week, ~55KB minified
- `@hookform/resolvers` - Integration layer between RHF and Zod

**Total bundle impact:** ~80KB (acceptable for the value gained)

### 1.2 Verify Forge Compatibility

**Test in simplest form first:**
- Create test component with single field
- Deploy to development environment
- Verify Forge's @forge/react doesn't conflict
- Confirm form submission works

**Risk:** Low - React Hook Form is framework-agnostic

---

## Phase 2: Create Shared Schemas

### 2.1 Create Schema Definitions File

**File:** `src/schemas/form-schemas.js` (NEW FILE)

**Purpose:** Centralize all Zod schemas for reuse across frontend and backend.

**Implementation:**

```javascript
import { z } from 'zod';

/**
 * Variable Value Schema
 * Validates individual variable entries
 */
export const VariableValueSchema = z.object({
  name: z.string().min(1, "Variable name is required"),
  value: z.string(), // Can be empty string
  required: z.boolean().optional()
});

/**
 * Embed Configuration Schema
 * Complete schema for Embed instance configuration
 */
export const EmbedConfigSchema = z.object({
  excerptId: z.string().uuid("Invalid excerpt ID"),

  variableValues: z.record(
    z.string(), // Variable name
    z.string()  // Variable value (can be empty)
  ).optional().default({}),

  toggleStates: z.record(
    z.string(),  // Toggle name
    z.boolean()  // Enabled/disabled
  ).optional().default({}),

  customInsertions: z.array(
    z.object({
      position: z.number().int().min(0),
      text: z.string().min(1, "Custom paragraph cannot be empty")
    })
  ).optional().default([]),

  internalNotes: z.array(
    z.object({
      position: z.number().int().min(0),
      content: z.string().min(1, "Internal note cannot be empty")
    })
  ).optional().default([])
});

/**
 * Source Configuration Schema
 * Schema for Blueprint Standard Source configuration
 */
export const SourceConfigSchema = z.object({
  excerptName: z.string()
    .min(1, "Name is required")
    .max(100, "Name must be less than 100 characters"),

  category: z.string()
    .min(1, "Category is required"),

  content: z.object({
    type: z.literal('doc'),
    content: z.array(z.any()) // ADF content (too complex to fully validate)
  }),

  variableMetadata: z.array(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      example: z.string().optional(),
      required: z.boolean().optional()
    })
  ).optional(),

  toggleMetadata: z.array(
    z.object({
      name: z.string(),
      description: z.string().optional()
    })
  ).optional()
});

/**
 * Category Schema
 * Validates category objects
 */
export const CategorySchema = z.object({
  name: z.string()
    .min(1, "Category name is required")
    .max(50, "Category name must be less than 50 characters"),
  order: z.number().int().min(0).optional()
});

/**
 * Partial schemas for specific validation needs
 */
export const VariableMetadataSchema = z.object({
  name: z.string(),
  description: z.string().max(200, "Description too long"),
  example: z.string().max(100, "Example too long"),
  required: z.boolean()
});
```

### 2.2 Add Backend Validation (Optional but Recommended)

**Files:** Various resolver files

**Purpose:** Use same Zod schemas on backend for consistent validation.

**Example in `include-resolvers.js`:**

```javascript
import { EmbedConfigSchema } from '../schemas/form-schemas.js';

export async function saveVariableValues(req) {
  try {
    const { localId, ...payload } = req.payload;

    // Validate with Zod
    const parsed = EmbedConfigSchema.safeParse(payload);

    if (!parsed.success) {
      return {
        success: false,
        error: 'Validation failed',
        details: parsed.error.flatten()
      };
    }

    // Use validated data
    const validatedData = parsed.data;

    // ... rest of function
  }
}
```

---

## Phase 3: Refactor Embed Configuration Form (embed-display.jsx)

**Target:** Replace 15+ useState hooks with React Hook Form

### 3.1 Current State (BEFORE)

```javascript
// embed-display.jsx - Current implementation
const [variableValues, setVariableValues] = useState({});
const [toggleStates, setToggleStates] = useState({});
const [customInsertions, setCustomInsertions] = useState([]);
const [internalNotes, setInternalNotes] = useState([]);
const [selectedPosition, setSelectedPosition] = useState(null);
const [customText, setCustomText] = useState('');
const [insertionType, setInsertionType] = useState('body');
// ... 8+ more useState hooks

// Manual state updates everywhere
const handleVariableChange = (name, value) => {
  setVariableValues(prev => ({ ...prev, [name]: value }));
};
```

### 3.2 New State (AFTER)

```javascript
// embed-display.jsx - React Hook Form implementation
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { EmbedConfigSchema } from '../schemas/form-schemas';

const {
  register,
  handleSubmit,
  watch,
  setValue,
  formState: { errors, isDirty, isValid }
} = useForm({
  resolver: zodResolver(EmbedConfigSchema),
  defaultValues: {
    excerptId: selectedExcerptId,
    variableValues: {},
    toggleStates: {},
    customInsertions: [],
    internalNotes: []
  }
});

// Form submission
const onSubmit = async (data) => {
  const result = await invoke('saveVariableValues', {
    localId: effectiveLocalId,
    ...data
  });

  if (result.success) {
    setSaveStatus('saved');
  }
};

// Watch for changes to trigger auto-save
const formData = watch();

useEffect(() => {
  if (isDirty) {
    handleSubmit(onSubmit)();
  }
}, [formData]);
```

### 3.3 Update Variable Input Fields

**Component:** VariableConfigPanel.jsx

**BEFORE:**
```javascript
<Textfield
  value={variableValues[variable.name] || ''}
  onChange={(e) => {
    setVariableValues({
      ...variableValues,
      [variable.name]: e.target.value
    });
  }}
/>
```

**AFTER:**
```javascript
<Textfield
  {...register(`variableValues.${variable.name}`)}
  defaultValue={variableValues[variable.name] || ''}
/>

{errors.variableValues?.[variable.name] && (
  <Text color="red">{errors.variableValues[variable.name].message}</Text>
)}
```

### 3.4 Update Toggle Checkboxes

**Component:** ToggleConfigPanel.jsx

**BEFORE:**
```javascript
<Checkbox
  isChecked={toggleStates[toggle.name] || false}
  onChange={(e) => {
    setToggleStates({
      ...toggleStates,
      [toggle.name]: e.target.checked
    });
  }}
/>
```

**AFTER:**
```javascript
<Checkbox
  {...register(`toggleStates.${toggle.name}`)}
  defaultChecked={toggleStates[toggle.name] || false}
/>
```

### 3.5 Update Custom Insertions Panel

**Component:** CustomInsertionsPanel.jsx

**BEFORE:**
```javascript
const addCustomParagraph = () => {
  setCustomInsertions([
    ...customInsertions,
    { position: selectedPosition, text: customText }
  ]);
  setCustomText('');
  setSelectedPosition(null);
};
```

**AFTER:**
```javascript
const { fields, append, remove } = useFieldArray({
  control,
  name: 'customInsertions'
});

const addCustomParagraph = () => {
  append({ position: selectedPosition, text: customText });
  setCustomText('');
  setSelectedPosition(null);
};
```

### 3.6 Refactor Auto-Save Logic

**BEFORE:**
```javascript
// Debounced save triggered manually
useEffect(() => {
  const timer = setTimeout(() => {
    handleSave();
  }, 1000);
  return () => clearTimeout(timer);
}, [variableValues, toggleStates, customInsertions, internalNotes]);
```

**AFTER:**
```javascript
// Watch entire form, auto-save on change
const formData = watch();

useEffect(() => {
  if (isDirty && isValid) {
    const timer = setTimeout(() => {
      handleSubmit(onSubmit)();
    }, 1000);
    return () => clearTimeout(timer);
  }
}, [formData, isDirty, isValid]);
```

---

## Phase 4: Refactor Source Configuration Form (source-config.jsx)

**Target:** Simplify Source macro configuration

### 4.1 Current State (BEFORE)

```javascript
const [excerptName, setExcerptName] = useState('');
const [category, setCategory] = useState('General');
const [variableMetadata, setVariableMetadata] = useState([]);
const [toggleMetadata, setToggleMetadata] = useState([]);
// Manual validation
if (!excerptName) {
  setError('Name is required');
  return;
}
```

### 4.2 New State (AFTER)

```javascript
const {
  register,
  handleSubmit,
  formState: { errors, isDirty }
} = useForm({
  resolver: zodResolver(SourceConfigSchema),
  defaultValues: {
    excerptName: config.excerptName || '',
    category: config.category || 'General',
    content: config.content,
    variableMetadata: config.variableMetadata || [],
    toggleMetadata: config.toggleMetadata || []
  }
});

const onSubmit = async (data) => {
  const result = await invoke('saveExcerpt', {
    excerptId: config.excerptId,
    ...data
  });
};
```

### 4.3 Add Validation Error Display

```javascript
<Textfield
  {...register('excerptName')}
  label="Blueprint Standard Name"
/>
{errors.excerptName && (
  <SectionMessage appearance="error">
    <Text>{errors.excerptName.message}</Text>
  </SectionMessage>
)}
```

---

## Phase 5: Refactor Admin Forms (admin-page.jsx)

**Target:** Category management and bulk operation forms

### 5.1 Category Management Form

**BEFORE:**
```javascript
const [newCategoryName, setNewCategoryName] = useState('');
const [editingCategory, setEditingCategory] = useState(null);

const handleAddCategory = () => {
  if (!newCategoryName.trim()) {
    alert('Category name is required');
    return;
  }
  // Add category logic
};
```

**AFTER:**
```javascript
const categoryForm = useForm({
  resolver: zodResolver(CategorySchema),
  defaultValues: { name: '', order: 0 }
});

const handleAddCategory = categoryForm.handleSubmit(async (data) => {
  await invoke('addCategory', data);
  categoryForm.reset();
});
```

### 5.2 Bulk Update Form

**BEFORE:**
```javascript
const [selectedExcerpts, setSelectedExcerpts] = useState([]);
const [targetCategory, setTargetCategory] = useState('');

const handleBulkUpdate = () => {
  if (selectedExcerpts.length === 0) {
    alert('Select excerpts first');
    return;
  }
  // Bulk update logic
};
```

**AFTER:**
```javascript
const bulkForm = useForm({
  resolver: zodResolver(z.object({
    excerptIds: z.array(z.string()).min(1, "Select at least one excerpt"),
    category: z.string().min(1, "Select a category")
  }))
});

const handleBulkUpdate = bulkForm.handleSubmit(async (data) => {
  await invoke('massUpdateExcerpts', data);
});
```

---

## Phase 6: Add Advanced Validation

### 6.1 Cross-Field Validation

**Example:** Ensure required variables have values

```javascript
const EmbedConfigSchemaWithRequiredCheck = EmbedConfigSchema.refine(
  (data) => {
    // Check if all required variables have values
    const excerpt = excerpts.find(e => e.id === data.excerptId);
    if (!excerpt) return true;

    const requiredVars = excerpt.variables?.filter(v => v.required) || [];
    return requiredVars.every(v => data.variableValues[v.name]?.trim());
  },
  {
    message: "All required variables must have values",
    path: ["variableValues"]
  }
);
```

### 6.2 Async Validation

**Example:** Check if excerpt name is unique

```javascript
const SourceConfigSchemaWithUniqueCheck = SourceConfigSchema.refine(
  async (data) => {
    const result = await invoke('checkExcerptNameExists', {
      name: data.excerptName,
      excludeId: currentExcerptId
    });
    return !result.exists;
  },
  {
    message: "An excerpt with this name already exists",
    path: ["excerptName"]
  }
);
```

### 6.3 Conditional Validation

**Example:** Custom insertion text required if position selected

```javascript
const CustomInsertionSchema = z.object({
  position: z.number().nullable(),
  text: z.string()
}).refine(
  (data) => {
    if (data.position !== null) {
      return data.text.trim().length > 0;
    }
    return true;
  },
  {
    message: "Text is required when position is selected",
    path: ["text"]
  }
);
```

---

## Phase 7: Performance Optimization

### 7.1 Enable Uncontrolled Mode

React Hook Form supports both controlled and uncontrolled inputs. Uncontrolled is more performant.

**Current (Controlled - slower):**
```javascript
<Textfield
  value={watch('variableValues.clientName')}
  onChange={(e) => setValue('variableValues.clientName', e.target.value)}
/>
```

**Optimized (Uncontrolled - faster):**
```javascript
<Textfield
  {...register('variableValues.clientName')}
  defaultValue={defaultValues.variableValues.clientName}
/>
```

### 7.2 Debounce Validation

```javascript
const form = useForm({
  resolver: zodResolver(schema),
  mode: 'onChange', // Validate on every change
  reValidateMode: 'onChange',
  delayError: 500 // Debounce error display
});
```

### 7.3 Optimize Re-Renders with useFormContext

For deeply nested components, use React Context to avoid prop drilling:

```javascript
// Parent component
<FormProvider {...methods}>
  <VariableConfigPanel />
</FormProvider>

// Child component
import { useFormContext } from 'react-hook-form';

function VariableConfigPanel() {
  const { register, formState: { errors } } = useFormContext();
  // No props needed!
}
```

---

## Phase 8: Testing & Validation

### 8.1 Test Scenarios

**Basic Functionality:**
1. Fill out Embed config form → Save → Verify storage
2. Leave required field empty → See validation error
3. Fill all fields → Error disappears
4. Submit form → Success message

**Auto-Save:**
1. Type in variable field → Wait 1 second → Verify auto-save triggered
2. Make multiple changes rapidly → Verify debouncing works (only one save)
3. Invalid data → Verify auto-save blocked until valid

**Edge Cases:**
1. Very long variable values (100+ chars) → Verify no performance issues
2. Many variables (20+) → Verify form doesn't lag
3. Rapid typing → Verify no character loss
4. Network failure during save → Verify error handling

**Validation:**
1. Required variable empty → See error message
2. Invalid UUID → See error message
3. Duplicate category name → See error message
4. Cross-field validation → Works correctly

### 8.2 Regression Testing

Test that existing functionality still works:
- ✅ Variable substitution renders correctly
- ✅ Toggle states persist correctly
- ✅ Custom insertions save and render
- ✅ Internal notes save and render
- ✅ Diff view still works (doesn't depend on form state)
- ✅ Admin UI excerpt list still works
- ✅ Category management still works

### 8.3 Performance Testing

Measure before/after:
- Time to first render of Embed config modal
- Re-render count during typing
- Time from keystroke to auto-save trigger
- Bundle size increase

**Targets:**
- No noticeable performance degradation
- Fewer re-renders than current implementation
- Bundle size increase <100KB

---

## Phase 9: Documentation & Cleanup

### 9.1 Update Component Documentation

Add JSDoc to components explaining React Hook Form usage:

```javascript
/**
 * Embed Configuration Panel
 *
 * Uses React Hook Form for state management.
 * Form schema defined in src/schemas/form-schemas.js
 * Auto-saves on change with 1-second debounce.
 *
 * @param {Object} props
 * @param {string} props.localId - Embed instance ID
 * @param {string} props.excerptId - Blueprint Standard ID
 */
```

### 9.2 Remove Old State Management Code

Delete unused imports and functions:
- Remove useState declarations
- Remove manual state update functions
- Remove manual validation code
- Clean up comments referencing old approach

### 9.3 Update README

Add section about form state management:

```markdown
## Form State Management

All forms use React Hook Form + Zod for:
- Type-safe validation
- Automatic state management
- Performance optimization

See `src/schemas/form-schemas.js` for validation schemas.
```

---

## Migration Strategy

### Option 1: All-At-Once (NOT RECOMMENDED)
- Refactor all forms in one go
- High risk, long testing period
- Large changeset, difficult to review

### Option 2: Incremental Migration (RECOMMENDED)

**Order:**
1. **Start with smallest form:** Category management (simplest, lowest risk)
2. **Then Source config:** Medium complexity, well-isolated
3. **Then Embed config:** Most complex, highest impact
4. **Finally Admin forms:** Multiple small forms, can be done individually

**Benefits:**
- Test each migration before moving to next
- Can rollback individual forms if issues arise
- Learn lessons from simple forms, apply to complex ones
- Reduce risk of breaking critical functionality

**Timeline:**
- Phase 1-2 (Setup): 2 hours
- Phase 3 (Embed config): 4-6 hours
- Phase 4 (Source config): 2-3 hours
- Phase 5 (Admin forms): 3-4 hours
- Phase 6-7 (Advanced features): 2-3 hours
- Phase 8 (Testing): 2-3 hours
- Phase 9 (Cleanup): 1 hour

**Total: 16-22 hours (2-3 days)**

---

## Rollback Plan

If React Hook Form causes issues:

1. **Per-form rollback:**
   - Revert specific component files
   - Remove form schema from schemas file
   - Keep other forms on React Hook Form

2. **Complete rollback:**
   - Revert all component changes
   - Delete schemas file
   - Uninstall dependencies
   - Restore from git commit before migration

**Rollback safety:** High - old code preserved in git, can cherry-pick rollbacks

---

## Success Metrics

After completion, measure:

**Code Quality:**
- ✅ ~200 lines removed (useState boilerplate)
- ✅ Consistent validation patterns
- ✅ Easier to add new fields
- ✅ Type safety at compile time

**Performance:**
- ✅ Fewer re-renders during typing
- ✅ No perceived lag
- ✅ Auto-save still responsive

**Maintainability:**
- ✅ Validation logic centralized in schemas
- ✅ Form components simpler, more readable
- ✅ Easier to debug validation issues
- ✅ Consistent error messages

---

## Potential Issues & Solutions

### Issue 1: Forge UI Kit Compatibility

**Problem:** @forge/react components might not work with React Hook Form's `register()` function.

**Solution:**
- Use controlled mode with `watch()` and `setValue()` instead of uncontrolled
- Slight performance hit, but still better than current manual approach

**Example:**
```javascript
const value = watch('variableValues.clientName');

<Textfield
  value={value}
  onChange={(e) => setValue('variableValues.clientName', e.target.value)}
/>
```

### Issue 2: Nested Object Updates

**Problem:** React Hook Form's `setValue()` might not trigger deep updates correctly.

**Solution:**
- Use dot notation for nested paths
- Use `{ shouldDirty: true, shouldTouch: true, shouldValidate: true }` options

**Example:**
```javascript
setValue('variableValues.clientName', 'Acme Corp', {
  shouldDirty: true,
  shouldValidate: true
});
```

### Issue 3: Auto-Save Conflicts with Validation

**Problem:** Form tries to auto-save before validation completes.

**Solution:**
- Check `isValid` before triggering save
- Only auto-save when `isDirty && isValid`

```javascript
useEffect(() => {
  if (isDirty && isValid && !isValidating) {
    const timer = setTimeout(() => {
      handleSubmit(onSubmit)();
    }, 1000);
    return () => clearTimeout(timer);
  }
}, [formData, isDirty, isValid, isValidating]);
```

### Issue 4: Large Schema Bundle Size

**Problem:** Complex Zod schemas increase bundle size significantly.

**Solution:**
- Use lazy evaluation for complex schemas
- Split schemas into separate chunks
- Only import schemas where needed

```javascript
// Instead of importing everything
import { EmbedConfigSchema } from './schemas/form-schemas';

// Use dynamic import
const schema = await import('./schemas/form-schemas').then(m => m.EmbedConfigSchema);
```

---

## Dependencies

**Required:**
- react-hook-form (^7.x)
- zod (^3.x)
- @hookform/resolvers (^3.x)

**Peer Dependencies:**
- React 18+ (already installed)
- @forge/react (already installed)

**Dev Dependencies (Optional):**
- @types/react-hook-form (for TypeScript, not needed for JS)

---

## Resources

**Documentation:**
- React Hook Form: https://react-hook-form.com/
- Zod: https://zod.dev/
- Integration guide: https://react-hook-form.com/get-started#SchemaValidation

**Examples:**
- Basic form: https://react-hook-form.com/get-started#Quickstart
- Nested objects: https://react-hook-form.com/api/useform#register
- Field arrays: https://react-hook-form.com/api/usefieldarray

---

## Next Steps

1. Review this plan
2. Approve approach
3. Start with Phase 1 (setup)
4. Implement incrementally per migration strategy
5. Test thoroughly after each phase
6. Deploy when all forms migrated and tested

---

**Last Updated:** 2025-01-05
**Estimated Effort:** 16-22 hours (2-3 days)
**Priority:** Medium (code quality improvement)
**Risk Level:** Medium (touches working forms)
