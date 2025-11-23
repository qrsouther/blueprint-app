# Code Review Plan - Required Updates

## Updates to Apply to Plan

### 1. Stage 6 - Orphan Detection System (CRITICAL)

**Phase 6.1: Main Workers** - Mark as CRITICAL FOCUS AREA
- `checkIncludesWorker.js` should have EXTREME PRIORITY focus on false positive prevention
- User has reported many false positives in testing - this is a data safety issue

**Phase 6.2: Worker Helpers** - Mark entire orphan detection system as CRITICAL
- `orphan-detector.js` - CRITICAL (false positive prevention)
- `page-scanner.js` - CRITICAL (ADF search robustness, false negative prevention)
- `reference-repairer.js` - CRITICAL (repair logic correctness)

**Key Focus Areas:**
- False positive analysis (user has seen many in testing)
- Detection logic gaps
- ADF search failures
- Page fetch failures
- Timing/race conditions
- Data safety guarantees

### 2. Add "Unreviewed Items" Section

Add at the end of the plan, before "Post-Review Actions":

---

## Unreviewed Items (Future Consideration)

### Files Excluded from Main Review

**`src/hooks/use-intersection-observer.js`**
- **Status:** Currently disabled/unused (enabled: false in EmbedContainer.jsx)
- **Reason:** Forge UI doesn't support DOM refs for IntersectionObserver
- **When to Review:** If pursuing the "Nuclear Option" Custom UI rewrite
- **Reference:** See `docs/architecture/CUSTOM_UI_COMPOSITOR_ARCHITECTURE.md` for details on the single-iframe Custom UI React app architecture
- **Purpose:** Lazy loading Embeds when scrolled into viewport (would work in Custom UI with real DOM access)

**`src/resolvers/injection-resolver.js` and `src/resolvers/poc-injection-resolver.js`**
- **Status:** From abandoned branch, not in use
- **When to Review:** Optional final phase if needed for cleanup

### 3. Add Inline Style Data Clumping Check

**Expand Section 3 (Code Smells) - Data Clumps Definition:**

**Current Definition (TODO.md line 857):**
- **Data clumps:** Same 3+ parameters passed together repeatedly

**Expanded Definition:**
- **Data clumps:** Same 3+ parameters passed together repeatedly
- **Design-specific data clumps (Inline Styles):** Same group of inline style properties appearing together in multiple components instead of using reusable xcss constants

**Specific Check:**
During code review, flag instances where:
- Inline `style={{}}` props contain multiple CSS properties that appear together in 2+ places
- These style combinations should be extracted into reusable xcss constants
- Examples found in codebase:
  - `style={{ marginBottom: '8px', borderRadius: '3px' }}` in `src/source-config.jsx:644`, `src/components/admin/CreateEditSourceModal.jsx:613`
  - `style={{ borderRadius: '3px' }}` in `src/components/admin/ExcerptPreviewModal.jsx:596`
  - Other inline style combinations that repeat across components

**Why This Matters:**
- Violates DRY principle (Don't Repeat Yourself)
- Harder to maintain (change requires updating multiple files)
- Inconsistent styling (easy to miss one instance when updating)
- Bypasses design token system (hardcoded values like '8px', '3px' instead of 'space.100', 'border.radius')
- Doesn't leverage xcss type safety and theme awareness

**Review Action:**
1. **Document:** Flag all instances of repeated inline style combinations
2. **Categorize:** Mark as Medium priority (code smell, maintainability issue)
3. **Track:** Add to refactoring backlog for eventual burn-down
4. **Recommend:** Extract to xcss constants in `src/styles/admin-styles.js` or `src/styles/embed-styles.js`

**Example Finding Format:**
```
Priority: Medium
Category: Smell (Data Clump - Design)
File: src/source-config.jsx:644, src/components/admin/CreateEditSourceModal.jsx:613
Issue: Inline style props with repeated property combinations should use xcss constants

Current Code:
<Box style={{ marginBottom: '8px', borderRadius: '3px' }}>

Problem:
Same style properties appear in multiple files. Should use design tokens and reusable xcss constant.

Suggested Fix:
Extract to: const documentationLinkBoxStyle = xcss({ marginBottom: 'space.100', borderRadius: 'border.radius' });

Rationale:
Ensures consistency, uses design tokens, easier to maintain, aligns with existing xcss pattern in codebase.
```

**Integration Points:**
- Add to Phase 2 (File-by-File Deep Dive) - check for inline styles in JSX
- Add to Phase 3 (Cross-File Analysis) - identify repeated style combinations
- Update Section 3 (Code Smells) in TODO.md review criteria

---

