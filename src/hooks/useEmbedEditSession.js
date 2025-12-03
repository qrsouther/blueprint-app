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
  customHeading: '', // Empty means use source name as default
  complianceLevel: null, // null means auto-select based on Source's bespoke property
  isFreeformMode: false, // Flag indicating freeform mode is active (for non-standard/tbd/na - bypasses Source structure)
  freeformContent: '', // Raw text content user writes in freeform mode
  smartCasingEnabled: true // Smart case matching - auto-capitalize at sentence starts (can be toggled off)
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
    customHeading: data.customHeading || '',
    complianceLevel: data.complianceLevel || null,
    isFreeformMode: data.isFreeformMode || false,
    freeformContent: data.freeformContent || '',
    // Default to true if not set (backwards compatibility - existing Embeds get smart casing)
    smartCasingEnabled: data.smartCasingEnabled !== false
  };
}

/**
 * Extract client name from page title if it matches "Blueprint: Client Name" pattern
 * @param {string} pageTitle - The page title
 * @returns {string|null} The extracted client name or null if pattern doesn't match
 */
function inferClientFromPageTitle(pageTitle) {
  if (!pageTitle || typeof pageTitle !== 'string') {
    return null;
  }
  
  // Match "Blueprint: Client Name" pattern (case-insensitive)
  // Handles variations like "Blueprint: Portland Pickles" or "blueprint: Client Name"
  const match = pageTitle.match(/^Blueprint:\s*(.+)$/i);
  if (match && match[1]) {
    return match[1].trim();
  }
  
  return null;
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
  
  // Track if we've attempted Client variable inference (to avoid doing it multiple times)
  const clientInferenceAttemptedRef = useRef(false);
  
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
  const complianceLevel = useWatch({ control, name: 'complianceLevel' });
  const isFreeformMode = useWatch({ control, name: 'isFreeformMode' }) || false;
  const freeformContent = useWatch({ control, name: 'freeformContent' }) || '';
  const smartCasingEnabled = useWatch({ control, name: 'smartCasingEnabled' }) !== false; // Default true
  
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
        hasVariables: Object.keys(storedData.variableValues || {}).length > 0,
        variableValues: storedData.variableValues
      });
      
      // If we have an excerptId but empty Client variable, prepare for inference
      // The inference effect will handle it once the excerpt loads
      if (storedData.excerptId && storedData.variableValues) {
        const clientVarName = Object.keys(storedData.variableValues).find(
          key => key.toLowerCase() === 'client'
        );
        if (clientVarName) {
          const clientValue = storedData.variableValues[clientVarName] || '';
          if (!clientValue || clientValue.trim() === '') {
            // Client variable is empty, inference effect will handle it
            console.log('[useEmbedEditSession] Detected empty Client variable, inference will run when excerpt loads', {
              localId,
              excerptId: storedData.excerptId,
              clientVarName
            });
          }
        }
      }
    }
    
    setIsInitialized(true);
  }, [localId, storedData, isLoadingStoredData, reset]);
  
  // Clean up stale drafts on mount
  useEffect(() => {
    draftStorage.clearStale();
  }, []);
  
  // ============================================================================
  // CLIENT VARIABLE INFERENCE FROM PAGE TITLE
  // ============================================================================
  
  /**
   * Infer Client variable value from page title when:
   * - Hook is initialized
   * - Excerpt is loaded
   * - Excerpt has a "Client" variable (case-insensitive)
   * - Client variable is empty
   * - Page title matches "Blueprint: Client Name" pattern
   */
  useEffect(() => {
    // Debug logging
    console.log('[useEmbedEditSession] Inference effect triggered', {
      isInitialized,
      hasExcerpt: !!excerpt,
      excerptId,
      hasVariables: excerpt?.variables?.length > 0,
      attempted: clientInferenceAttemptedRef.current,
      localId,
      isEditing: context?.extension?.isEditing
    });
    
    // Only run if:
    // 1. We're initialized
    // 2. We have an excerpt loaded
    // 3. We're in edit mode (inference should only happen when actively editing)
    //    - Check both context.isEditing (Confluence edit mode) and if excerptId is set (user has selected a source)
    // 4. We haven't already attempted inference for this session
    const isEditing = context?.extension?.isEditing;
    const hasSelectedSource = !!excerptId; // Only run if user has selected a source (indicates active editing)
    
    if (!isInitialized || !excerpt || !excerpt.variables || excerpt.variables.length === 0 || !isEditing || !hasSelectedSource) {
      console.log('[useEmbedEditSession] Inference effect early return', {
        isInitialized,
        hasExcerpt: !!excerpt,
        hasVariables: excerpt?.variables?.length > 0,
        isEditing,
        hasSelectedSource,
        excerptId
      });
      return;
    }
    
    // Only attempt inference once per session
    if (clientInferenceAttemptedRef.current) {
      console.log('[useEmbedEditSession] Inference already attempted, skipping');
      return;
    }
    
    // Check if there's a "Client" variable (case-insensitive)
    const clientVariable = excerpt.variables.find(v => 
      v.name.toLowerCase() === 'client'
    );
    
    if (!clientVariable) {
      // No Client variable, mark as attempted so we don't check again
      logger.saves('[useEmbedEditSession] No Client variable found, skipping inference', {
        localId,
        variables: excerpt.variables.map(v => v.name)
      });
      clientInferenceAttemptedRef.current = true;
      return;
    }
    
    // Get current Client variable value
    const currentClientValue = variableValues[clientVariable.name] || '';
    const isClientEmpty = !currentClientValue || currentClientValue.trim() === '';
    
    // Only infer if Client variable is empty
    if (!isClientEmpty) {
      // Client already has a value, mark as attempted
      logger.saves('[useEmbedEditSession] Client variable already has value, skipping inference', {
        localId,
        variableName: clientVariable.name,
        currentValue: currentClientValue
      });
      clientInferenceAttemptedRef.current = true;
      return;
    }
    
    // Async function to fetch page title and perform inference
    const performInference = async () => {
      console.log('[useEmbedEditSession] Starting inference', {
        localId,
        variableName: clientVariable.name,
        currentValue: variableValues[clientVariable.name]
      });
      
      // First try to get page title from context
      let pageTitle = context?.extension?.content?.title || context?.contentTitle || null;
      
      console.log('[useEmbedEditSession] Page title from context', {
        localId,
        pageTitle,
        hasContext: !!context,
        contextKeys: context ? Object.keys(context) : null,
        extensionContentTitle: context?.extension?.content?.title,
        contentTitle: context?.contentTitle
      });
      
      // If not in context, try to fetch via API
      if (!pageTitle) {
        const pageId = context?.contentId || context?.extension?.content?.id;
        console.log('[useEmbedEditSession] Attempting to fetch page title via API', {
          localId,
          pageId
        });
        
        if (pageId) {
          try {
            logger.saves('[useEmbedEditSession] Page title not in context, fetching via API', {
              localId,
              pageId
            });
            const result = await invoke('getPageTitle', { contentId: pageId });
            console.log('[useEmbedEditSession] getPageTitle API result', {
              localId,
              success: result.success,
              title: result.data?.title,
              error: result.error
            });
            
            if (result.success && result.data?.title) {
              pageTitle = result.data.title;
              logger.saves('[useEmbedEditSession] Fetched page title via API', {
                localId,
                pageTitle
              });
            }
          } catch (error) {
            console.error('[useEmbedEditSession] Failed to fetch page title', error);
            logger.errors('[useEmbedEditSession] Failed to fetch page title', error, { localId, pageId });
          }
        } else {
          console.log('[useEmbedEditSession] No pageId available', {
            localId,
            contentId: context?.contentId,
            extensionContentId: context?.extension?.content?.id
          });
        }
      }
      
      if (!pageTitle) {
        // No page title available, mark as attempted
        console.log('[useEmbedEditSession] No page title available, skipping inference', {
          localId,
          contextKeys: context ? Object.keys(context) : null,
          hasExtension: !!context?.extension,
          hasContent: !!context?.extension?.content,
          contentId: context?.contentId || context?.extension?.content?.id
        });
        logger.saves('[useEmbedEditSession] No page title available, skipping inference', {
          localId,
          contextKeys: context ? Object.keys(context) : null,
          hasExtension: !!context?.extension,
          hasContent: !!context?.extension?.content,
          contentId: context?.contentId || context?.extension?.content?.id
        });
        clientInferenceAttemptedRef.current = true;
        return;
      }
      
      console.log('[useEmbedEditSession] Page title found, attempting inference', {
        localId,
        pageTitle
      });
      
      // Extract client name from page title
      const inferredClient = inferClientFromPageTitle(pageTitle);
      
      console.log('[useEmbedEditSession] Inference result', {
        localId,
        pageTitle,
        inferredClient,
        variableName: clientVariable.name
      });
      
      if (inferredClient) {
        // Set the Client variable value
        console.log('[useEmbedEditSession] Setting Client variable value', {
          localId,
          fieldName: `variableValues.${clientVariable.name}`,
          value: inferredClient
        });
        
        setValue(`variableValues.${clientVariable.name}`, inferredClient, { shouldDirty: true });
        
        // Increment formKey to force StableTextfield components to remount with new value
        // This ensures the TextField displays the inferred value immediately
        // Use setTimeout to ensure setValue completes first
        setTimeout(() => {
          setFormKey(prev => prev + 1);
        }, 50);
        
        // Verify it was set
        setTimeout(() => {
          const currentValue = getValues(`variableValues.${clientVariable.name}`);
          console.log('[useEmbedEditSession] Verified Client variable value after set', {
            localId,
            setValue: inferredClient,
            actualValue: currentValue
          });
        }, 100);
        
        logger.saves('[useEmbedEditSession] Inferred Client variable from page title', {
          localId,
          pageTitle,
          inferredClient,
          variableName: clientVariable.name
        });
      } else {
        console.log('[useEmbedEditSession] Page title does not match Blueprint pattern', {
          localId,
          pageTitle,
          variableName: clientVariable.name
        });
        logger.saves('[useEmbedEditSession] Page title does not match Blueprint pattern', {
          localId,
          pageTitle,
          variableName: clientVariable.name
        });
      }
      
      // Mark as attempted regardless of whether inference succeeded
      clientInferenceAttemptedRef.current = true;
    };
    
    // Run async inference with a small delay to ensure form is fully initialized
    setTimeout(() => {
      performInference();
    }, 100);
  }, [isInitialized, excerpt, variableValues, context, setValue, getValues, localId]);
  
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
        internalNotes: currentValues.internalNotes, // Keep internal notes
        complianceLevel: null, // Reset - will auto-select based on new Source's bespoke property
        isFreeformMode: false, // Reset freeform mode when switching Sources
        freeformContent: '' // Clear freeform content when switching Sources
      });
      
      // Update excerpt ID
      setExcerptId(newExcerptId);
      
      // Reset Client inference attempt ref so it can try again with new source
      clientInferenceAttemptedRef.current = false;
      
      // Perform Client inference immediately after source selection
      // This ensures inference happens even if the excerpt wasn't loaded before
      const performClientInference = async () => {
        // Check if there's a "Client" variable (case-insensitive)
        const clientVar = newExcerpt.variables?.find(v => 
          v.name.toLowerCase() === 'client'
        );
        
        if (!clientVar) {
          return; // No Client variable
        }
        
        // Check if Client variable is empty in preserved values
        const preservedClientValue = preservedVariableValues[clientVar.name] || '';
        const isClientEmpty = !preservedClientValue || preservedClientValue.trim() === '';
        
        if (!isClientEmpty) {
          return; // Client already has a value
        }
        
        // Get page title from context or API
        let pageTitle = context?.extension?.content?.title || context?.contentTitle || null;
        
        if (!pageTitle) {
          const pageId = context?.contentId || context?.extension?.content?.id;
          if (pageId) {
            try {
              const result = await invoke('getPageTitle', { contentId: pageId });
              if (result.success && result.data?.title) {
                pageTitle = result.data.title;
              }
            } catch (error) {
              logger.errors('[useEmbedEditSession] Failed to fetch page title during source switch', error, { localId, pageId });
            }
          }
        }
        
        if (!pageTitle) {
          return; // No page title available
        }
        
        // Extract client name from page title
        const inferredClient = inferClientFromPageTitle(pageTitle);
        
        if (inferredClient) {
          // Set the Client variable value
          setValue(`variableValues.${clientVar.name}`, inferredClient, { shouldDirty: true });
          
          // Increment formKey to force StableTextfield components to remount with new value
          // This ensures the TextField displays the inferred value immediately
          // Use setTimeout to ensure setValue completes first
          setTimeout(() => {
            setFormKey(prev => prev + 1);
          }, 50);
          
          logger.saves('[useEmbedEditSession] Inferred Client variable from page title (during source switch)', {
            localId,
            pageTitle,
            inferredClient,
            variableName: clientVar.name,
            newExcerptId
          });
          
          // Update preserved values for saving
          preservedVariableValues[clientVar.name] = inferredClient;
        }
      };
      
      // Run inference after a brief delay to ensure form is reset
      setTimeout(() => {
        performClientInference();
      }, 150);
      
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
        internalNotes: currentValues.internalNotes,
        complianceLevel: null, // Reset - will auto-select based on new Source's bespoke property
        isFreeformMode: false, // Reset freeform mode when switching Sources
        freeformContent: '' // Clear freeform content when switching Sources
      });
      
      // Also save to Forge storage immediately
      // This ensures the Source selection persists even if user exits without explicit save
      // (e.g., when editing in Confluence's page edit mode)
      await invoke('saveVariableValues', {
        localId,
        excerptId: newExcerptId,
        variableValues: normalizeVariableValues(preservedVariableValues),
        toggleStates: {},
        customInsertions: currentValues.customInsertions,
        internalNotes: currentValues.internalNotes,
        customHeading: currentValues.customHeading || '',
        complianceLevel: null,
        isFreeformMode: false,
        freeformContent: ''
      });
      
      // Invalidate React Query cache so View Mode picks up the change
      await queryClient.invalidateQueries({ queryKey: ['variableValues', localId] });
      
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
  }, [localId, excerptId, originalExcerptId, getValues, reset, context, queryClient]);
  
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
        customHeading: values.customHeading || '',
        complianceLevel: values.complianceLevel || null,
        isFreeformMode: values.isFreeformMode || false,
        freeformContent: values.freeformContent || ''
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
        customHeading: headingValue,
        complianceLevel: values.complianceLevel || null,
        isFreeformMode: values.isFreeformMode || false,
        freeformContent: values.freeformContent || '',
        smartCasingEnabled: values.smartCasingEnabled !== false // Default true for backwards compat
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
    complianceLevel,
    isFreeformMode,
    freeformContent,
    smartCasingEnabled,
    
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
    isLoadingStoredData,
    isSaving,
    isPublishing,
    publishProgress, // 0-1 for progress bar
    saveStatus,
    formKey, // Changes on reset to force input re-mounts
    
    // Publish status
    publishStatus,
    setPublishStatus,
    needsRepublish,
    
    // Redline status (from stored data)
    redlineStatus: storedData?.redlineStatus || null,
    
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
