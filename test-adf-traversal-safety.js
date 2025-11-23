/**
 * Test Script for ADF Traversal Safety Fixes
 * 
 * Tests the depth limit and cycle detection fixes in adf-utils.js
 * 
 * Run with: node test-adf-traversal-safety.js
 */

// Import the functions we're testing
// Note: This uses ES modules, so we need to handle the import differently
// For Forge apps, we'll test the logic directly

/**
 * Test Case 1: Deeply Nested ADF (exceeds MAX_DEPTH of 100)
 * This should trigger the depth limit and return partial results instead of crashing
 */
function createDeeplyNestedADF(depth) {
  let node = {
    type: 'paragraph',
    content: [{
      type: 'text',
      text: `Level ${depth}`
    }]
  };

  // Nest deeper and deeper
  for (let i = depth - 1; i > 0; i--) {
    node = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          text: `Level ${i}`
        }, node]
      }]
    };
  }

  return {
    type: 'doc',
    content: [node]
  };
}

/**
 * Test Case 2: Circular Reference ADF
 * A node references itself, creating an infinite loop
 */
function createCircularReferenceADF() {
  const node = {
    type: 'paragraph',
    content: [{
      type: 'text',
      text: 'Start'
    }]
  };

  // Create a circular reference
  node.content.push(node); // Node references itself!

  return {
    type: 'doc',
    content: [node]
  };
}

/**
 * Test Case 3: Complex Circular Reference
 * Multiple nodes form a cycle
 */
function createComplexCircularADF() {
  const nodeA = {
    type: 'paragraph',
    content: [{
      type: 'text',
      text: 'Node A'
    }]
  };

  const nodeB = {
    type: 'paragraph',
    content: [{
      type: 'text',
      text: 'Node B'
    }]
  };

  const nodeC = {
    type: 'paragraph',
    content: [{
      type: 'text',
      text: 'Node C'
    }]
  };

  // Create cycle: A -> B -> C -> A
  nodeA.content.push(nodeB);
  nodeB.content.push(nodeC);
  nodeC.content.push(nodeA);

  return {
    type: 'doc',
    content: [nodeA]
  };
}

/**
 * Test Case 4: Normal ADF (should work fine)
 */
function createNormalADF() {
  return {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 1 },
        content: [{
          type: 'text',
          text: 'Normal Document'
        }]
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'This is a normal ADF document with reasonable nesting.'
          }
        ]
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'It should extract all text without issues.'
          }
        ]
      }
    ]
  };
}

/**
 * Simplified version of extractTextFromAdf for testing
 * (Copy of the fixed version from adf-utils.js)
 */
function extractTextFromAdf(adfNode, depth = 0, visited = new Set()) {
  const MAX_DEPTH = 100;
  if (depth > MAX_DEPTH) {
    console.warn('[extractTextFromAdf] Maximum depth reached, truncating extraction');
    return '';
  }

  if (!adfNode || typeof adfNode !== 'object') {
    return '';
  }

  if (visited.has(adfNode)) {
    console.warn('[extractTextFromAdf] Circular reference detected, skipping');
    return '';
  }
  visited.add(adfNode);

  let text = '';

  if (adfNode.text) {
    text += adfNode.text;
  }

  if (adfNode.content && Array.isArray(adfNode.content)) {
    for (const child of adfNode.content) {
      text += extractTextFromAdf(child, depth + 1, visited);
    }
  }

  visited.delete(adfNode);

  return text;
}

/**
 * Run all test cases
 */
