# Compositor Heading-Based Injection Implementation

## Overview

This document outlines potential solutions for demarcating the beginnings and ends of injected content blocks in the Custom UI Compositor architecture. Clear demarcation is essential for:
- Accessibility (screen reader navigation)
- Content identification and management
- Debugging and troubleshooting
- User understanding of content boundaries

## Potential Solutions

### 1. HTML Comments (Current Approach)

**Implementation:**
```html
<!-- BLUEPRINT-APP-START-${localId} -->
[injected content]
<!-- BLUEPRINT-APP-END-${localId} -->
```

**Pros:**
- Simple and lightweight
- Already implemented in `injection-resolver.js`
- No visual impact
- Easy to parse programmatically

**Cons:**
- Not accessible to screen readers
- Invisible to users (can't see boundaries)
- May be stripped by some Confluence operations
- No semantic meaning

### 2. Visually Hidden Component (Atlassian Design System)

**Reference:** [Atlassian Design System - Visually Hidden Component](https://atlassian.design/components/visually-hidden/examples)

**Implementation:**
```jsx
import { VisuallyHidden } from '@atlaskit/visually-hidden';

// At the start of injected content
<VisuallyHidden>
  <span>Start of Blueprint content: {excerptName}</span>
</VisuallyHidden>
[injected content]
<VisuallyHidden>
  <span>End of Blueprint content: {excerptName}</span>
</VisuallyHidden>
```

**Pros:**
- ✅ **Accessibility-first:** Content is hidden visually but fully accessible to screen readers
- ✅ **Semantic boundaries:** Screen reader users receive clear auditory cues about content structure
- ✅ **Standards-compliant:** Uses established Atlassian Design System component
- ✅ **User experience:** Improves navigation for assistive technology users
- ✅ **No visual clutter:** Maintains clean visual appearance
- ✅ **Flexible content:** Can include descriptive text (excerpt name, source info, etc.)

**Cons:**
- Requires Atlassian Design System dependency
- Slightly more complex than HTML comments
- May need to be converted to ADF format for native injection

**Use Cases:**
- Marking boundaries of injected content blocks
- Providing context to screen reader users about content source
- Improving accessibility of compositor-generated content
- Supporting navigation through complex document structures

**Implementation Considerations:**
- For native ADF injection: Convert VisuallyHidden component to appropriate ADF nodes
- For Custom UI rendering: Use component directly in React tree
- For raw HTML injection: Use equivalent CSS classes with `sr-only` pattern

**Example ADF Representation:**
```json
{
  "type": "paragraph",
  "marks": [
    {
      "type": "data-consumer",
      "attrs": {
        "data-visually-hidden": true
      }
    }
  ],
  "content": [
    {
      "type": "text",
      "text": "Start of Blueprint content: Weekly Status Report"
    }
  ]
}
```

### 3. Semantic HTML Elements with ARIA Labels

**Implementation:**
```html
<section aria-label="Blueprint content: Weekly Status Report" data-blueprint-start="${localId}">
  [injected content]
</section>
```

**Pros:**
- Semantic HTML structure
- ARIA labels for accessibility
- Can be styled if needed
- Data attributes for programmatic access

**Cons:**
- Visible wrapper element (unless hidden with CSS)
- May affect layout/flow
- More verbose than comments

### 4. Heading-Based Demarcation

**Implementation:**
```html
<h2 data-blueprint-marker="start" data-excerpt-id="${excerptId}">
  📄 {excerptName}
</h2>
[injected content]
<h2 data-blueprint-marker="end" data-excerpt-id="${excerptId}">
  End of {excerptName}
</h2>
```

**Pros:**
- Visible to all users
- Creates clear visual boundaries
- Can be styled consistently
- Supports document structure

**Cons:**
- Takes up visual space
- May not be desired for all use cases
- Could interfere with document outline

### 5. Hybrid Approach: Visually Hidden + Semantic Wrapper

**Implementation:**
```jsx
<section 
  aria-label={`Blueprint content: ${excerptName}`}
  data-blueprint-container={localId}
>
  <VisuallyHidden>
    <span>Start of Blueprint content: {excerptName}</span>
  </VisuallyHidden>
  [injected content]
  <VisuallyHidden>
    <span>End of Blueprint content: {excerptName}</span>
  </VisuallyHidden>
</section>
```

**Pros:**
- Combines accessibility (VisuallyHidden) with semantic structure
- Programmatically identifiable via data attributes
- Screen reader friendly
- Maintains clean visual appearance

**Cons:**
- More complex implementation
- Requires both component and wrapper

## Recommended Approach

**Primary Recommendation: Visually Hidden Component**

The Visually Hidden component from Atlassian Design System provides the best balance of:
- Accessibility compliance
- Zero visual impact
- Standards-based implementation
- User experience enhancement

**Implementation Strategy:**
1. Use VisuallyHidden component in Custom UI rendering
2. For native ADF injection, convert to appropriate ADF structure with accessibility attributes
3. Include descriptive text (excerpt name, source information) in hidden markers
4. Maintain HTML comments as fallback for programmatic identification

**Example Implementation:**
```jsx
// In Custom UI Compositor
const InjectedContentBlock = ({ excerpt, localId, content }) => {
  return (
    <>
      <VisuallyHidden>
        <span>Start of Blueprint content: {excerpt.name} (Source: {excerpt.id})</span>
      </VisuallyHidden>
      {/* HTML comment for programmatic access */}
      {/* BLUEPRINT-APP-START-${localId} --> */}
      {content}
      {/* <!-- BLUEPRINT-APP-END-${localId} --> */}
      <VisuallyHidden>
        <span>End of Blueprint content: {excerpt.name}</span>
      </VisuallyHidden>
    </>
  );
};
```

## Accessibility Benefits

Using Visually Hidden markers provides:
- **Screen reader navigation:** Users can jump between content blocks
- **Context awareness:** Users understand where Blueprint content begins/ends
- **Document structure:** Clear boundaries improve comprehension
- **WCAG compliance:** Supports accessibility standards

## Next Steps

1. Evaluate Atlassian Design System availability in Custom UI context
2. Prototype VisuallyHidden component integration
3. Test with screen readers (NVDA, JAWS, VoiceOver)
4. Document ADF conversion strategy for native injection
5. Update injection resolvers to include accessibility markers

