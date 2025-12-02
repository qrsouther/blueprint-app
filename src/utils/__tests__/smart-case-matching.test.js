/**
 * Tests for Smart Case Matching functionality
 *
 * Tests the detection of sentence-start positions for variable occurrences
 * and the automatic case upgrade logic.
 */

import {
  isAtSentenceStart,
  maybeUpgradeCase,
  detectVariableOccurrences,
  mergeOccurrencesIntoVariables
} from '../detection-utils.js';

describe('isAtSentenceStart', () => {
  test('should return true for empty string (start of paragraph)', () => {
    expect(isAtSentenceStart('')).toBe(true);
  });

  test('should return true for whitespace only (start of paragraph)', () => {
    expect(isAtSentenceStart('   ')).toBe(true);
  });

  test('should return true after period and space', () => {
    expect(isAtSentenceStart('Hello world. ')).toBe(true);
  });

  test('should return true after exclamation mark and space', () => {
    expect(isAtSentenceStart('Wow! ')).toBe(true);
  });

  test('should return true after question mark and space', () => {
    expect(isAtSentenceStart('Really? ')).toBe(true);
  });

  test('should return true after period with closing quote', () => {
    expect(isAtSentenceStart('He said "hello." ')).toBe(true);
  });

  test('should return true after period with single quote', () => {
    expect(isAtSentenceStart("It's called 'done.' ")).toBe(true);
  });

  test('should return false for mid-sentence position', () => {
    expect(isAtSentenceStart('Buy a ')).toBe(false);
  });

  test('should return false after comma', () => {
    expect(isAtSentenceStart('Hello, ')).toBe(false);
  });

  test('should return false after semicolon', () => {
    expect(isAtSentenceStart('First item; ')).toBe(false);
  });

  test('should return false after colon', () => {
    expect(isAtSentenceStart('Note: ')).toBe(false);
  });
});

describe('maybeUpgradeCase', () => {
  test('should upgrade lowercase first char at sentence start', () => {
    expect(maybeUpgradeCase('season ticket', true)).toBe('Season ticket');
  });

  test('should not modify already capitalized value at sentence start', () => {
    expect(maybeUpgradeCase('Season Ticket', true)).toBe('Season Ticket');
  });

  test('should not modify lowercase value when not at sentence start', () => {
    expect(maybeUpgradeCase('season ticket', false)).toBe('season ticket');
  });

  test('should not modify already capitalized value when not at sentence start', () => {
    expect(maybeUpgradeCase('Season Ticket', false)).toBe('Season Ticket');
  });

  test('should handle empty string', () => {
    expect(maybeUpgradeCase('', true)).toBe('');
  });

  test('should handle null/undefined', () => {
    expect(maybeUpgradeCase(null, true)).toBe(null);
    expect(maybeUpgradeCase(undefined, true)).toBe(undefined);
  });

  test('should not modify string starting with number', () => {
    expect(maybeUpgradeCase('123 items', true)).toBe('123 items');
  });

  test('should not modify string starting with symbol', () => {
    expect(maybeUpgradeCase('$100 fee', true)).toBe('$100 fee');
  });

  test('should handle acronyms (all caps)', () => {
    expect(maybeUpgradeCase('FBI', true)).toBe('FBI');
    expect(maybeUpgradeCase('FBI', false)).toBe('FBI');
  });

  test('should handle single character', () => {
    expect(maybeUpgradeCase('a', true)).toBe('A');
    expect(maybeUpgradeCase('A', true)).toBe('A');
  });
});