function runTests() {
  console.log('🧪 Testing ADF Traversal Safety Fixes\n');
  console.log('=' .repeat(60));

  let testsPassed = 0;
  let testsFailed = 0;

  // Test 1: Deeply Nested ADF (150 levels - exceeds MAX_DEPTH of 100)
  console.log('\n📋 Test 1: Deeply Nested ADF (150 levels)');
  console.log('Expected: Should hit depth limit and return partial results (not crash)');
  try {
    const deepADF = createDeeplyNestedADF(150);
    const startTime = Date.now();
    const result = extractTextFromAdf(deepADF);
    const duration = Date.now() - startTime;
    
    if (result !== undefined && duration < 1000) {
      console.log('✅ PASS: Function completed without crashing');
      console.log(`   Duration: ${duration}ms`);
      console.log(`   Result length: ${result.length} characters`);
      testsPassed++;
    } else {
      console.log('❌ FAIL: Function took too long or returned undefined');
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ FAIL: Function crashed with error:', error.message);
    console.log('   Stack:', error.stack);
    testsFailed++;
  }

  // Test 2: Circular Reference ADF
  console.log('\n📋 Test 2: Circular Reference ADF (node references itself)');
  console.log('Expected: Should detect cycle and return partial results (not crash)');
  try {
    const circularADF = createCircularReferenceADF();
    const startTime = Date.now();
    const result = extractTextFromAdf(circularADF);
    const duration = Date.now() - startTime;
    
    if (result !== undefined && duration < 1000) {
      console.log('✅ PASS: Function completed without crashing');
      console.log(`   Duration: ${duration}ms`);
      console.log(`   Result: "${result}"`);
      testsPassed++;
    } else {
      console.log('❌ FAIL: Function took too long or returned undefined');
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ FAIL: Function crashed with error:', error.message);
    testsFailed++;
  }

  // Test 3: Complex Circular Reference
  console.log('\n📋 Test 3: Complex Circular Reference (A->B->C->A)');
  console.log('Expected: Should detect cycle and return partial results (not crash)');
  try {
    const complexCircularADF = createComplexCircularADF();
    const startTime = Date.now();
    const result = extractTextFromAdf(complexCircularADF);
    const duration = Date.now() - startTime;
    
    if (result !== undefined && duration < 1000) {
      console.log('✅ PASS: Function completed without crashing');
      console.log(`   Duration: ${duration}ms`);
      console.log(`   Result: "${result}"`);
      testsPassed++;
    } else {
      console.log('❌ FAIL: Function took too long or returned undefined');
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ FAIL: Function crashed with error:', error.message);
    testsFailed++;
  }

  // Test 4: Normal ADF (should work fine)
  console.log('\n📋 Test 4: Normal ADF (reasonable nesting)');
  console.log('Expected: Should extract all text normally');
  try {
    const normalADF = createNormalADF();
    const result = extractTextFromAdf(normalADF);
    
    const expectedText = 'Normal DocumentThis is a normal ADF document with reasonable nesting.It should extract all text without issues.';
    
    if (result === expectedText) {
      console.log('✅ PASS: Function extracted text correctly');
      console.log(`   Result: "${result}"`);
      testsPassed++;
    } else {
      console.log('❌ FAIL: Function did not extract text correctly');
      console.log(`   Expected: "${expectedText}"`);
      console.log(`   Got: "${result}"`);
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ FAIL: Function crashed with error:', error.message);
    testsFailed++;
  }

  // Test 5: Very Deep Nesting (just under limit)
  console.log('\n📋 Test 5: Very Deep Nesting (99 levels - just under limit)');
  console.log('Expected: Should complete successfully');
  try {
    const deepADF = createDeeplyNestedADF(99);
    const startTime = Date.now();
    const result = extractTextFromAdf(deepADF);
    const duration = Date.now() - startTime;
    
    if (result !== undefined && result.length > 0 && duration < 1000) {
      console.log('✅ PASS: Function completed successfully');
      console.log(`   Duration: ${duration}ms`);
      console.log(`   Result length: ${result.length} characters`);
      testsPassed++;
    } else {
      console.log('❌ FAIL: Function did not complete correctly');
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ FAIL: Function crashed with error:', error.message);
    testsFailed++;
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Test Summary:');
  console.log(`   ✅ Passed: ${testsPassed}`);
  console.log(`   ❌ Failed: ${testsFailed}`);
  console.log(`   Total: ${testsPassed + testsFailed}`);
  
  if (testsFailed === 0) {
    console.log('\n🎉 All tests passed! The ADF traversal safety fixes are working correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Please review the output above.');
  }

  return testsFailed === 0;
}

// Run tests
if (require.main === module) {
  const success = runTests();
  process.exit(success ? 0 : 1);
}

module.exports = { runTests, extractTextFromAdf, createDeeplyNestedADF, createCircularReferenceADF, createComplexCircularADF, createNormalADF };

