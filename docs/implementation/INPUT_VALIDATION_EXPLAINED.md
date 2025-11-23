# Input Validation Explained

## What Is Input Validation? (Simple Terms)

**Input validation** means checking that data is correct **before** saving it to storage.

Think of it like a bouncer at a club:
- ✅ Valid data → "Come on in!" (saves to storage)
- ❌ Invalid data → "Sorry, you can't come in" (returns error, doesn't save)

### Example Without Validation (Bad):
```javascript
// User sends: { excerptName: 12345 }  // Wrong! Should be a string
// Code tries to save it
// Later: CRASH! "excerptName.trim is not a function"
```

### Example With Validation (Good):
```javascript
// User sends: { excerptName: 12345 }  // Wrong!
// Validation catches it immediately
// Returns: { success: false, error: "excerptName must be a string" }
// User sees error, data never gets saved
```

## What We're Validating

### 1. **Required Fields** - Must be present
- `excerptName` - Can't save a Source without a name!
- `localId` - Can't save Embed config without knowing which macro
- `excerptId` - Can't save Embed config without knowing which Source

### 2. **Data Types** - Must be the right type
- `excerptName` must be a **string**, not a number or object
- `content` must be an **ADF object**, not a string or array
- `variableValues` must be an **object**, not an array
- `documentationLinks` must be an **array**, not a string

### 3. **Data Format** - Must be valid
- `excerptName` can't be empty (after trimming whitespace)
- `excerptId` should be a valid UUID format (if provided)
- `content` should be valid ADF structure (checked by `validateExcerptData()`)

## Why It Matters

### 1. **Prevents Data Corruption**
Without validation, you might save:
```javascript
{
  excerptName: null,  // Oops! Should be a string
  content: "not an object",  // Oops! Should be ADF
  variables: "not an array"  // Oops! Should be array
}
```
This corrupts your storage and breaks the app later.

### 2. **Fails Fast**
- **Without validation:** Error happens later when trying to use the data
- **With validation:** Error happens immediately, clear error message

### 3. **Security**
Malicious users could send bad data to crash your app or corrupt storage.

### 4. **Better User Experience**
Clear error messages: "excerptName is required" instead of cryptic crashes.

## How It Works (The Flow)

```
User types in StableTextfield
    ↓
Frontend sends data to resolver
    ↓
Resolver validates input ← WE ADD THIS
    ↓
If valid → Save to storage
If invalid → Return error to user
```

## StableTextfield vs Input Validation

These are **complementary**, not overlapping:

### StableTextfield (Frontend - User Experience)
- **Purpose:** Prevents cursor jumping while typing
- **Where:** In the browser, in React components
- **When:** While user is typing
- **What it does:** 
  - Keeps cursor position stable
  - Prevents annoying re-renders
  - Makes typing feel smooth

**Example:**
```jsx
<StableTextfield
  value={excerptName}
  onChange={(e) => setExcerptName(e.target.value)}
/>
```
User types "My Source Name" → cursor stays in place, no jumping

### Input Validation (Backend - Data Integrity)
- **Purpose:** Ensures data is correct before saving
- **Where:** In resolver functions (server-side)
- **When:** When user clicks "Save"
- **What it does:**
  - Checks data types
  - Checks required fields
  - Prevents bad data from being saved

**Example:**
```javascript
// In saveExcerpt resolver
if (!excerptName || typeof excerptName !== 'string') {
  return { success: false, error: 'excerptName must be a string' };
}
```
User tries to save `excerptName: 123` → validation catches it, returns error

## They Work Together

```
1. User types in StableTextfield
   → Good UX, cursor doesn't jump
   
2. User clicks "Save"
   → Frontend sends data to resolver
   
3. Resolver validates input
   → Checks types, required fields, etc.
   
4a. If valid → Saves to storage ✅
4b. If invalid → Returns error, shows to user ❌
```

## The Overlap (What They DON'T Do)

### StableTextfield Does NOT:
- ❌ Validate data types
- ❌ Check required fields
- ❌ Prevent bad data from being sent

### Input Validation Does NOT:
- ❌ Fix cursor jumping
- ❌ Improve typing experience
- ❌ Handle UI rendering

## Real Example

**Scenario:** User creates a new Source

1. **User types name in StableTextfield:**
   ```jsx
   <StableTextfield value={name} onChange={setName} />
   ```
   - Cursor stays stable while typing ✅
   - Good UX ✅

2. **User clicks "Save":**
   ```javascript
   // Frontend sends to resolver
   invoke('saveExcerpt', { excerptName: name, content: content })
   ```

3. **Resolver validates:**
   ```javascript
   // We added this!
   if (!excerptName || typeof excerptName !== 'string') {
     return { success: false, error: 'excerptName must be a string' };
   }
   ```

4. **If validation passes:**
   - Data is saved ✅
   - User sees success message ✅

5. **If validation fails:**
   - Error returned to frontend ❌
   - User sees: "excerptName must be a string" ❌
   - Data never saved ✅

## Summary

- **StableTextfield** = Good typing experience (frontend)
- **Input Validation** = Data integrity (backend)
- **They work together** = Good UX + Safe data

Both are important, but they solve different problems at different layers!

