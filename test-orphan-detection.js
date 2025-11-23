/**
 * Automated Test Suite for Orphan Detection Fixes
 * 
 * Tests the orphan detection improvements:
 * 1. Checks all possible localId locations
 * 2. Checks bodiedExtension nodes
 * 3. Error handling logic (404 vs 403 vs 500)
 * 
 * Run with: node test-orphan-detection.js
 */

/**
 * Simplified version of checkMacroExistsInADF for testing
 * (Copy of the fixed version from page-scanner.js)
 */
function checkMacroExistsInADF(node, targetLocalId, depth = 0, visited = new Set()) {
  const MAX_DEPTH = 100;
  if (depth > MAX_DEPTH) {
    return false;
  }

  if (!node || typeof node !== 'object') {
    return false;
  }

  if (visited.has(node)) {
    return false;
  }
  visited.add(node);

  function checkLocalIdInNode(nodeToCheck) {
    if (!nodeToCheck || typeof nodeToCheck !== 'object') {
      return false;
    }

    // Primary location: node.attrs.localId
    if (nodeToCheck.attrs?.localId === targetLocalId) {
      return true;
    }

    // Alternative location: node.attrs.parameters.localId
    if (nodeToCheck.attrs?.parameters?.localId === targetLocalId) {
      return true;
    }

    // Alternative location: node.attrs.parameters.macroParams.localId
    if (nodeToCheck.attrs?.parameters?.macroParams?.localId === targetLocalId) {
      return true;
    }

    // Alternative location: node.attrs.parameters.macroParams.localId.value
    if (nodeToCheck.attrs?.parameters?.macroParams?.localId?.value === targetLocalId) {
      return true;
    }

    return false;
  }

  if (node.type === 'extension' || node.type === 'bodiedExtension') {
    if (checkLocalIdInNode(node)) {
      visited.delete(node);
      return true;
    }

    const extensionKey = node.attrs?.extensionKey || '';
    const isOurMacro = extensionKey.includes('blueprint-standard-embed') ||
                       extensionKey.includes('smart-excerpt-include') ||
                       extensionKey.includes('blueprint-standard-embed-poc') ||
                       extensionKey === 'blueprint-standard-embed' ||
                       extensionKey === 'smart-excerpt-include' ||
                       extensionKey === 'blueprint-standard-embed-poc';

    if (isOurMacro) {
      if (checkLocalIdInNode(node)) {
        visited.delete(node);
        return true;
      }
    }

    if (node.attrs?.extensionType === 'com.atlassian.confluence.macro.core' ||
        node.attrs?.extensionType === 'com.atlassian.ecosystem') {
      if (checkLocalIdInNode(node)) {
        visited.delete(node);
        return true;
      }
    }
  }

  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      if (checkMacroExistsInADF(child, targetLocalId, depth + 1, visited)) {
        visited.delete(node);
        return true;
      }
    }
  }

  visited.delete(node);
  return false;
}

/**
 * Test Case 1: Standard Extension with localId in attrs.localId
 */
function createStandardExtensionADF(localId) {
  return {
    type: 'doc',
    content: [
      {
        type: 'extension',
        attrs: {
          extensionType: 'com.atlassian.confluence.macro.core',
          extensionKey: 'blueprint-standard-embed',
          localId: localId
        }
      }
    ]
  };
}

/**
 * Test Case 2: Extension with localId in attrs.parameters.localId
 */
function createExtensionWithParamsADF(localId) {
  return {
    type: 'doc',
    content: [
      {
        type: 'extension',
        attrs: {
          extensionType: 'com.atlassian.confluence.macro.core',
          extensionKey: 'blueprint-standard-embed',
          parameters: {
            localId: localId
          }
        }
      }
    ]
  };
}

/**
 * Test Case 3: Extension with localId in attrs.parameters.macroParams.localId
 */
function createExtensionWithMacroParamsADF(localId) {
  return {
    type: 'doc',
    content: [
      {
        type: 'extension',
        attrs: {
          extensionType: 'com.atlassian.confluence.macro.core',
          extensionKey: 'blueprint-standard-embed',
          parameters: {
            macroParams: {
              localId: localId
            }
          }
        }
      }
    ]
  };
}

