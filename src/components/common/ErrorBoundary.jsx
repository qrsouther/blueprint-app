/**
 * Error Boundary Component
 *
 * Catches React rendering errors and displays a user-friendly error message.
 * This prevents the entire app from crashing when a component throws an error.
 *
 * Usage:
 * <ErrorBoundary>
 *   <YourComponent />
 * </ErrorBoundary>
 */

import React from 'react';
import { SectionMessage, Text } from '@forge/react';
import { logger } from '../../utils/logger.js';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error for debugging
    logger.errors('React Error Boundary caught error:', { error, errorInfo });
  }

  render() {
    if (this.state.hasError) {
      // Render fallback UI
      return (
        <SectionMessage appearance="error" title="Something went wrong">
          <Text>An unexpected error occurred. Please refresh the page.</Text>
        </SectionMessage>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

