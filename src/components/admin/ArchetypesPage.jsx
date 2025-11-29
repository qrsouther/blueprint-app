/**
 * ArchetypesPage Component
 *
 * Main page component for managing Archetypes in the Admin UI.
 * Provides a split-panel layout with archetype list sidebar and config panel.
 *
 * @module ArchetypesPage
 */

import React, { useState, useCallback, memo } from 'react';
import {
  Box,
  Inline,
  xcss
} from '@forge/react';
import { ArchetypeListSidebar } from './ArchetypeListSidebar';
import { ArchetypeConfig } from './ArchetypeConfig';
import { tabPanelContentStyles } from '../../styles/admin-styles.js';

export const ArchetypesPage = memo(function ArchetypesPage() {
  const [selectedArchetypeId, setSelectedArchetypeId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Stable callback references to prevent child re-renders
  const handleArchetypeUpdated = useCallback((updatedArchetype) => {
    // Trigger sidebar refresh
    setRefreshKey(prev => prev + 1);
  }, []);

  const handleArchetypeDeleted = useCallback((deletedArchetypeId) => {
    // Clear selection
    setSelectedArchetypeId(null);
    // Trigger sidebar refresh
    setRefreshKey(prev => prev + 1);
  }, []);

  const handleArchetypeCopied = useCallback((copiedArchetype) => {
    // Select the newly copied archetype
    setSelectedArchetypeId(copiedArchetype.id);
    // Trigger sidebar refresh
    setRefreshKey(prev => prev + 1);
  }, []);

  return (
    <Box xcss={xcss({ width: '100%', maxWidth: '100%', overflow: 'hidden' })}>
      <Box xcss={tabPanelContentStyles}>
        <Inline
          space="space.200"
          alignBlock="stretch"
          shouldWrap={false}
          xcss={xcss({
            width: '100%',
            maxWidth: '100%',
            minWidth: 0,
            overflow: 'hidden',
            alignItems: 'stretch'
          })}
        >
          {/* Left Sidebar - Archetype List */}
          <ArchetypeListSidebar
            key={refreshKey}
            selectedArchetypeId={selectedArchetypeId}
            setSelectedArchetypeId={setSelectedArchetypeId}
          />

          {/* Main Panel - Archetype Config */}
          <ArchetypeConfig
            selectedArchetypeId={selectedArchetypeId}
            onArchetypeUpdated={handleArchetypeUpdated}
            onArchetypeDeleted={handleArchetypeDeleted}
            onArchetypeCopied={handleArchetypeCopied}
          />
        </Inline>
      </Box>
    </Box>
  );
});