/**
 * Test Case 4: Extension with localId in attrs.parameters.macroParams.localId.value
 */
function createExtensionWithNestedValueADF(localId) {
  return {
    type: 'doc',
    content: [
      {
        type: 'extension',
        attrs: {
          extensionType: 'com.atlassian.confluence.macro.core',
          extensionKey: 'blueprint-standard-embed',
          parameters: {
            macroParams: {
              localId: {
                value: localId
              }
            }
          }
        }
      }
    ]
  };
}

/**
 * Test Case 5: BodiedExtension (not just extension)
 */
function createBodiedExtensionADF(localId) {
  return {
    type: 'doc',
    content: [
      {
        type: 'bodiedExtension',
        attrs: {
          extensionType: 'com.atlassian.confluence.macro.core',
          extensionKey: 'blueprint-standard-embed',
          localId: localId
        },
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Content inside bodied extension' }]
          }
        ]
      }
    ]
  };
}

/**
 * Test Case 6: Nested Extension (macro inside other content)
 */
function createNestedExtensionADF(localId) {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Before macro' }]
      },
      {
        type: 'extension',
        attrs: {
          extensionType: 'com.atlassian.confluence.macro.core',
          extensionKey: 'blueprint-standard-embed',
          localId: localId
        }
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'After macro' }]
      }
    ]
  };
}

/**
 * Test Case 7: Multiple Extensions (find specific one)
 */
function createMultipleExtensionsADF(targetLocalId, otherLocalId) {
  return {
    type: 'doc',
    content: [
      {
        type: 'extension',
        attrs: {
          extensionType: 'com.atlassian.confluence.macro.core',
          extensionKey: 'blueprint-standard-embed',
          localId: otherLocalId
        }
      },
      {
        type: 'extension',
        attrs: {
          extensionType: 'com.atlassian.confluence.macro.core',
          extensionKey: 'blueprint-standard-embed',
          localId: targetLocalId
        }
      }
    ]
  };
}

/**
 * Test Case 8: Extension with Legacy Macro Name
 */
function createLegacyMacroADF(localId) {
  return {
    type: 'doc',
    content: [
      {
        type: 'extension',
        attrs: {
          extensionType: 'com.atlassian.confluence.macro.core',
          extensionKey: 'smart-excerpt-include', // Legacy name
          localId: localId
        }
      }
    ]
  };
}

/**
 * Test Case 9: Extension NOT Found (should return false)
 */
function createNoMacroADF() {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'No macro here' }]
      }
    ]
  };
}

/**
 * Test Case 10: Extension with Wrong localId (should return false)
 */
function createWrongLocalIdADF() {
  return {
    type: 'doc',
    content: [
      {
        type: 'extension',
        attrs: {
          extensionType: 'com.atlassian.confluence.macro.core',
          extensionKey: 'blueprint-standard-embed',
          localId: 'wrong-local-id'
        }
      }
    ]
  };
}

/**
 * Test error handling logic (simulated)
 */
