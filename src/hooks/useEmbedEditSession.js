/**
 * useEmbedEditSession Hook
 * 
 * Encapsulates all edit session logic for the Embed component.
 * Implements the Form-Centric Architecture where:
 * - React Hook Form is the single source of truth during editing
 * - localStorage provides crash recovery (saves on blur)
 * - Forge storage is only written on explicit user actions (Exit/Publish)
 * - React Query is used only for initial data load
 * 
 * Key behaviors:
 * - Load initial data from Forge storage via React Query (one-time)
 * - Check for localStorage draft recovery on mount
 * - Save to localStorage on blur (async, non-blocking)
 * - Preserve matching variable values when switching Sources
 * - Save to Forge storage on Exit or Publish
 * - Clear localStorage on Publish or Reset (not Exit)
 * 
 * @module hooks/useEmbedEditSession
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { invoke } from '@forge/bridge';
import { useQueryClient } from '@tanstack/react-query';
import { normalizeVariableValues } from '../schemas/form-schemas';
import { draftStorage } from '../utils/draft-storage';
import { useVariableValues, useExcerptData, useAvailableExcerpts } from './embed-hooks';
import { logger } from '../utils/logger';

/**
 * Default form values for a new/empty edit session
 */
const DEFAULT_FORM_VALUES = {
  variableValues: {},
  toggleStates: {},
  customInsertions: [],
  internalNotes: [],
  customHeading: '' // Empty means use source name as default
};

/**
 * Normalize stored data into form-compatible format
 * @param {Object} data - Data from storage or draft
 * @returns {Object} Normalized form values
 */
function normalizeFormData(data) {
  if (!data) return DEFAULT_FORM_VALUES;
  
  return {
    variableValues: normalizeVariableValues(data.variableValues || {}),
    toggleStates: data.toggleStates || {},
    customInsertions: Array.isArray(data.customInsertions) ? data.customInsertions : [],
    internalNotes: Array.isArray(data.internalNotes) ? data.internalNotes : [],
    customHeading: data.customHeading || ''
  };
}

/**
 * Custom hook for managing Embed edit sessions
 * 
 * @param {string} localId - The Embed's local ID
 * @param {Object} options - Configuration options
 * @param {Function} options.onPublishChapter - Async callback to publish chapter (receives { excerptId, variableValues, toggleStates, customInsertions, internalNotes, customHeading })
 * @param {Object} options.context - Forge product context
 * @returns {Object} Edit session state and handlers
 */
