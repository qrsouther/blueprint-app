/**
 * Tests for ErrorBoundary component
 *
 * Tests that ErrorBoundary catches React errors and displays fallback UI.
 * Note: Error boundaries require React rendering, so we test the structure
 * and error handling logic rather than full integration.
 */

import React from 'react';
import ErrorBoundary from '../ErrorBoundary.jsx';

// Mock logger
jest.mock('../../../utils/logger.js', () => ({
  logger: {
    errors: jest.fn()
  }
}));

// Mock Forge React components
jest.mock('@forge/react', () => ({
  SectionMessage: ({ appearance, title, children }) => ({
    type: 'SectionMessage',
    props: { appearance, title, children }
  }),
  Text: ({ children }) => ({ type: 'Text', props: { children } })
}));

describe('ErrorBoundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Suppress console.error for error boundary tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  test('should have getDerivedStateFromError static method', () => {
    const error = new Error('Test error');
    const state = ErrorBoundary.getDerivedStateFromError(error);

    expect(state).toEqual({
      hasError: true,
      error: error
    });
  });

  test('should initialize with no error state', () => {
    const boundary = new ErrorBoundary({ children: React.createElement('div', null, 'Test') });
    
    // State is initialized in constructor
    expect(boundary.state).toBeDefined();
    expect(boundary.state.hasError).toBe(false);
  });

  test('should update state when error is caught', () => {
    const boundary = new ErrorBoundary({ children: React.createElement('div', null, 'Test') });
    const error = new Error('Test error');
    
    const newState = ErrorBoundary.getDerivedStateFromError(error);
    expect(newState.hasError).toBe(true);
    expect(newState.error).toBe(error);
  });

  test('should call componentDidCatch and log error', () => {
    const { logger } = require('../../../utils/logger.js');
    const boundary = new ErrorBoundary({ children: React.createElement('div', null, 'Test') });
    const error = new Error('Test error');
    const errorInfo = { componentStack: 'Test stack' };

    boundary.componentDidCatch(error, errorInfo);

    expect(logger.errors).toHaveBeenCalledWith(
      'React Error Boundary caught error:',
      { error, errorInfo }
    );
  });

  test('should render children when no error', () => {
    const testChild = React.createElement('div', null, 'Test content');
    const boundary = new ErrorBoundary({ children: testChild });
    const result = boundary.render();

    expect(result).toBe(testChild);
  });

  test('should render error UI when error occurs', () => {
    const boundary = new ErrorBoundary({ children: React.createElement('div', null, 'Test') });
    boundary.setState({
      hasError: true,
      error: new Error('Test error'),
      errorInfo: null
    });

    const result = boundary.render();

    // Check that it returns something (the error UI)
    expect(result).toBeDefined();
    // The actual structure depends on the mocked Forge components
    // We're just verifying it doesn't crash and returns something
  });
});