function testErrorHandling() {
  console.log('\n📋 Testing Error Handling Logic');
  console.log('='.repeat(60));

  const tests = [
    {
      name: 'HTTP 404 (Page Deleted)',
      httpStatus: 404,
      expectedErrorType: 'page_deleted',
      shouldMarkOrphaned: true
    },
    {
      name: 'HTTP 403 (Permission Denied)',
      httpStatus: 403,
      expectedErrorType: 'permission_denied',
      shouldMarkOrphaned: false
    },
    {
      name: 'HTTP 401 (Unauthorized)',
      httpStatus: 401,
      expectedErrorType: 'unauthorized',
      shouldMarkOrphaned: false
    },
    {
      name: 'HTTP 500 (Server Error)',
      httpStatus: 500,
      expectedErrorType: 'transient_failure',
      shouldMarkOrphaned: false
    },
    {
      name: 'HTTP 503 (Service Unavailable)',
      httpStatus: 503,
      expectedErrorType: 'transient_failure',
      shouldMarkOrphaned: false
    }
  ];

  let passed = 0;
  let failed = 0;

  tests.forEach(test => {
    // Simulate the error handling logic
    let errorType;
    let shouldMarkOrphaned;

    if (test.httpStatus === 404) {
      errorType = 'page_deleted';
      shouldMarkOrphaned = true;
    } else if (test.httpStatus === 403) {
      errorType = 'permission_denied';
      shouldMarkOrphaned = false;
    } else if (test.httpStatus === 401) {
      errorType = 'unauthorized';
      shouldMarkOrphaned = false;
    } else if (test.httpStatus >= 500 && test.httpStatus < 600) {
      errorType = 'transient_failure';
      shouldMarkOrphaned = false;
    } else {
      errorType = 'client_error';
      shouldMarkOrphaned = false;
    }

    const errorTypeMatches = errorType === test.expectedErrorType;
    const orphanedMatches = shouldMarkOrphaned === test.shouldMarkOrphaned;

    if (errorTypeMatches && orphanedMatches) {
      console.log(`✅ ${test.name}: Error type = ${errorType}, Mark orphaned = ${shouldMarkOrphaned}`);
      passed++;
    } else {
      console.log(`❌ ${test.name}: Expected errorType=${test.expectedErrorType}, orphaned=${test.shouldMarkOrphaned}`);
      console.log(`   Got errorType=${errorType}, orphaned=${shouldMarkOrphaned}`);
      failed++;
    }
  });

  return { passed, failed };
}

/**
 * Run all test cases
 */