export const useEmbedEditSession = (localId, options = {}) => {
  const { onPublishChapter, context } = options;
  const queryClient = useQueryClient();
  
  // ============================================================================
  // STATE
  // ============================================================================
  
  // Selected excerpt/source ID
  const [excerptId, setExcerptId] = useState(null);
  
  // Original excerpt ID (for Reset functionality)
  const [originalExcerptId, setOriginalExcerptId] = useState(null);
  
  // Form key - changes on reset to force input re-mounts
  const [formKey, setFormKey] = useState(0);
  
  // Initialization state
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Draft recovery state
  const [hasDraftRecovery, setHasDraftRecovery] = useState(false);
  const [draftInfo, setDraftInfo] = useState(null);
  
  // Operation states
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishProgress, setPublishProgress] = useState(0); // 0-1 for progress bar
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved', 'saving', 'error'
  
  // Publish status
  const [publishStatus, setPublishStatus] = useState(null);
  
  // Prevent double-initialization
  const initRef = useRef(false);
  
  // ============================================================================
  // REACT HOOK FORM
  // ============================================================================
  
  const form = useForm({
    defaultValues: DEFAULT_FORM_VALUES,
    mode: 'onChange'
  });
  
  const { control, reset, getValues, setValue, formState: { isDirty } } = form;
  
  // Watch form values for preview rendering
  const variableValues = useWatch({ control, name: 'variableValues' }) || {};
  const toggleStates = useWatch({ control, name: 'toggleStates' }) || {};
  const customInsertions = useWatch({ control, name: 'customInsertions' }) || [];
  const internalNotes = useWatch({ control, name: 'internalNotes' }) || [];
  const customHeading = useWatch({ control, name: 'customHeading' }) || '';
  
  // ============================================================================
  // REACT QUERY - Initial Data Load (One-Time)
  // ============================================================================
  
  // Load stored data from Forge storage - only while not initialized
  const { 
    data: storedData, 
    isLoading: isLoadingStoredData,
    error: storedDataError 
  } = useVariableValues(localId, !isInitialized);
  
  // Load current excerpt data
  const {
    data: excerpt,
    isLoading: isLoadingExcerpt,
    error: excerptError,
    refetch: refetchExcerpt
  } = useExcerptData(excerptId, !!excerptId);
  
  // Load available excerpts for dropdown
  const {
    data: availableExcerpts = [],
    isLoading: isLoadingExcerpts,
    error: excerptsError
  } = useAvailableExcerpts(true);
  
  // ============================================================================
  // INITIALIZATION EFFECT
  // ============================================================================
  
  useEffect(() => {
    // Skip if already initialized or no localId
    if (initRef.current || !localId) return;
    
    // Wait for stored data to load
    if (isLoadingStoredData) return;
    
    initRef.current = true;
    
    // Check for localStorage draft first
    const draft = draftStorage.load(localId);
    const storedLastSynced = storedData?.lastSynced ? new Date(storedData.lastSynced).getTime() : 0;
    
    if (draft && draft.savedAt > storedLastSynced) {
      // Draft is newer than stored data - offer recovery
      setHasDraftRecovery(true);
      setDraftInfo({
        savedAt: draft.savedAt,
        excerptId: draft.excerptId
      });
      logger.saves('[useEmbedEditSession] Draft found, offering recovery', {
        localId,
        draftSavedAt: new Date(draft.savedAt).toISOString(),
        storedLastSynced: storedLastSynced ? new Date(storedLastSynced).toISOString() : 'never'
      });
    }
    
    // Initialize form with stored data (not draft - let user decide on recovery)
    if (storedData) {
      reset(normalizeFormData(storedData));
      setExcerptId(storedData.excerptId || null);
      setOriginalExcerptId(storedData.excerptId || null);
      
      // Set publish status if available
      if (storedData.publishedAt) {
        setPublishStatus({
          isPublished: true,
          publishedAt: storedData.publishedAt,
          publishedVersion: storedData.publishedVersion,
          chapterId: storedData.chapterId
        });
      }
      
      logger.saves('[useEmbedEditSession] Initialized from stored data', {
        localId,
        excerptId: storedData.excerptId,
        hasVariables: Object.keys(storedData.variableValues || {}).length > 0
      });
    }
    
    setIsInitialized(true);
  }, [localId, storedData, isLoadingStoredData, reset]);
  
  // Clean up stale drafts on mount
  useEffect(() => {
    draftStorage.clearStale();
  }, []);
  
  // ============================================================================
  // BLUR HANDLER - Save to localStorage
  // ============================================================================
  
  /**
   * Save current form state to localStorage on blur
   * Shows draft indicator briefly
   */
  const handleBlur = useCallback(() => {
    if (!localId || !isInitialized) {
      logger.saves('[useEmbedEditSession] handleBlur skipped', { localId, isInitialized });
      return;
    }
    
    // Show saving indicator
    setSaveStatus('saving');
    logger.saves('[useEmbedEditSession] handleBlur - set status to saving', { localId });
    
    // Use setTimeout to ensure state update completes before saving
    setTimeout(() => {
      try {
        const values = getValues();
        logger.saves('[useEmbedEditSession] handleBlur - got values', { 
          localId, 
          customHeading: values.customHeading,
          variableKeys: Object.keys(values.variableValues || {})
        });
        
        draftStorage.save(localId, {
          excerptId,
          ...values
        });
        logger.saves('[useEmbedEditSession] Saved draft on blur', { localId });
        
        // Show saved indicator
        setSaveStatus('saved');
        logger.saves('[useEmbedEditSession] handleBlur - set status to saved', { localId });
      } catch (error) {
        logger.errors('[useEmbedEditSession] Draft save failed:', error);
        setSaveStatus('saved'); // Still show saved to not leave user hanging
      }
    }, 50); // Small delay to ensure form state is updated
  }, [localId, excerptId, getValues, isInitialized]);
  
  // ============================================================================
  // SOURCE SWITCHING
  // ============================================================================
  
  /**
   * Handle Source selection change
   * Preserves matching variable values between old and new Sources
   * 
   * @param {Object} selectedOption - Select component option { value, label }
   */
  const handleSourceChange = useCallback(async (selectedOption) => {
    if (!selectedOption || !localId) return;
    
    const newExcerptId = selectedOption.value;
    const oldExcerptId = excerptId;
    
    // If same source, do nothing
    if (newExcerptId === oldExcerptId) return;
    
    setSaveStatus('saving');
    
    try {
      // Get current form values before switching
      const currentValues = getValues();
      const currentVariableValues = currentValues.variableValues || {};
      
      // Fetch new excerpt to get its variable definitions
      const newExcerptResult = await invoke('getExcerpt', { excerptId: newExcerptId });
      const newExcerpt = newExcerptResult.success && newExcerptResult.data?.excerpt;
      
      if (!newExcerpt) {
        throw new Error('Failed to load new Source');
      }
      
      // Preserve variable values that match between old and new Sources
      const preservedVariableValues = {};
      
      if (newExcerpt.variables && oldExcerptId) {
        // Get old excerpt to compare variable names
        const oldExcerptResult = await invoke('getExcerpt', { excerptId: oldExcerptId });
        const oldExcerpt = oldExcerptResult.success && oldExcerptResult.data?.excerpt;
        
        if (oldExcerpt?.variables) {
          const oldVariableNames = new Set(oldExcerpt.variables.map(v => v.name));
          
          // Preserve values for variables that exist in both Sources
          newExcerpt.variables.forEach(variable => {
            if (oldVariableNames.has(variable.name) && 
                currentVariableValues[variable.name] !== undefined && 
                currentVariableValues[variable.name] !== '') {
              preservedVariableValues[variable.name] = currentVariableValues[variable.name];
            }
          });
        }
      }
      
      // Reset form with preserved values (other values reset to empty)
      reset({
        variableValues: normalizeVariableValues(preservedVariableValues),
        toggleStates: {}, // Reset toggles - they may be different per Source
        customInsertions: currentValues.customInsertions, // Keep custom insertions
        internalNotes: currentValues.internalNotes // Keep internal notes
      });
      
      // Update excerpt ID
      setExcerptId(newExcerptId);
      
      // If this is the first source selection (no original yet), set it as the original
      // This allows Reset to work even before the first publish
      if (!originalExcerptId) {
        setOriginalExcerptId(newExcerptId);
      }
      
      // Save to localStorage immediately (draft)
      draftStorage.save(localId, {
        excerptId: newExcerptId,
        variableValues: preservedVariableValues,
        toggleStates: {},
        customInsertions: currentValues.customInsertions,
        internalNotes: currentValues.internalNotes
      });
      
      // Track usage
      const pageId = context?.contentId || context?.extension?.content?.id;
      if (pageId) {
        await invoke('trackExcerptUsage', {
          excerptId: newExcerptId,
          pageId,
          localId
        });
      }
      
      logger.saves('[useEmbedEditSession] Source switched', {
        localId,
        from: oldExcerptId,
        to: newExcerptId,
        preservedVariables: Object.keys(preservedVariableValues)
      });
      
      setSaveStatus('saved');
    } catch (error) {
      logger.errors('[useEmbedEditSession] Source switch failed:', error);
      setSaveStatus('error');
    }
  }, [localId, excerptId, originalExcerptId, getValues, reset, context]);
  
  // ============================================================================
  // SAVE AND EXIT
  // ============================================================================
  
  /**
   * Save current state to Forge storage and exit edit mode
   * localStorage is kept as backup until next Publish
   * 
   * @returns {Promise<boolean>} Success status
   */
  const saveAndExit = useCallback(async () => {
    if (!localId || !excerptId) return false;
    
    setIsSaving(true);
    setSaveStatus('saving');
    
    try {
      const values = getValues();
      
      await invoke('saveVariableValues', {
        localId,
        excerptId,
        variableValues: normalizeVariableValues(values.variableValues),
        toggleStates: values.toggleStates,
        customInsertions: values.customInsertions,
        internalNotes: values.internalNotes,
        customHeading: values.customHeading || ''
      });
      
      // Don't clear localStorage - it's backup until next Publish
      
      // Invalidate React Query cache for next edit session
      await queryClient.invalidateQueries({ queryKey: ['variableValues', localId] });
      
      logger.saves('[useEmbedEditSession] Saved and exiting', { localId });
      
      setSaveStatus('saved');
      setIsSaving(false);
      return true;
    } catch (error) {
      logger.errors('[useEmbedEditSession] Save failed:', error);
      setSaveStatus('error');
      setIsSaving(false);
      return false;
    }
  }, [localId, excerptId, getValues, queryClient]);
  
  // ============================================================================
  // SAVE AND PUBLISH
  // ============================================================================
  
  /**
   * Save current state to Forge storage, publish chapter, and clear localStorage
   * 
   * @param {string} customHeading - Optional custom heading for the chapter
   * @returns {Promise<Object|null>} Publish result or null on failure
   */
  const saveAndPublish = useCallback(async (customHeading) => {
    if (!localId || !excerptId || !onPublishChapter) return null;
    
    setIsPublishing(true);
    setPublishProgress(0.25); // 25% - Starting
    setSaveStatus('saving');
    
    try {
      // Small delay to ensure any pending form updates are committed
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const values = getValues();
      // Always use form value for customHeading - it's the source of truth
      // If empty/null, fallback to excerpt name (not "Untitled Chapter")
      const headingValue = (values.customHeading && values.customHeading.trim()) 
        ? values.customHeading 
        : (excerpt?.name || customHeading || '');
      
      const normalizedValues = {
        variableValues: normalizeVariableValues(values.variableValues),
        toggleStates: values.toggleStates,
        customInsertions: values.customInsertions,
        internalNotes: values.internalNotes,
        customHeading: headingValue
      };
      
      // Save to Forge storage first
      setPublishProgress(0.75); // 75% - After saving to Forge storage
      await invoke('saveVariableValues', {
        localId,
        excerptId,
        ...normalizedValues
      });
      
      // Then publish chapter (this is the longest operation)
      setPublishProgress(0.9); // 90% - Starting publish operation
      const result = await onPublishChapter({
        excerptId,
        ...normalizedValues
      });
      
      // 100% happens immediately after, so user sees "Starting publish operation" as last state
      
      if (result?.success) {
        // Clear localStorage - published content is now committed
        draftStorage.clear(localId);
        
        // Update publish status
        setPublishStatus({
          isPublished: true,
          publishedAt: result.publishedAt,
          publishedVersion: result.pageVersion,
          chapterId: result.chapterId
        });
        
        // Update original excerpt ID (for Reset)
        setOriginalExcerptId(excerptId);
        
        // Invalidate React Query cache
        await queryClient.invalidateQueries({ queryKey: ['variableValues', localId] });
        await queryClient.invalidateQueries({ queryKey: ['cachedContent', localId] });
        
        logger.saves('[useEmbedEditSession] Published successfully', {
          localId,
          pageVersion: result.pageVersion
        });
      }
      
      setPublishProgress(1.0); // 100% - Complete
      setSaveStatus('saved');
      setIsPublishing(false);
      // Reset progress after a brief delay to show completion
      setTimeout(() => setPublishProgress(0), 300);
      return result;
    } catch (error) {
      logger.errors('[useEmbedEditSession] Publish failed:', error);
      setSaveStatus('error');
      setIsPublishing(false);
      setPublishProgress(0);
      return null;
    }
  }, [localId, excerptId, getValues, excerpt, onPublishChapter, queryClient]);
  
  // ============================================================================
  // RESET TO ORIGINAL
  // ============================================================================
  
  /**
   * Reset form to original state from Forge storage
   * Clears localStorage draft
   * 
   * @returns {Promise<boolean>} Success status
   */
  const resetToOriginal = useCallback(async () => {
    if (!localId) return false;
    
    // Show draft saving indicator
    setSaveStatus('saving');
    
    try {
      // Reload from Forge storage
      const result = await invoke('getVariableValues', { localId });
      
      if (result.success && result.data) {
        const normalizedData = normalizeFormData(result.data);
        
        reset(normalizedData);
        
        // Increment form key to force input re-mounts
        setFormKey(prev => prev + 1);
        
        setExcerptId(result.data.excerptId || originalExcerptId);
        
        // Clear localStorage draft
        draftStorage.clear(localId);
        
        // Clear draft recovery state
        setHasDraftRecovery(false);
        setDraftInfo(null);
        
        logger.saves('[useEmbedEditSession] Reset to original', { localId });
        
        // Show draft saved indicator
        setSaveStatus('saved');
        return true;
      }
      
      setSaveStatus('saved');
      return false;
    } catch (error) {
      logger.errors('[useEmbedEditSession] Reset failed:', error);
      setSaveStatus('error');
      return false;
    }
  }, [localId, originalExcerptId, reset]);
  
  // ============================================================================
  // DRAFT RECOVERY
  // ============================================================================
  
  /**
   * Recover form state from localStorage draft
   */
  const recoverDraft = useCallback(() => {
    if (!localId) return;
    
    const draft = draftStorage.load(localId);
    if (draft) {
      reset(normalizeFormData(draft));
      setExcerptId(draft.excerptId || excerptId);
      
      logger.saves('[useEmbedEditSession] Draft recovered', { localId });
    }
    
    setHasDraftRecovery(false);
    setDraftInfo(null);
  }, [localId, excerptId, reset]);
  
  /**
   * Dismiss draft recovery without restoring
   */
  const dismissDraftRecovery = useCallback(() => {
    setHasDraftRecovery(false);
    setDraftInfo(null);
    
    // Optionally clear the stale draft
    if (localId) {
      draftStorage.clear(localId);
    }
    
    logger.saves('[useEmbedEditSession] Draft dismissed', { localId });
  }, [localId]);
  
  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================
  
  // Check if reset is available (source changed OR form is dirty)
  const canReset = originalExcerptId && (excerptId !== originalExcerptId || isDirty);
  
  // Check if publish is needed (has changes since last publish)
  const needsRepublish = isDirty || (publishStatus?.isPublished && excerptId !== originalExcerptId);
  
  // Combined loading state
  const isLoading = isLoadingStoredData || (isLoadingExcerpt && !!excerptId);
  
  // ============================================================================
  // RETURN
  // ============================================================================
  
  return {
    // Form
    form,
    control,
    getValues,
    setValue,
    reset,
    isDirty,
    
    // Watched values (for preview and UI)
    variableValues,
    toggleStates,
    customInsertions,
    internalNotes,
    customHeading,
    
    // Excerpt/Source
    excerptId,
    setExcerptId,
    originalExcerptId,
    excerpt,
    availableExcerpts,
    handleSourceChange,
    
    // State
    isInitialized,
    isLoading,
    isLoadingExcerpt,
    isLoadingExcerpts,
    isSaving,
    isPublishing,
    publishProgress, // 0-1 for progress bar
    saveStatus,
    formKey, // Changes on reset to force input re-mounts
    
    // Publish status
    publishStatus,
    setPublishStatus,
    needsRepublish,
    
    // Draft recovery
    hasDraftRecovery,
    draftInfo,
    recoverDraft,
    dismissDraftRecovery,
    
    // Actions
    handleBlur,
    saveAndExit,
    saveAndPublish,
    resetToOriginal,
    canReset,
    
    // Errors
    storedDataError,
    excerptError,
    excerptsError,
    
    // Refetch
    refetchExcerpt
  };
};

export default useEmbedEditSession;