describe('detectVariableOccurrences', () => {
  test('should detect variable at start of paragraph as sentence start', () => {
    const adf = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: '{{Product}} is great.' }]
      }]
    };

    const occurrences = detectVariableOccurrences(adf);
    
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]).toEqual({
      name: 'Product',
      occurrenceIndex: 0,
      isAtSentenceStart: true
    });
  });

  test('should detect variable mid-sentence as not sentence start', () => {
    const adf = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: 'Buy a {{Product}} today.' }]
      }]
    };

    const occurrences = detectVariableOccurrences(adf);
    
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]).toEqual({
      name: 'Product',
      occurrenceIndex: 0,
      isAtSentenceStart: false
    });
  });

  test('should detect multiple occurrences of same variable', () => {
    const adf = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: 'Buy a {{Product}}. {{Product}} is great.' }]
      }]
    };

    const occurrences = detectVariableOccurrences(adf);
    
    expect(occurrences).toHaveLength(2);
    expect(occurrences[0]).toEqual({
      name: 'Product',
      occurrenceIndex: 0,
      isAtSentenceStart: false
    });
    expect(occurrences[1]).toEqual({
      name: 'Product',
      occurrenceIndex: 1,
      isAtSentenceStart: true
    });
  });

  test('should detect different variables with correct indices', () => {
    const adf = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: '{{Name}} bought a {{Product}}.' }]
      }]
    };

    const occurrences = detectVariableOccurrences(adf);
    
    expect(occurrences).toHaveLength(2);
    expect(occurrences[0]).toEqual({
      name: 'Name',
      occurrenceIndex: 0,
      isAtSentenceStart: true
    });
    expect(occurrences[1]).toEqual({
      name: 'Product',
      occurrenceIndex: 0,
      isAtSentenceStart: false
    });
  });

  test('should treat heading variables as sentence start', () => {
    const adf = {
      type: 'doc',
      content: [{
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: 'About {{Product}}' }]
      }]
    };

    const occurrences = detectVariableOccurrences(adf);
    
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]).toEqual({
      name: 'Product',
      occurrenceIndex: 0,
      isAtSentenceStart: true
    });
  });

  test('should skip toggle markers', () => {
    const adf = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: '{{toggle:advanced}}Content{{/toggle:advanced}}' }]
      }]
    };

    const occurrences = detectVariableOccurrences(adf);
    expect(occurrences).toHaveLength(0);
  });

  test('should handle nested text nodes in paragraph', () => {
    const adf = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Buy a ' },
          { type: 'text', text: '{{Product}}', marks: [{ type: 'strong' }] },
          { type: 'text', text: '. ' },
          { type: 'text', text: '{{Product}}', marks: [{ type: 'strong' }] },
          { type: 'text', text: ' is great.' }
        ]
      }]
    };

    const occurrences = detectVariableOccurrences(adf);
    
    expect(occurrences).toHaveLength(2);
    expect(occurrences[0].isAtSentenceStart).toBe(false);
    expect(occurrences[1].isAtSentenceStart).toBe(true);
  });

  test('should handle empty/null input', () => {
    expect(detectVariableOccurrences(null)).toEqual([]);
    expect(detectVariableOccurrences(undefined)).toEqual([]);
    expect(detectVariableOccurrences({})).toEqual([]);
  });
});

describe('mergeOccurrencesIntoVariables', () => {
  test('should merge occurrences into variable definitions', () => {
    const variables = [
      { name: 'Product', required: true, description: 'The product name' }
    ];
    const occurrences = [
      { name: 'Product', occurrenceIndex: 0, isAtSentenceStart: false },
      { name: 'Product', occurrenceIndex: 1, isAtSentenceStart: true }
    ];

    const result = mergeOccurrencesIntoVariables(variables, occurrences);
    
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: 'Product',
      required: true,
      description: 'The product name',
      occurrences: [
        { index: 0, isAtSentenceStart: false },
        { index: 1, isAtSentenceStart: true }
      ]
    });
  });

  test('should handle variables with no occurrences', () => {
    const variables = [
      { name: 'UnusedVar', required: false }
    ];
    const occurrences = [];

    const result = mergeOccurrencesIntoVariables(variables, occurrences);
    
    expect(result).toHaveLength(1);
    expect(result[0].occurrences).toEqual([]);
  });

  test('should handle empty variables array', () => {
    const result = mergeOccurrencesIntoVariables([], []);
    expect(result).toEqual([]);
  });

  test('should handle null/undefined input', () => {
    expect(mergeOccurrencesIntoVariables(null, [])).toBe(null);
    expect(mergeOccurrencesIntoVariables(undefined, [])).toBe(undefined);
  });
});

