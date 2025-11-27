/**
 * EmbedContainer Component
 *
 * Container component following the Container/Presentational pattern.
 * This is the main entry point for the Blueprint Standard Embed macro in Forge.
 *
 * ARCHITECTURE:
 * This file acts as a Container component that:
 * - Manages all state and business logic for both view and edit modes
 * - Handles data fetching, caching, and state synchronization
 * - Orchestrates React Query hooks for data management
 * - Routes to appropriate presentational components based on mode
 *
 * PRESENTATIONAL COMPONENTS:
 * - EmbedEditMode.jsx: Pure presentational component for editing UI
 *   - Receives all state and handlers as props
 *   - Renders the editing interface (tabs, inputs, preview)
 *   - No business logic or state management
 *
 * - EmbedViewMode.jsx: Pure presentational component for viewing UI
 *   - Receives all state and handlers as props
 *   - Renders the published content with staleness detection
 *   - No business logic or state management
 *
 * WHY THIS ARCHITECTURE:
 * The Container/Presentational pattern separates concerns:
 * - Container (this file): "How things work" (logic, state, data)
 * - Presentational (EmbedEditMode/EmbedViewMode): "How things look" (UI, rendering)
 *
 * Benefits:
 * - Clear separation of concerns
 * - Easier to test presentational components (just props)
 * - Centralized state management
 * - Single source of truth for data fetching
 *
 * MODE DETECTION:
 * - View Mode: When `context.extension.isEditing === false`
 *   - Renders EmbedViewMode with cached content
 *   - Handles staleness checking and update notifications
 *
 * - Edit Mode: When `context.extension.isEditing === true`
 *   - Renders EmbedEditMode with editing controls
 *   - Manages auto-save with debouncing
 *   - Handles variable/toggle/custom content configuration
 *
 * @see https://react.dev/learn/thinking-in-react#step-5-add-inverse-data-flow
 * @see https://www.patterns.dev/react/container-presentational-pattern
 */

import React, { Fragment, useState, useEffect, useRef } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { normalizeVariableValues } from './schemas/form-schemas';
import ForgeReconciler, {
  Text,
  Strong,
  Em,
  Code,
  Heading,
  Textfield,
  Toggle,
  Button,
  ButtonGroup,
  Tabs,
  Tab,
  TabList,
  TabPanel,
  Stack,
  Inline,
  Tooltip,
  Icon,
  DynamicTable,
  Box,
  Spinner,
  SectionMessage,
  Select,
  Lozenge,
  xcss,
  useConfig,
  useProductContext,
  AdfRenderer
} from '@forge/react';
import { invoke, router, view } from '@forge/bridge';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

// Import ADF rendering utilities
import {
  cleanAdfForRenderer,
  filterContentByToggles,
  substituteVariablesInAdf,
  insertCustomParagraphsInAdf,
  insertInternalNotesInAdf,
  extractParagraphsFromAdf
} from './utils/adf-rendering-utils';

// Import React Query hooks
import {
  useExcerptData,
  useSaveVariableValues,
  useAvailableExcerpts,
  useVariableValues,
  useCachedContent
} from './hooks/embed-hooks';

// Import UI components
import { VariableConfigPanel } from './components/VariableConfigPanel';
import { ToggleConfigPanel } from './components/ToggleConfigPanel';
import { CustomInsertionsPanel } from './components/CustomInsertionsPanel';
import { EnhancedDiffView } from './components/EnhancedDiffView';
import { UpdateAvailableBanner } from './components/embed/UpdateAvailableBanner';
import { EmbedViewMode } from './components/embed/EmbedViewMode';
import { EmbedEditMode } from './components/embed/EmbedEditMode';
import { DeactivatedEmbedsSelector } from './components/embed/DeactivatedEmbedsSelector';

// Import embed styles
import {
  previewBoxStyle,
  variableBoxStyle,
  requiredFieldStyle,
  updateBannerStyle,
  sectionContentStyle,
  adfContentContainerStyle,
  excerptSelectorStyle
} from './styles/embed-styles';

// Import logger for structured error logging
import { logger } from './utils/logger';
import ErrorBoundary from './components/common/ErrorBoundary.jsx';

// ============================================================================
// STYLES - Imported from ./styles/embed-styles.js
// ============================================================================

// Create a client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      cacheTime: 1000 * 60 * 30, // 30 minutes
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
});

