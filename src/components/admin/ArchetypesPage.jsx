/**
 * ArchetypesPage Component
 *
 * Main page component for managing Archetypes in the Admin UI.
 * Provides a split-panel layout with archetype list sidebar and config panel.
 *
 * @module ArchetypesPage
 */

import React, { useState } from 'react';
import {
  Box,
  Inline,
  xcss
} from '@forge/react';
import { ArchetypeListSidebar } from './ArchetypeListSidebar';
import { ArchetypeConfig } from './ArchetypeConfig';

const tabPanelContentStyles = xcss({
  padding: 'space.300',
  width: '100%',
  maxWidth: '100%',
  overflow: 'hidden'
});

export function ArchetypesPage() {
  const [selectedArchetypeId, setSelectedArchetypeId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleArchetypeUpdated = (updatedArchetype) => {
    // Trigger sidebar refresh
    setRefreshKey(prev => prev + 1);
  };

  const handleArchetypeDeleted = (deletedArchetypeId) => {
    // Clear selection
    setSelectedArchetypeId(null);
    // Trigger sidebar refresh
    setRefreshKey(prev => prev + 1);
  };

  return (
    <Box xcss={tabPanelContentStyles}>
      <Box xcss={xcss({ width: '100%', maxWidth: '100%', overflow: 'hidden' })}>
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
          />
        </Inline>
      </Box>
    </Box>
  );
}

