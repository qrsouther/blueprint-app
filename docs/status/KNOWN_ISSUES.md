# Known Issues

## UI/Visual Issues

### Invisible Text Selection in Textfield Components

**Status**: UNFIXABLE (Forge Platform Bug)
**Severity**: Medium
**Affected Versions**: All versions
**Reported**: 2025-11-11 (v7.18.19)
**Components**: `VariableConfigPanel.jsx` and any component using `@forge/react` Textfield

**Description**:
Text selection highlighting is invisible in all Textfield components. When users select text (double-click or click-drag), there is no visual indication of what text is selected. The text cursor (caret) is visible due to our `caretColor` workaround, but selection highlighting remains broken.

**Root Cause**:
- Forge's `@forge/react` Textfield component does not include `::selection` pseudo-element styles
- Forge's xcss styling system does not support `::selection` pseudo-elements
- Content Security Policy (CSP) blocks workarounds via JavaScript injection of CSS
- Standard `@atlaskit/textfield` components work correctly, proving this is Forge-specific

**Evidence**:
```
CSP Error: Applying inline style violates the following Content Security Policy directive
'style-src 'self' ...' Either the 'unsafe-inline' keyword, a hash, or a nonce is required
to enable inline execution.
```

**Attempted Workarounds**:
1. ✅ **caretColor via xcss** - Successfully made cursor visible when field is empty
2. ❌ **::selection via xcss** - Not supported by xcss system
3. ❌ **CSS injection via JavaScript** - Blocked by CSP
4. ❌ **Wrap DynamicTable in Form component** (v7.18.20) - No effect on selection
5. ❌ **Standalone Form + Textfield test** (v7.18.21) - Selection still broken, confirming platform-wide bug

**Impact**:
- Users cannot see what text they have selected before cutting/copying/deleting
- Reduced UX quality for variable input fields
- Functionality still works, but visual feedback is missing

**Status**:
Awaiting Atlassian fix. Bug report prepared for submission to:
https://ecosystem.atlassian.net/jira/software/c/projects/FRGE/boards/749

**Workaround**:
None available. Users must rely on keyboard position and careful editing.

**Related Files**:
- `src/components/VariableConfigPanel.jsx` (lines 47-53) - Contains caret visibility fix with comment explaining limitation

---

### Recently Resolved
- ~~Asymmetric Padding in Update Available Banner~~ - **RESOLVED 2025-11-06**: Fixed by adding `marginRight: 'space.300'` to EnhancedDiffView's containerStyle to balance SectionMessage's 24px icon column.