const App = () => {
  const config = useConfig();
  const context = useProductContext();
  const queryClient = useQueryClient();
  const isEditing = context?.extension?.isEditing;  // Fixed: it's on extension, not extensionContext!

  // Use context.localId directly - recovery happens lazily only when data is missing
  const effectiveLocalId = context?.localId;

  // ============================================================================
  // ⚠️ CRITICAL WARNING: DO NOT ADD EARLY RETURN FOR MISSING localId ⚠️
  // ============================================================================
  // 
  // DO NOT attempt to add an early return check for missing localId (e.g., 
  // `if (!effectiveLocalId) return <ErrorComponent />`).
  //
  // REASONS:
  // 1. React Hooks Violation: Any early return BEFORE all hooks are declared
  //    violates React's Rules of Hooks, causing error #310 and component crashes.
  // 2. Hooks Must Be Called in Same Order: All useState, useEffect, useRef, etc.
  //    must be called in the same order on every render. Early returns break this.
  // 3. Rare Edge Case: Missing localId is extremely rare (only if macro is in
  //    invalid state). The existing null checks throughout the code already
  //    prevent crashes by returning early from effects/operations.
  // 4. Graceful Degradation: The component already handles missing localId
  //    gracefully - effects simply return early, preventing operations that
  //    require localId. No explicit error message is needed.
  //
  // EXISTING PROTECTION:
  // - All critical operations check `if (!effectiveLocalId) return;` within effects
  // - Auto-save, data loading, and other operations safely skip if localId missing
  // - Component renders but doesn't perform operations requiring localId
  //
  // IF YOU NEED TO HANDLE MISSING localId:
  // - Add checks WITHIN effects/handlers, not as early returns
  // - Use conditional rendering in the JSX return, not before hooks
  // - Consider if the edge case is worth the complexity
  //
  // ============================================================================

  // NEW: Inline excerpt selection state (will be loaded from backend storage)
  const [selectedExcerptId, setSelectedExcerptId] = useState(null);
  // availableExcerpts state removed - now managed by React Query
  const [isInitializing, setIsInitializing] = useState(true);

  // Track if we're in the initial data load phase to prevent auto-save during load
  const isLoadingInitialDataRef = useRef(false);
  
  // Track if a save operation is currently in progress to prevent overlapping saves
  const isSavingRef = useRef(false);
  
  // Track when we just completed a save to prevent sync effect from overwriting user edits
  // This prevents the sync effect from running immediately after auto-save completes
  const justCompletedSaveRef = useRef(false);

  const [content, setContent] = useState(null);
  // excerpt state removed - now managed by React Query
  const [excerptForViewMode, setExcerptForViewMode] = useState(null);
  
  // React Hook Form for embed configuration (replaces individual useState hooks)
  const {
    control,
    watch,
    setValue,
    reset,
    formState: { isDirty }
  } = useForm({
    defaultValues: {
      variableValues: normalizeVariableValues(config?.variableValues || {}),
      toggleStates: config?.toggleStates || {},
      customInsertions: config?.customInsertions || [],
      internalNotes: config?.internalNotes || []
    },
    mode: 'onChange'
  });

  // Watch form values for auto-save and component usage
  // These replace the old useState values
  const variableValues = useWatch({ control, name: 'variableValues' }) || {};
  const toggleStates = useWatch({ control, name: 'toggleStates' }) || {};
  const customInsertions = useWatch({ control, name: 'customInsertions' }) || [];
  const internalNotes = useWatch({ control, name: 'internalNotes' }) || [];
  const [insertionType, setInsertionType] = useState('body'); // 'body' or 'note'
  const [selectedPosition, setSelectedPosition] = useState(null);
  const [customText, setCustomText] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved', 'saving', or 'error'
  const [isRecovering, setIsRecovering] = useState(false); // Tracks when recovery from drag-and-drop is in progress
  const [selectedTabIndex, setSelectedTabIndex] = useState(0); // Track active tab (0=Write, 1=Toggles, 2=Free Write)
  // Deactivated Embeds state (for user-controlled recovery)
  const [deactivatedEmbeds, setDeactivatedEmbeds] = useState([]);
  const [showDeactivatedSelector, setShowDeactivatedSelector] = useState(false);
  const [isLoadingDeactivated, setIsLoadingDeactivated] = useState(false);
  const [isRestoringEmbed, setIsRestoringEmbed] = useState(false); // Loading state during restore operation
  // View mode staleness detection state
  const [isStale, setIsStale] = useState(false);
  const [isCheckingStaleness, setIsCheckingStaleness] = useState(false); // Tracks when staleness check is running
  const [sourceLastModified, setSourceLastModified] = useState(null);
  const [includeLastSynced, setIncludeLastSynced] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showDiffView, setShowDiffView] = useState(false);
  const [latestRenderedContent, setLatestRenderedContent] = useState(null);
  const [syncedContent, setSyncedContent] = useState(null); // Old Source ADF from last sync for diff comparison

  // ============================================================================
  // LOCKED PAGE MODEL: Local edit state (independent of Confluence's page edit mode)
  // ============================================================================
  // In the Locked Page Model, users cannot access Confluence's page Edit Mode.
  // Instead, each Embed has its own Edit button that opens the edit UI.
  // This state tracks whether the user has clicked the Edit button on THIS Embed.
  const [isEditingEmbed, setIsEditingEmbed] = useState(false);

  // Publish state (Compositor + Native Injection model)
  const [publishStatus, setPublishStatus] = useState(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState(null);

  // Use React Query to fetch excerpt data (enabled in both edit and view modes)
  // We need excerpt metadata (like documentationLinks) in both modes
  const {
    data: excerptFromQuery,
    isLoading: isLoadingExcerpt,
    error: excerptError,
    isFetching: isFetchingExcerpt,
    refetch: refetchExcerpt
  } = useExcerptData(selectedExcerptId, true);

  // Use React Query mutation for saving variable values
  const {
    mutate: saveVariableValuesMutation,
    mutateAsync: saveVariableValuesMutationAsync,
    isPending: isSavingVariables,
    isSuccess: isSaveSuccess,
    isError: isSaveError
  } = useSaveVariableValues();

  // Use React Query to fetch available excerpts list (only in edit mode)
  const {
    data: availableExcerpts = [],
    isLoading: isLoadingExcerpts,
    error: excerptsError
  } = useAvailableExcerpts(isEditing);

  // Use React Query to fetch variable values (always, both edit and view mode)
  const {
    data: variableValuesData,
    isLoading: isLoadingVariableValues,
    error: variableValuesError
  } = useVariableValues(effectiveLocalId, true);

  // Use React Query to fetch cached content (view mode only)
  const {
    data: cachedContentData,
    isLoading: isLoadingCachedContent,
    error: cachedContentError
  } = useCachedContent(
    effectiveLocalId,
    selectedExcerptId,
    !isEditing, // Only fetch in view mode
    context,
    null, // reset - not used in view mode (React Hook Form is only for edit mode)
    setExcerptForViewMode
  );

  // Use excerptFromQuery when available (edit mode), fallback to manual state for view mode
  const excerpt = isEditing ? excerptFromQuery : excerptForViewMode;

  // ============================================================================
  // STATE MANAGEMENT DOCUMENTATION
  // ============================================================================
  // This component uses 22 useState hooks organized into logical groups:
  //
  // 1. Core Configuration State:
  //    - selectedExcerptId: Currently selected Blueprint Standard ID
  //    - isInitializing: Whether component is still loading initial data
  //    - content: Rendered content for display
  //    - excerptForViewMode: Excerpt data cached for view mode
  //
  // 2. User Configuration State (saved to storage):
  //    - variableValues: User-provided variable values
  //    - toggleStates: User-selected toggle on/off states
  //    - customInsertions: User-added custom paragraph insertions
  //    - internalNotes: User-added internal notes
  //
  // 3. UI State (not saved):
  //    - insertionType, selectedPosition, customText: Free Write tab state
  //    - isRefreshing, saveStatus: Loading/saving indicators
  //    - selectedTabIndex: Active tab in edit mode
  //
  // 4. Staleness Detection State:
  //    - isStale, isCheckingStaleness: Update availability tracking
  //    - sourceLastModified, includeLastSynced: Timestamp tracking
  //    - isUpdating, showDiffView: Update UI state
  //    - latestRenderedContent, syncedContent: Diff view data
  //
  // Note: State consolidation (grouping related state) is a future optimization.
  // Current structure prioritizes clarity and maintainability.

  // ============================================================================
  // SYNC EFFECT GUARD MECHANISM
  // ============================================================================
  // CRITICAL: This ref prevents React Query refetches from overwriting user edits.
  //
  // Problem: When React Query refetches variableValuesData (e.g., after cache
  // invalidation), the sync effect would run again and overwrite any user edits
  // that happened since the initial load.
  //
  // Solution: The hasLoadedInitialDataRef guard ensures the sync effect only
  // runs ONCE per embed instance. After the first sync, subsequent React Query
  // updates are ignored, preserving user edits.
  //
  // Flow:
  // 1. Component mounts → hasLoadedInitialDataRef.current = false
  // 2. React Query loads data → sync effect runs → sets state → flag = true
  // 3. User makes edits → state updates → auto-save saves to storage
  // 4. Auto-save invalidates cache → React Query refetches → sync effect runs
  // 5. Guard check: hasLoadedInitialDataRef.current === true → return early
  // 6. User edits preserved! ✅
  //
  // Reset: Flag resets to false when effectiveLocalId or selectedExcerptId
  // changes (new embed instance), allowing initial data to load for new instances.
  const hasLoadedInitialDataRef = useRef(false);

  // Load excerptId from React Query data
  useEffect(() => {
    if (variableValuesData && variableValuesData.excerptId) {
      setSelectedExcerptId(variableValuesData.excerptId);
    }
    if (!isLoadingVariableValues) {
      setIsInitializing(false);
    }
  }, [variableValuesData, isLoadingVariableValues]);

  // ============================================================================
  // SYNC EFFECT: React Query → Component State (READ operation)
  // ============================================================================
  // Purpose: Load saved data from storage (via React Query) into component state
  // on initial mount. This is a ONE-TIME operation per embed instance.
  //
  // Guard Mechanism: The hasLoadedInitialDataRef prevents this effect from
  // overwriting user edits when React Query refetches after auto-save.
  //
  // Execution Flow:
  // 1. Runs when: variableValuesData changes (React Query loads/refetches)
  // 2. Checks: Edit mode, data available, not loading, has localId
  // 3. Guard: If already synced once, return early (protect user edits)
  // 4. Sync: Copy React Query data to component state (only non-empty values)
  // 5. Flag: Mark as synced (prevents future overwrites)
  //
  // CRITICAL: This must run before the loadContent effect to ensure state
  // is set correctly before content generation.
  useEffect(() => {
    // Only sync in edit mode and when we have data
    if (!isEditing || !variableValuesData || isLoadingVariableValues || !effectiveLocalId) {
      return;
    }

    // GUARD: Skip sync if we just completed a save
    // This prevents the sync effect from overwriting user edits immediately after auto-save
    // The save operation already updated the form values, so we don't need to sync from React Query
    if (justCompletedSaveRef.current) {
      logger.saves('[EmbedContainer] Skipping sync - save just completed', { localId: effectiveLocalId });
      return;
    }

    // GUARD: Only sync on initial load to avoid overwriting user edits
    // After first sync, this effect will return early even if React Query refetches
    if (hasLoadedInitialDataRef.current) {
      return;
    }

    // Mark that we've loaded initial data (prevents future overwrites)
    hasLoadedInitialDataRef.current = true;

    // Sync React Query data to component state
    // CRITICAL: Always set the complete variableValues object to ensure all variables are included
    // This prevents the last variable from being dropped due to partial updates
    // CRITICAL: Only sync if values are actually different to avoid overwriting user edits
    if (variableValuesData.variableValues) {
      // Check if values actually differ before syncing
      const currentKeys = Object.keys(variableValues);
      const newKeys = Object.keys(variableValuesData.variableValues);
      const valuesDiffer = currentKeys.length !== newKeys.length ||
        currentKeys.some(key => {
          const currentVal = variableValues[key];
          const newVal = variableValuesData.variableValues[key];
          // Normalize for comparison: null, undefined, and empty string are all "empty"
          const currentEmpty = !currentVal || (typeof currentVal === 'string' && currentVal.trim() === '');
          const newEmpty = !newVal || (typeof newVal === 'string' && newVal.trim() === '');
          return currentEmpty !== newEmpty || currentVal !== newVal;
        }) ||
        newKeys.some(key => !(key in variableValues));
      
      // Only sync if values actually differ (prevents overwriting user edits with stale data)
      if (valuesDiffer) {
        const normalizedValues = normalizeVariableValues(variableValuesData.variableValues);
        setValue('variableValues', normalizedValues, { shouldDirty: false });
      }
    }
    if (variableValuesData.toggleStates && Object.keys(variableValuesData.toggleStates).length > 0) {
      const currentKeys = Object.keys(toggleStates);
      const newKeys = Object.keys(variableValuesData.toggleStates);
      const statesChanged = currentKeys.length !== newKeys.length ||
        currentKeys.some(key => toggleStates[key] !== variableValuesData.toggleStates[key]);
      if (statesChanged) {
        setValue('toggleStates', variableValuesData.toggleStates, { shouldDirty: false });
      }
    }
    if (variableValuesData.customInsertions && Array.isArray(variableValuesData.customInsertions) && variableValuesData.customInsertions.length > 0) {
      const insertionsChanged = JSON.stringify(customInsertions) !== JSON.stringify(variableValuesData.customInsertions);
      if (insertionsChanged) {
        setValue('customInsertions', variableValuesData.customInsertions, { shouldDirty: false });
      }
    }
    if (variableValuesData.internalNotes && Array.isArray(variableValuesData.internalNotes) && variableValuesData.internalNotes.length > 0) {
      const notesChanged = JSON.stringify(internalNotes) !== JSON.stringify(variableValuesData.internalNotes);
      if (notesChanged) {
        setValue('internalNotes', variableValuesData.internalNotes, { shouldDirty: false });
      }
    }
  }, [variableValuesData, isEditing, isLoadingVariableValues, effectiveLocalId]);

  // Reset the sync guard flag when switching to a new embed instance
  // This allows initial data to load for new instances while protecting
  // edits in the current instance
  useEffect(() => {
    hasLoadedInitialDataRef.current = false;
  }, [effectiveLocalId, selectedExcerptId]);

  // CRITICAL: Reset sync guard when variableValuesData changes significantly after initial load
  // This allows restored data to sync to state after a version restore
  // We detect a "significant change" by comparing the data structure
  useEffect(() => {
    if (!variableValuesData || !effectiveLocalId || !hasLoadedInitialDataRef.current) {
      return;
    }

    // Check if the data structure has changed significantly (indicates restore)
    const currentVarKeys = Object.keys(variableValues).sort();
    const newVarKeys = Object.keys(variableValuesData.variableValues || {}).sort();
    const keysChanged = JSON.stringify(currentVarKeys) !== JSON.stringify(newVarKeys);
    
    // Also check if variable count changed
    const countChanged = currentVarKeys.length !== newVarKeys.length;

    // If structure changed, reset guard to allow state sync
    if (keysChanged || countChanged) {
      hasLoadedInitialDataRef.current = false;
    }
  }, [variableValuesData, effectiveLocalId, variableValues]);

  // Force refetch excerpt when excerptId changes (e.g., when Source is updated)
  // This ensures we get the latest excerpt data even if React Query cache is stale
  useEffect(() => {
    if (selectedExcerptId && refetchExcerpt) {
      // Small delay to ensure any cache invalidation from Source updates has completed
      const timeoutId = setTimeout(() => {
        refetchExcerpt();
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [selectedExcerptId, refetchExcerpt]);

  // Set content from React Query cached content data (view mode)
  useEffect(() => {
    if (!isEditing && cachedContentData) {
      setContent(cachedContentData.content);
    }
  }, [isEditing, cachedContentData, effectiveLocalId]);

  // NOTE: Cache invalidation ONLY happens after auto-save (see line ~406)
  // We do NOT invalidate on every mode switch - that would defeat caching!
  // The auto-save invalidation is sufficient to keep view mode fresh after edits.

  // Detect deactivated Embeds when Embed has no data (user-controlled recovery)
  // This replaces the automatic recovery mechanism with a user-controlled approach
  useEffect(() => {
    // Only check for deactivated Embeds if:
    // - In edit mode
    // - Embed has no data (no excerptId, no variableValues, etc.)
    // - Not already loading
    if (!effectiveLocalId || !isEditing || isLoadingDeactivated) {
      return;
    }

    // Wait for React Query to finish loading
    if (isLoadingVariableValues) {
      return;
    }

    // Check if Embed has data - if it does, don't show deactivated selector
    const hasData = variableValuesData && (
      variableValuesData.excerptId ||
      (variableValuesData.variableValues && Object.keys(variableValuesData.variableValues).length > 0) ||
      (variableValuesData.toggleStates && Object.keys(variableValuesData.toggleStates).length > 0) ||
      (variableValuesData.customInsertions && variableValuesData.customInsertions.length > 0) ||
      (variableValuesData.internalNotes && variableValuesData.internalNotes.length > 0)
    );

    if (hasData) {
      // Embed already has data - don't show deactivated selector
      setShowDeactivatedSelector(false);
      return;
    }

    // Check storage directly to confirm no data
    const checkForDeactivatedEmbeds = async () => {
      setIsLoadingDeactivated(true);
      try {
        const varsResult = await invoke('getVariableValues', { localId: effectiveLocalId });
        
        const varsData = varsResult.success && varsResult.data ? varsResult.data : {};
        const hasNoData = !varsData.lastSynced &&
                          !varsData.excerptId &&
                          Object.keys(varsData.variableValues || {}).length === 0 &&
                          Object.keys(varsData.toggleStates || {}).length === 0 &&
                          (varsData.customInsertions || []).length === 0 &&
                          (varsData.internalNotes || []).length === 0;

        if (varsResult.success && hasNoData) {
          const pageId = context?.contentId || context?.extension?.content?.id;
          
          if (pageId) {
            // Detect deactivated Embeds
            const detectionResult = await invoke('detectDeactivatedEmbeds', {
              pageId: pageId,
              currentLocalId: context.localId
            });

            if (detectionResult.success && detectionResult.data?.deactivatedEmbeds && detectionResult.data.deactivatedEmbeds.length > 0) {
              setDeactivatedEmbeds(detectionResult.data.deactivatedEmbeds);
              setShowDeactivatedSelector(true);
            } else {
              setDeactivatedEmbeds([]);
              setShowDeactivatedSelector(false);
            }
          }
        } else {
          // Embed has data - don't show selector
          setDeactivatedEmbeds([]);
          setShowDeactivatedSelector(false);
        }
      } catch (error) {
        logger.errors('[EmbedContainer] Error detecting deactivated Embeds:', error);
        setDeactivatedEmbeds([]);
        setShowDeactivatedSelector(false);
      } finally {
        setIsLoadingDeactivated(false);
      }
    };

    checkForDeactivatedEmbeds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveLocalId, isEditing, isLoadingVariableValues, variableValuesData]);

  // Process excerpt data from React Query (runs in both Edit and View modes)
  // View Mode needs this to set excerptForViewMode with documentationLinks
  useEffect(() => {
    if (!selectedExcerptId || !effectiveLocalId) {
      return;
    }

    const loadContent = async () => {
      // Wait for React Query to load the excerpt
      if (!excerptFromQuery) {
        return;
      }

      // VIEW MODE: Just set excerptForViewMode and skip expensive processing
      // View Mode uses cached content, so we don't need to regenerate it
      if (!isEditing) {
        setExcerptForViewMode(excerptFromQuery);
        return;
      }

      // EDIT MODE: Full processing
      // Mark that we're loading initial data - this prevents auto-save from running
      isLoadingInitialDataRef.current = true;
      setIsRefreshing(true);

      try {
        // Use React Query data if available, otherwise fall back to direct invoke
        // This ensures we use the cached/optimized React Query data when possible
        let varsResultForLoading;
        if (variableValuesData && !isLoadingVariableValues) {
          // Use React Query data (already fetched and cached)
          varsResultForLoading = variableValuesData;
        } else {
          // Fallback: Load directly if React Query data isn't available yet
          varsResultForLoading = await invoke('getVariableValues', { localId: effectiveLocalId });
        }

        // CRITICAL: Check if data is missing - if so, attempt recovery from drag-to-move scenario
        // When a macro is dragged in Confluence, it may get a new localId, orphaning the data
        // Handle both React Query format (direct object) and invoke format (with success/data wrapper)
        const isSuccess = varsResultForLoading.success !== undefined 
          ? varsResultForLoading.success 
          : true; // React Query data is always "successful" if it exists
        // Extract data - React Query returns direct object, invoke returns { success, data }
        const varsDataForLoading = varsResultForLoading.data || varsResultForLoading;
        const hasNoData = !varsDataForLoading.lastSynced &&
                          Object.keys(varsDataForLoading.variableValues || {}).length === 0 &&
                          Object.keys(varsDataForLoading.toggleStates || {}).length === 0 &&
                          (varsDataForLoading.customInsertions || []).length === 0 &&
                          (varsDataForLoading.internalNotes || []).length === 0;

        // CRITICAL: Attempt recovery even if excerptId is missing
        // When a macro is dragged, excerptId may be lost, but we can still recover by pageId
        if (isSuccess && hasNoData) {
          const pageId = context?.contentId || context?.extension?.content?.id;

          // Try recovery with or without excerptId
          // If excerptId is missing, recovery will search by pageId alone
          const recoveryResult = await invoke('recoverOrphanedData', {
            pageId: pageId,
            excerptId: selectedExcerptId || null, // Can be null - recovery will search by pageId
            currentLocalId: context.localId
          });

          if (recoveryResult.success && recoveryResult.data?.recovered) {
            // Reload the data now that it's been migrated
            varsResultForLoading = await invoke('getVariableValues', { localId: effectiveLocalId });
            
            // CRITICAL: If excerptId was missing, set it from recovered data
            if (!selectedExcerptId && recoveryResult.data.data?.excerptId) {
              setSelectedExcerptId(recoveryResult.data.data.excerptId);
            }
          }
        }

        // Extract data - handle both React Query format (direct object) and invoke format (with success/data wrapper)
        const finalVarsData = varsResultForLoading.data || varsResultForLoading;
        const loadedVariableValues = finalVarsData.variableValues || {};
        const loadedToggleStates = finalVarsData.toggleStates || {};
        const loadedCustomInsertions = finalVarsData.customInsertions || [];
        const loadedInternalNotes = finalVarsData.internalNotes || [];

        // Auto-infer "client" variable from page title if it follows "Blueprint: [Client Name]" pattern
        let pageTitle = '';
        const contentId = context?.contentId || context?.extension?.content?.id;

        if (contentId) {
          try {
            const titleResult = await invoke('getPageTitle', { contentId });
            if (titleResult.success && titleResult.data) {
              pageTitle = titleResult.data.title;
            }
          } catch (err) {
            logger.errors('[EmbedContainer] Error fetching page title:', err);
          }
        }

        // Only auto-infer if client is undefined, null, or empty string (check both 'client' and 'Client' for case variations)
        const clientValue = loadedVariableValues['client'] || loadedVariableValues['Client'] || '';
        const clientIsEmpty = !clientValue || (typeof clientValue === 'string' && clientValue.trim() === '');

        // Check if title contains "Blueprint:" and extract client name
        if (pageTitle.includes('Blueprint:') && clientIsEmpty) {
          const blueprintIndex = pageTitle.indexOf('Blueprint:');
          const afterBlueprint = pageTitle.substring(blueprintIndex + 'Blueprint:'.length).trim();
          if (afterBlueprint) {
            loadedVariableValues['client'] = afterBlueprint;
          }
        }

        reset({
          variableValues: normalizeVariableValues(loadedVariableValues),
          toggleStates: loadedToggleStates,
          customInsertions: loadedCustomInsertions || [],
          internalNotes: loadedInternalNotes || []
        }, { keepDefaultValues: false });

        // Reset last saved values ref to allow next user edit to trigger save
        lastSavedValuesRef.current = null;

        // NOW: Generate the fresh rendered content with loaded settings
        let freshContent = excerptFromQuery.content;
        const isAdf = freshContent && typeof freshContent === 'object' && freshContent.type === 'doc';

    if (isAdf) {
      // Fix for GitHub issue #2 - Free Write paragraph insertion position with enabled toggles
      // FIX: Insert custom paragraphs BEFORE toggle filtering (same as previewContent fix above)
      // Insert custom paragraphs and internal notes into original content (before toggle filtering)
      freshContent = substituteVariablesInAdf(freshContent, loadedVariableValues);
      freshContent = insertCustomParagraphsInAdf(freshContent, loadedCustomInsertions);
      freshContent = insertInternalNotesInAdf(freshContent, loadedInternalNotes);
      // Then filter toggles (this will preserve insertions inside enabled toggles)
      freshContent = filterContentByToggles(freshContent, loadedToggleStates);
        } else {
          // For plain text, filter toggles first
          const toggleRegex = /\{\{toggle:([^}]+)\}\}([\s\S]*?)\{\{\/toggle:\1\}\}/g;
          freshContent = freshContent.replace(toggleRegex, (match, toggleName, content) => {
            const trimmedName = toggleName.trim();
            return loadedToggleStates?.[trimmedName] === true ? content : '';
          });

          // Strip any remaining markers
          freshContent = freshContent.replace(/\{\{toggle:[^}]+\}\}/g, '');
          freshContent = freshContent.replace(/\{\{\/toggle:[^}]+\}\}/g, '');

          // Then substitute variables
          const escapeRegex = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          if (excerptFromQuery.variables) {
            excerptFromQuery.variables.forEach(variable => {
              const value = loadedVariableValues[variable.name] || `{{${variable.name}}}`;
              const regex = new RegExp(`\\{\\{${escapeRegex(variable.name)}\\}\\}`, 'g');
              freshContent = freshContent.replace(regex, value);
            });
          }
        }

        setContent(freshContent);
      } catch (err) {
        logger.errors('[EmbedContainer] Error loading content:', err);
      } finally {
        setIsRefreshing(false);

        // Allow a brief moment for state to settle, then enable auto-save for user changes
        // This prevents the auto-save effect from triggering during initial data load
        setTimeout(() => {
          isLoadingInitialDataRef.current = false;
        }, 100);
      }
    };

    loadContent();
  }, [excerptFromQuery, effectiveLocalId, isEditing, isFetchingExcerpt]);

  // ============================================================================
  // AUTO-SAVE EFFECT: React Hook Form → Storage (WRITE operation)
  // ============================================================================
  // Purpose: Automatically save user edits to storage with debouncing.
  // This is an ONGOING operation that runs whenever form values change.
  //
  // Flow:
  // 1. User edits: Form values change via React Hook Form
  // 2. useWatch() detects change: Individual form fields are watched
  // 3. Effect triggers: Detects form change via isDirty flag
  // 4. Debounce: Waits 500ms for user to finish typing/editing
  // 5. Save: Uses React Query mutation to save to storage
  // 6. Cache: Also caches rendered content for view mode
  // 7. Invalidate: Marks React Query cache as stale (triggers refetch)
  //
  // Guard: isLoadingInitialDataRef prevents auto-save during initial data load,
  // avoiding false version history entries when Edit Mode first opens.
  //
  // Note: The sync effect guard (hasLoadedInitialDataRef) ensures that when
  // React Query refetches after this invalidation, it won't overwrite user edits.
  
  // Use a ref to store the last saved values for comparison
  // This prevents infinite loops by only saving when values actually change
  const lastSavedValuesRef = useRef(null);

  // Deep comparison helper to check if values actually changed
  const valuesChanged = (newValues, oldValues) => {
    if (!oldValues) return true; // First save
    
    // Compare variable values
    const newVarKeys = Object.keys(newValues.variableValues || {}).sort();
    const oldVarKeys = Object.keys(oldValues.variableValues || {}).sort();
    if (JSON.stringify(newVarKeys) !== JSON.stringify(oldVarKeys)) return true;
    
    for (const key of newVarKeys) {
      const newVal = newValues.variableValues[key];
      const oldVal = oldValues.variableValues[key];
      // Normalize for comparison: null, undefined, and empty string are all "empty"
      const newEmpty = !newVal || (typeof newVal === 'string' && newVal.trim() === '');
      const oldEmpty = !oldVal || (typeof oldVal === 'string' && oldVal.trim() === '');
      if (newEmpty !== oldEmpty || newVal !== oldVal) return true;
    }
    
    // Compare toggle states
    if (JSON.stringify(newValues.toggleStates || {}) !== JSON.stringify(oldValues.toggleStates || {})) {
      return true;
    }
    
    // Compare custom insertions
    if (JSON.stringify(newValues.customInsertions || []) !== JSON.stringify(oldValues.customInsertions || [])) {
      return true;
    }
    
    // Compare internal notes
    if (JSON.stringify(newValues.internalNotes || []) !== JSON.stringify(oldValues.internalNotes || [])) {
      return true;
    }
    
    return false; // No changes detected
  };

  useEffect(() => {
    // CRITICAL: Only run in edit mode with all required data
    // Check excerptFromQuery exists (but don't include in dependencies to avoid infinite loops)
    // excerptFromQuery changes reference when queries are invalidated, which would retrigger this effect
    if (!isEditing || !effectiveLocalId || !selectedExcerptId || !excerptFromQuery) {
      return;
    }

    // CRITICAL: Skip auto-save during initial data load
    // This prevents false version history entries when Edit Mode is first opened
    if (isLoadingInitialDataRef.current) {
      return;
    }

    // CRITICAL: Skip if form is not dirty (no changes made)
    // This prevents unnecessary saves when form is synced from props
    if (!isDirty) {
      return;
    }

    // CRITICAL: Skip if a save is already in progress
    // This prevents overlapping saves and infinite loops when multiple embeds are on the page
    if (isSavingRef.current) {
      return;
    }

    // Build current form values from watched values
    const currentValues = {
      variableValues: variableValues || {},
      toggleStates: toggleStates || {},
      customInsertions: customInsertions || [],
      internalNotes: internalNotes || []
    };

    // CRITICAL: Only save if values actually changed (deep comparison)
    // This prevents infinite loops from object reference changes
    if (!valuesChanged(currentValues, lastSavedValuesRef.current)) {
      logger.saves('[EmbedContainer] Skipping save - values unchanged', { localId: effectiveLocalId });
      return;
    }

    setSaveStatus('saving');
    isSavingRef.current = true;

    const saveStartTime = performance.now();

    const timeoutId = setTimeout(async () => {
      try {
        // CRITICAL: Normalize variable values to ensure empty strings are handled correctly
        const normalizedVariableValues = normalizeVariableValues(currentValues.variableValues);
        
        const dataToSave = {
          localId: effectiveLocalId,
          excerptId: selectedExcerptId,
          variableValues: normalizedVariableValues,
          toggleStates: currentValues.toggleStates,
          customInsertions: currentValues.customInsertions,
          internalNotes: currentValues.internalNotes
        };

        logger.saves('[EmbedContainer] Starting auto-save', { 
          localId: effectiveLocalId,
          variableValueCount: Object.keys(normalizedVariableValues).length,
          sampleValues: Object.keys(normalizedVariableValues).slice(0, 3).map(k => ({
            key: k,
            value: normalizedVariableValues[k],
            isEmpty: !normalizedVariableValues[k] || normalizedVariableValues[k] === ''
          }))
        });

        // Use mutateAsync to handle the promise directly
        // Add a timeout to prevent hanging forever
        const savePromise = saveVariableValuesMutationAsync(dataToSave);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Save operation timed out after 10 seconds')), 10000)
        );
        
        logger.saves('[EmbedContainer] Awaiting mutation...', { localId: effectiveLocalId });
        const result = await Promise.race([savePromise, timeoutPromise]);
        logger.saves('[EmbedContainer] Mutation completed', { 
          localId: effectiveLocalId,
          hasResult: !!result,
          resultSuccess: result?.success
        });
        
        // If we get here, the mutation succeeded
        // Update last saved values to prevent duplicate saves
        lastSavedValuesRef.current = {
          variableValues: { ...normalizedVariableValues },
          toggleStates: { ...currentValues.toggleStates },
          customInsertions: JSON.parse(JSON.stringify(currentValues.customInsertions)),
          internalNotes: JSON.parse(JSON.stringify(currentValues.internalNotes))
        };
        
        // Mark that we just completed a save to prevent sync effect from overwriting user edits
        // This prevents the sync effect from running immediately after cache invalidation
        justCompletedSaveRef.current = true;
        
        // Invalidate queries to ensure fresh data on next load
        await queryClient.invalidateQueries({ queryKey: ['cachedContent', effectiveLocalId] });
        await queryClient.invalidateQueries({ queryKey: ['variableValues', effectiveLocalId] });

        const totalDuration = Math.round(performance.now() - saveStartTime);
        logger.saves('[EmbedContainer] Auto-save complete', { 
          localId: effectiveLocalId,
          duration: `${totalDuration}ms`
        });

        setSaveStatus('saved');
        isSavingRef.current = false;
        
        // Clear the "just completed save" flag after a delay
        // This allows the sync effect to run again after the user has had time to continue editing
        setTimeout(() => {
          justCompletedSaveRef.current = false;
        }, 2000); // 2 second grace period
      } catch (error) {
        const totalDuration = Math.round(performance.now() - saveStartTime);
        logger.errors('[EmbedContainer] Auto-save failed:', error, {
          localId: effectiveLocalId,
          duration: `${totalDuration}ms`,
          errorMessage: error?.message,
          errorStack: error?.stack
        });
        setSaveStatus('error');
        isSavingRef.current = false;
      }
    }, 500); // 500ms debounce

    return () => {
      clearTimeout(timeoutId);
      // Reset saving flag if effect is cleaned up before mutation completes
      // This prevents the "Saving..." state from getting stuck
      isSavingRef.current = false;
    };
    // CRITICAL: Use individual watched values instead of watch() to avoid reference changes
    // Only trigger when actual form values change, not when form object reference changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variableValues, toggleStates, customInsertions, internalNotes, isDirty, isEditing, effectiveLocalId, selectedExcerptId]);

  // Check for staleness in view mode immediately after render, with jitter for performance
  // Starts as soon as content is available, jitter spreads out requests across multiple Embeds
  useEffect(() => {
    // Skip staleness check in edit mode or if missing data
    if (isEditing || !content || !selectedExcerptId || !effectiveLocalId) {
      return;
    }

    // Add small random jitter (0-500ms) to spread out checks when page has many Embeds
    // This prevents thundering herd while still starting check immediately after render
    const jitter = Math.random() * 500; // 0-500ms

    const checkStaleness = async () => {
      setIsCheckingStaleness(true); // Start checking
      try {
        // Get excerpt metadata to check contentHash
        const excerptResult = await invoke('getExcerpt', { excerptId: selectedExcerptId });
        if (!excerptResult.success || !excerptResult.data || !excerptResult.data.excerpt) {
          setIsCheckingStaleness(false);
          return;
        }

        // Get variable values to check syncedContentHash
        const varsResult = await invoke('getVariableValues', { localId: effectiveLocalId });
        if (!varsResult.success || !varsResult.data) {
          setIsCheckingStaleness(false);
          return;
        }

        const excerpt = excerptResult.data.excerpt;
        const varsData = varsResult.data;
        const sourceContentHash = excerpt.contentHash;
        const syncedContentHash = varsData.syncedContentHash;

        // Hash-based staleness detection (primary method)
        let stale = false;
        if (sourceContentHash && syncedContentHash) {
          // Compare content hashes - if different, content has actually changed
          stale = sourceContentHash !== syncedContentHash;
        } else {
          // Fallback to timestamp comparison for backward compatibility
          // (for Include instances created before hash implementation)
          const sourceUpdatedAt = excerpt.updatedAt;
          const lastSynced = varsData.lastSynced;

          if (sourceUpdatedAt && lastSynced) {
            const sourceDate = new Date(sourceUpdatedAt);
            const syncedDate = new Date(lastSynced);
            stale = sourceDate > syncedDate;
          }
        }

        setIsStale(stale);
        setSourceLastModified(excerpt.updatedAt);
        setIncludeLastSynced(varsData.lastSynced);

        // If stale, store both old and new content for enhanced diff view
        if (stale) {
          setLatestRenderedContent(excerpt.content); // New Source content
          setSyncedContent(varsData.syncedContent || null); // Old Source content from last sync

          // Load variable values and toggle states for diff view rendering
          // (We already have varsResult from staleness check, so reuse it)
          reset({
            variableValues: normalizeVariableValues(varsData.variableValues || {}),
            toggleStates: varsData.toggleStates || {},
            customInsertions: varsData.customInsertions || [],
            internalNotes: varsData.internalNotes || []
          }, { keepDefaultValues: false });
          
          // Reset last saved values ref to allow next user edit to trigger save
          lastSavedValuesRef.current = null;
        }

        setIsCheckingStaleness(false); // Check complete
      } catch (err) {
        logger.errors('[EmbedContainer] Staleness check error:', err);
        setIsCheckingStaleness(false); // Check complete (with error)
      }
    };

    // Start staleness check with jitter to spread out requests
    const timeoutId = setTimeout(() => {
      checkStaleness();
    }, jitter);

    // Cleanup timeout on unmount or dependency change
    return () => clearTimeout(timeoutId);
  }, [content, isEditing, selectedExcerptId, effectiveLocalId]);

  // ============================================================================
  // PUBLISH STATUS: Fetch publish state for Compositor + Native Injection model
  // ============================================================================
  useEffect(() => {
    // Only fetch publish status in edit mode with valid localId
    if (!isEditing || !effectiveLocalId) {
      return;
    }

    const fetchPublishStatus = async () => {
      try {
        const result = await invoke('getPublishStatus', { localId: effectiveLocalId });
        if (result.success) {
          setPublishStatus(result.data);
        }
      } catch (error) {
        logger.errors('[EmbedContainer] Error fetching publish status:', error);
      }
    };

    fetchPublishStatus();
  }, [isEditing, effectiveLocalId]);

  // Determine if content needs republishing (has changed since last publish)
  const needsRepublish = (() => {
    if (!publishStatus?.isPublished) {
      return false;
    }
    // Use isDirty from React Hook Form as a proxy for changes
    return isDirty;
  })();

  // Handler for publishing chapter to page
  const handlePublish = async () => {
    if (!effectiveLocalId || !selectedExcerptId || isPublishing) {
      return;
    }

    setIsPublishing(true);
    setPublishError(null);

    try {
      const pageId = context?.contentId || context?.extension?.content?.id;
      
      if (!pageId) {
        throw new Error('Unable to determine page ID');
      }

      const result = await invoke('publishChapter', {
        pageId: pageId,
        localId: effectiveLocalId,
        excerptId: selectedExcerptId
      });

      if (result.success) {
        setPublishStatus({
          isPublished: true,
          publishedAt: result.publishedAt,
          publishedVersion: result.pageVersion,
          chapterId: result.chapterId
        });

        logger.saves('[EmbedContainer] Successfully published chapter', {
          localId: effectiveLocalId,
          pageVersion: result.pageVersion
        });
      } else {
        throw new Error(result.error || 'Publish failed');
      }
    } catch (error) {
      logger.errors('[EmbedContainer] Publish error:', error);
      setPublishError(error.message);
    } finally {
      setIsPublishing(false);
    }
  };

  // Handler for excerpt selection from Select (must be defined before early returns)
  const handleExcerptSelection = async (selectedOption) => {
    if (!selectedOption || !effectiveLocalId) return;

    // Select component passes the entire option object
    const newExcerptId = selectedOption.value;

    // Block auto-save during excerpt transition to prevent duplicate version history
    isLoadingInitialDataRef.current = true;

    setSelectedExcerptId(newExcerptId);
    setIsRefreshing(true);

    // Save to backend storage
    const pageId = context?.contentId || context?.extension?.content?.id;

    // Use mutation to save the selection
    saveVariableValuesMutation({
      localId: effectiveLocalId,
      excerptId: newExcerptId,
      variableValues: {},
      toggleStates: {},
      customInsertions: [],
      internalNotes: []
    });

    // Track usage
    if (pageId) {
      await invoke('trackExcerptUsage', {
        excerptId: newExcerptId,
        pageId: pageId,
        localId: effectiveLocalId
      });
    }

    // Invalidate relevant caches to force refetch
    await queryClient.invalidateQueries({ queryKey: ['excerpt', newExcerptId] });
    await queryClient.invalidateQueries({ queryKey: ['variableValues', effectiveLocalId] });
  };

  // View mode with no selectedExcerptId
  if (!selectedExcerptId && !isEditing) {
    return <Text>No standard selected. Edit this macro to choose one.</Text>;
  }
  
  // Note: We no longer have an early return for edit mode with no selectedExcerptId
  // Instead, we always render EmbedEditMode when isEditing is true, which handles:
  // - Shows Select dropdown + Textfield fallback
  // This ensures editing always gets the full EmbedEditMode UI

  // Show error message if excerpt failed to load
  if (excerptError && selectedExcerptId) {
    return (
      <SectionMessage
        title="Failed to Load Blueprint Standard"
        appearance="error"
      >
        <Text>
          Unable to load the Blueprint Standard content. This may happen if:
        </Text>
        <Text>
          • The Blueprint Standard was deleted
        </Text>
        <Text>
          • There was an error accessing storage
        </Text>
        <Text>
          • The data is corrupted
        </Text>
        <Text>
          <Strong>To fix this:</Strong>
        </Text>
        <Text>
          1. Click Edit on this Embed macro
        </Text>
        <Text>
          2. Select a different Blueprint Standard from the dropdown, or
        </Text>
        <Text>
          3. Delete this Embed and add a new one
        </Text>
        {excerptError.message && (
          <Text>
            <Em>Error details: {excerptError.message}</Em>
          </Text>
        )}
      </SectionMessage>
    );
  }

  // NOTE: Automatic recovery UI removed - replaced with user-controlled DeactivatedEmbedsSelector
  // The isRecovering state is kept for backwards compatibility but is no longer used

  // Show spinner while loading in view mode
  if (!content && !isEditing) {
    return <Spinner />;
  }

  // Helper function to get preview content with current variable and toggle values
  const getPreviewContent = () => {
    if (!excerpt) return content;

    let previewContent = excerpt.content;

    // Handle null/undefined content
    if (!previewContent) {
      return content || '';
    }

    const isAdf = previewContent && typeof previewContent === 'object' && previewContent.type === 'doc';

    if (isAdf) {
      // Fix for GitHub issue #2 - Free Write paragraph insertion position with enabled toggles
      // FIX: Insert custom paragraphs BEFORE toggle filtering so they can be placed inside toggle blocks.
      // The insertion logic needs to work on the original structure (with toggle markers) so it knows
      // where toggle boundaries are. Then toggle filtering will preserve the insertion if the toggle is enabled.
      // Insert custom paragraphs and internal notes into original content (before toggle filtering)
      previewContent = substituteVariablesInAdf(previewContent, variableValues);
      previewContent = insertCustomParagraphsInAdf(previewContent, customInsertions);
      previewContent = insertInternalNotesInAdf(previewContent, internalNotes);
      // Then filter toggles (this will preserve insertions inside enabled toggles)
      previewContent = filterContentByToggles(previewContent, toggleStates);
      return cleanAdfForRenderer(previewContent);
    } else {
      // For plain text, filter toggles first
      const toggleRegex = /\{\{toggle:([^}]+)\}\}([\s\S]*?)\{\{\/toggle:\1\}\}/g;
      previewContent = previewContent.replace(toggleRegex, (match, toggleName, content) => {
        const trimmedName = toggleName.trim();
        return toggleStates?.[trimmedName] === true ? content : '';
      });

      // Strip any remaining markers (in case regex didn't match full pattern)
      previewContent = previewContent.replace(/\{\{toggle:[^}]+\}\}/g, '');
      previewContent = previewContent.replace(/\{\{\/toggle:[^}]+\}\}/g, '');

      // Then substitute variables
      excerpt.variables?.forEach(variable => {
        const value = variableValues[variable.name] || `{{${variable.name}}}`;
        const regex = new RegExp(`\\{\\{${variable.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`, 'g');
        previewContent = previewContent.replace(regex, value);
      });
      return previewContent;
    }
  };

  // Get raw preview content for Toggles and Free Write tabs (keeps toggle markers visible)
  const getRawPreviewContent = () => {
    if (!excerpt) return content;

    let previewContent = excerpt.content;

    // Handle null/undefined content
    if (!previewContent) {
      return content || '';
    }

    const isAdf = previewContent && typeof previewContent === 'object' && previewContent.type === 'doc';

    if (isAdf) {
      // Fix for GitHub issue #2 - Free Write paragraph insertion position with enabled toggles
      // FIX: Insert custom paragraphs BEFORE toggle filtering (same as getPreviewContent fix above)
      // Insert custom paragraphs and internal notes into original content (before toggle filtering)
      previewContent = substituteVariablesInAdf(previewContent, variableValues);
      previewContent = insertCustomParagraphsInAdf(previewContent, customInsertions);
      previewContent = insertInternalNotesInAdf(previewContent, internalNotes);
      // Then filter toggles (removes disabled content) but DON'T strip markers
      previewContent = filterContentByToggles(previewContent, toggleStates);
      return cleanAdfForRenderer(previewContent);
    } else {
      // For plain text
      const toggleRegex = /\{\{toggle:([^}]+)\}\}([\s\S]*?)\{\{\/toggle:\1\}\}/g;
      previewContent = previewContent.replace(toggleRegex, (match, toggleName, content) => {
        const trimmedName = toggleName.trim();
        // Keep full match (including markers) if enabled, remove everything if disabled
        return toggleStates?.[trimmedName] === true ? match : '';
      });

      // Then substitute variables
      excerpt.variables?.forEach(variable => {
        const value = variableValues[variable.name] || `{{${variable.name}}}`;
        const regex = new RegExp(`\\{\\{${variable.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`, 'g');
        previewContent = previewContent.replace(regex, value);
      });
      return previewContent;
    }
  };

  // Handler for selecting a deactivated Embed to copy data from
  const handleDeactivatedEmbedSelect = async (sourceLocalId) => {
    if (!sourceLocalId || !effectiveLocalId || isRestoringEmbed) {
      return;
    }

    setIsRestoringEmbed(true);

    try {
      // Copy data from deactivated Embed
      const copyResult = await invoke('copyDeactivatedEmbedData', {
        sourceLocalId: sourceLocalId,
        targetLocalId: effectiveLocalId
      });

      if (copyResult.success) {
        // Get the copied data directly to update component state immediately
        const varsResult = await invoke('getVariableValues', { localId: effectiveLocalId });
        
        if (varsResult.success && varsResult.data) {
          const varsData = varsResult.data;
          // Update component state directly with copied data
          // This ensures UI updates immediately without waiting for React Query
          if (varsData.excerptId) {
            setSelectedExcerptId(varsData.excerptId);
          }
          // Update form with copied data
          if (varsData.variableValues || varsData.toggleStates || varsData.customInsertions || varsData.internalNotes) {
            reset({
              variableValues: normalizeVariableValues(varsData.variableValues || {}),
              toggleStates: varsData.toggleStates || {},
              customInsertions: varsData.customInsertions || [],
              internalNotes: varsData.internalNotes || []
            }, { keepDefaultValues: false });
            
            // Reset last saved values ref to allow next user edit to trigger save
            lastSavedValuesRef.current = null;
          }

          // Reset the sync guard to allow future syncs if needed
          hasLoadedInitialDataRef.current = false;
        }

        // Invalidate React Query to keep cache in sync
        await queryClient.invalidateQueries({ queryKey: ['variableValues', effectiveLocalId] });
        await queryClient.invalidateQueries({ queryKey: ['cachedContent', effectiveLocalId] });

        // Hide selector only after successful restore
        setShowDeactivatedSelector(false);
        setDeactivatedEmbeds([]);

        logger.saves('[EmbedContainer] Successfully copied data from deactivated Embed', {
          sourceLocalId,
          targetLocalId: effectiveLocalId
        });
      } else {
        logger.errors('[EmbedContainer] Failed to copy deactivated Embed data:', copyResult.error);
        alert('Failed to restore data from deactivated Embed. Please try again.');
      }
    } catch (error) {
      logger.errors('[EmbedContainer] Error copying deactivated Embed data:', error);
      alert('Error restoring data from deactivated Embed. Please try again.');
    } finally {
      setIsRestoringEmbed(false);
    }
  };

  // Handler for dismissing the deactivated Embeds selector
  const handleDeactivatedEmbedDismiss = () => {
    setShowDeactivatedSelector(false);
    // Keep deactivatedEmbeds in state in case user wants to open it again
  };

  // Handler for updating to latest version (defined before edit mode rendering)
  const handleUpdateToLatest = async () => {
    if (!selectedExcerptId || !effectiveLocalId) {
      return;
    }

    setIsUpdating(true);

    try {
      // Fetch fresh excerpt
      const excerptResult = await invoke('getExcerpt', { excerptId: selectedExcerptId });
      if (!excerptResult.success || !excerptResult.data || !excerptResult.data.excerpt) {
        alert('Failed to fetch latest Blueprint Standard content');
        return;
      }

      // Update the excerpt state so the new data (including documentationLinks) is available
      setExcerptForViewMode(excerptResult.data.excerpt);

      // Get current variable values, toggle states, custom insertions, and internal notes
      const varsResult = await invoke('getVariableValues', { localId: effectiveLocalId });
      const varsData = varsResult.success && varsResult.data ? varsResult.data : {};
      const currentVariableValues = varsData.variableValues || {};
      const currentToggleStates = varsData.toggleStates || {};
      const currentCustomInsertions = varsData.customInsertions || [];
      const currentInternalNotes = varsData.internalNotes || [];

      // Generate fresh content with current settings
      let freshContent = excerptResult.excerpt.content;
      const isAdf = freshContent && typeof freshContent === 'object' && freshContent.type === 'doc';

      if (isAdf) {
        freshContent = filterContentByToggles(freshContent, currentToggleStates);
        freshContent = substituteVariablesInAdf(freshContent, currentVariableValues);
        freshContent = insertCustomParagraphsInAdf(freshContent, currentCustomInsertions);
        freshContent = insertInternalNotesInAdf(freshContent, currentInternalNotes);
      } else {
        // For plain text, filter toggles first
        const toggleRegex = /\{\{toggle:([^}]+)\}\}([\s\S]*?)\{\{\/toggle:\1\}\}/g;
        freshContent = freshContent.replace(toggleRegex, (match, toggleName, content) => {
          const trimmedName = toggleName.trim();
          return currentToggleStates?.[trimmedName] === true ? content : '';
        });

        // Strip any remaining markers
        freshContent = freshContent.replace(/\{\{toggle:[^}]+\}\}/g, '');
        freshContent = freshContent.replace(/\{\{\/toggle:[^}]+\}\}/g, '');

        // Substitute variables
        const escapeRegex = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (excerptResult.excerpt.variables) {
          excerptResult.excerpt.variables.forEach(variable => {
            const value = currentVariableValues[variable.name] || `{{${variable.name}}}`;
            const regex = new RegExp(`\\{\\{${escapeRegex(variable.name)}\\}\\}`, 'g');
            freshContent = freshContent.replace(regex, value);
          });
        }
      }

      // Update the displayed content
      setContent(freshContent);

      // Cache the updated content with new syncedContentHash and syncedContent
      await invoke('saveCachedContent', {
        localId: effectiveLocalId,
        renderedContent: freshContent,
        syncedContentHash: excerptResult.excerpt.contentHash,
        syncedContent: excerptResult.excerpt.content
      });

      // Clear staleness flags
      setIsStale(false);

      alert('Successfully updated! Click the Edit button to customize variables, toggles, and other settings.');
    } catch (err) {
      logger.errors('[EmbedContainer] Error updating to latest:', err);
      alert('Error updating to latest version');
    } finally {
      setIsUpdating(false);
    }
  };

  // ============================================================================
  // EDIT MODE: Show variable inputs and preview
  // ============================================================================
  // Show edit mode when:
  // 1. Confluence's page is in edit mode (isEditing - backward compatibility), OR
  // 2. User clicked the Embed's Edit button (isEditingEmbed - Locked Page Model)
  const showEditMode = isEditing || isEditingEmbed;
  
  if (showEditMode) {
    const pageId = context?.contentId || context?.extension?.content?.id;
    
    return (
      <Fragment>
        {/* Loading indicator while checking for deactivated Embeds */}
        {isLoadingDeactivated && (
          <Box xcss={xcss({ padding: 'space.200', marginBottom: 'space.200' })}>
            <Stack space="space.100" alignInline="center">
              <Inline space="space.100" alignBlock="center">
                <Spinner size="small" />
                <Text size="xsmall" color="color.text.subtle">
                  Checking for deactivated Embed data...
                </Text>
              </Inline>
            </Stack>
          </Box>
        )}

        {/* Deactivated Embeds Selector - shown when Embed has no data */}
        {showDeactivatedSelector && deactivatedEmbeds.length > 0 && (
          <DeactivatedEmbedsSelector
            localId={effectiveLocalId}
            pageId={pageId}
            deactivatedEmbeds={deactivatedEmbeds}
            onSelect={handleDeactivatedEmbedSelect}
            onDismiss={handleDeactivatedEmbedDismiss}
            isRestoring={isRestoringEmbed}
          />
        )}
        <EmbedEditMode
          excerpt={excerpt}
          availableExcerpts={availableExcerpts}
          isLoadingExcerpts={isLoadingExcerpts}
          selectedExcerptId={selectedExcerptId}
          handleExcerptSelection={handleExcerptSelection}
          context={context}
          saveStatus={saveStatus}
          selectedTabIndex={selectedTabIndex}
          setSelectedTabIndex={setSelectedTabIndex}
          control={control}
          setValue={setValue}
          insertionType={insertionType}
          setInsertionType={setInsertionType}
          selectedPosition={selectedPosition}
          setSelectedPosition={setSelectedPosition}
          customText={customText}
          setCustomText={setCustomText}
          getPreviewContent={getPreviewContent}
          getRawPreviewContent={getRawPreviewContent}
          // Publish props (Compositor + Native Injection)
          publishStatus={publishStatus}
          isPublishing={isPublishing}
          onPublish={handlePublish}
          needsRepublish={needsRepublish}
          // Close handler for Locked Page Model (exit edit mode without saving)
          onClose={isEditingEmbed ? () => setIsEditingEmbed(false) : null}
        />
      </Fragment>
    );
  }

  // ============================================================================
  // VIEW MODE: Show content with update notification if stale
  // ============================================================================
  return (
    <EmbedViewMode
      content={content}
      isStale={isStale}
      isCheckingStaleness={isCheckingStaleness}
      showDiffView={showDiffView}
      setShowDiffView={setShowDiffView}
      handleUpdateToLatest={handleUpdateToLatest}
      isUpdating={isUpdating}
      syncedContent={syncedContent}
      latestRenderedContent={latestRenderedContent}
      variableValues={variableValues}
      toggleStates={toggleStates}
      excerpt={excerpt}
      internalNotes={internalNotes}
      redlineStatus={variableValuesData?.redlineStatus}
      approvedBy={variableValuesData?.approvedBy}
      approvedAt={variableValuesData?.approvedAt}
      lastChangedBy={variableValuesData?.lastChangedBy}
      // Locked Page Model: Edit button handler
      onEditClick={() => setIsEditingEmbed(true)}
    />
  );
};

ForgeReconciler.render(
  <QueryClientProvider client={queryClient}>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
    <ReactQueryDevtools initialIsOpen={false} />
  </QueryClientProvider>
);