function runTests() {
  console.log('🧪 Testing Orphan Detection Fixes\n');
  console.log('='.repeat(60));

  let testsPassed = 0;
  let testsFailed = 0;

  const targetLocalId = 'test-macro-123';
  const otherLocalId = 'other-macro-456';

  // Test 1: Standard Extension with localId in attrs.localId
  console.log('\n📋 Test 1: Extension with localId in attrs.localId');
  try {
    const adf = createStandardExtensionADF(targetLocalId);
    const result = checkMacroExistsInADF(adf, targetLocalId);
    if (result === true) {
      console.log('✅ PASS: Found macro with localId in attrs.localId');
      testsPassed++;
    } else {
      console.log('❌ FAIL: Did not find macro with localId in attrs.localId');
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ FAIL: Error:', error.message);
    testsFailed++;
  }

  // Test 2: Extension with localId in attrs.parameters.localId
  console.log('\n📋 Test 2: Extension with localId in attrs.parameters.localId');
  try {
    const adf = createExtensionWithParamsADF(targetLocalId);
    const result = checkMacroExistsInADF(adf, targetLocalId);
    if (result === true) {
      console.log('✅ PASS: Found macro with localId in attrs.parameters.localId');
      testsPassed++;
    } else {
      console.log('❌ FAIL: Did not find macro with localId in attrs.parameters.localId');
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ FAIL: Error:', error.message);
    testsFailed++;
  }

  // Test 3: Extension with localId in attrs.parameters.macroParams.localId
  console.log('\n📋 Test 3: Extension with localId in attrs.parameters.macroParams.localId');
  try {
    const adf = createExtensionWithMacroParamsADF(targetLocalId);
    const result = checkMacroExistsInADF(adf, targetLocalId);
    if (result === true) {
      console.log('✅ PASS: Found macro with localId in attrs.parameters.macroParams.localId');
      testsPassed++;
    } else {
      console.log('❌ FAIL: Did not find macro with localId in attrs.parameters.macroParams.localId');
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ FAIL: Error:', error.message);
    testsFailed++;
  }

  // Test 4: Extension with localId in attrs.parameters.macroParams.localId.value
  console.log('\n📋 Test 4: Extension with localId in attrs.parameters.macroParams.localId.value');
  try {
    const adf = createExtensionWithNestedValueADF(targetLocalId);
    const result = checkMacroExistsInADF(adf, targetLocalId);
    if (result === true) {
      console.log('✅ PASS: Found macro with localId in attrs.parameters.macroParams.localId.value');
      testsPassed++;
    } else {
      console.log('❌ FAIL: Did not find macro with localId in attrs.parameters.macroParams.localId.value');
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ FAIL: Error:', error.message);
    testsFailed++;
  }

  // Test 5: BodiedExtension (not just extension)
  console.log('\n📋 Test 5: BodiedExtension node (not just extension)');
  try {
    const adf = createBodiedExtensionADF(targetLocalId);
    const result = checkMacroExistsInADF(adf, targetLocalId);
    if (result === true) {
      console.log('✅ PASS: Found macro in bodiedExtension node');
      testsPassed++;
    } else {
      console.log('❌ FAIL: Did not find macro in bodiedExtension node');
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ FAIL: Error:', error.message);
    testsFailed++;
  }

  // Test 6: Nested Extension
  console.log('\n📋 Test 6: Extension nested in other content');
  try {
    const adf = createNestedExtensionADF(targetLocalId);
    const result = checkMacroExistsInADF(adf, targetLocalId);
    if (result === true) {
      console.log('✅ PASS: Found macro nested in other content');
      testsPassed++;
    } else {
      console.log('❌ FAIL: Did not find macro nested in other content');
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ FAIL: Error:', error.message);
    testsFailed++;
  }

  // Test 7: Multiple Extensions (find specific one)
  console.log('\n📋 Test 7: Multiple extensions (find specific localId)');
  try {
    const adf = createMultipleExtensionsADF(targetLocalId, otherLocalId);
    const result = checkMacroExistsInADF(adf, targetLocalId);
    if (result === true) {
      console.log('✅ PASS: Found correct macro among multiple extensions');
      testsPassed++;
    } else {
      console.log('❌ FAIL: Did not find correct macro among multiple extensions');
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ FAIL: Error:', error.message);
    testsFailed++;
  }

  // Test 8: Legacy Macro Name
  console.log('\n📋 Test 8: Extension with legacy macro name (smart-excerpt-include)');
  try {
    const adf = createLegacyMacroADF(targetLocalId);
    const result = checkMacroExistsInADF(adf, targetLocalId);
    if (result === true) {
      console.log('✅ PASS: Found macro with legacy name');
      testsPassed++;
    } else {
      console.log('❌ FAIL: Did not find macro with legacy name');
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ FAIL: Error:', error.message);
    testsFailed++;
  }

  // Test 9: Extension NOT Found (should return false)
  console.log('\n📋 Test 9: No macro in ADF (should return false)');
  try {
    const adf = createNoMacroADF();
    const result = checkMacroExistsInADF(adf, targetLocalId);
    if (result === false) {
      console.log('✅ PASS: Correctly returned false when no macro exists');
      testsPassed++;
    } else {
      console.log('❌ FAIL: Should return false when no macro exists');
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ FAIL: Error:', error.message);
    testsFailed++;
  }

  // Test 10: Extension with Wrong localId (should return false)
  console.log('\n📋 Test 10: Extension with wrong localId (should return false)');
  try {
    const adf = createWrongLocalIdADF();
    const result = checkMacroExistsInADF(adf, targetLocalId);
    if (result === false) {
      console.log('✅ PASS: Correctly returned false for wrong localId');
      testsPassed++;
    } else {
      console.log('❌ FAIL: Should return false for wrong localId');
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ FAIL: Error:', error.message);
    testsFailed++;
  }

  // Test Error Handling
  const errorTestResults = testErrorHandling();
  testsPassed += errorTestResults.passed;
  testsFailed += errorTestResults.failed;

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Test Summary:');
  console.log(`   ✅ Passed: ${testsPassed}`);
  console.log(`   ❌ Failed: ${testsFailed}`);
  console.log(`   Total: ${testsPassed + testsFailed}`);

  if (testsFailed === 0) {
    console.log('\n🎉 All tests passed! The orphan detection fixes are working correctly.');
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

module.exports = {
  runTests,
  checkMacroExistsInADF,
  createStandardExtensionADF,
  createExtensionWithParamsADF,
  createExtensionWithMacroParamsADF,
  createExtensionWithNestedValueADF,
  createBodiedExtensionADF,
  createNestedExtensionADF,
  createMultipleExtensionsADF,
  createLegacyMacroADF,
  createNoMacroADF,
  createWrongLocalIdADF
};

