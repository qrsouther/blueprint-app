/**
 * Form Schemas
 *
 * Centralized Zod schemas for form validation across the application.
 * These schemas ensure type safety and consistent validation between
 * frontend and backend.
 *
 * @module schemas/form-schemas
 */

import { z } from 'zod';

/**
 * Custom Insertion Schema
 * Validates custom paragraph insertions
 */
export const CustomInsertionSchema = z.object({
  position: z.number().int().min(0, "Position must be a non-negative integer"),
  text: z.string().min(1, "Custom paragraph text cannot be empty")
});

/**
 * Internal Note Schema
 * Validates internal notes (staff-only annotations)
 */
export const InternalNoteSchema = z.object({
  position: z.number().int().min(0, "Position must be a non-negative integer"),
  content: z.string().min(1, "Internal note content cannot be empty")
});

/**
 * Embed Configuration Schema
 * Complete schema for Embed instance configuration
 *
 * This schema validates the data structure for saving Embed configurations,
 * including variable values, toggle states, custom insertions, and internal notes.
 */
export const EmbedConfigSchema = z.object({
  excerptId: z.string()
    .min(1, "Excerpt ID is required")
    .refine(
      (val) => {
        // UUID validation (flexible - can be UUID or other string IDs)
        // Don't enforce strict UUID format to allow for future ID formats
        return val.trim().length > 0;
      },
      { message: "Excerpt ID must be a valid identifier" }
    ),

  variableValues: z.record(
    z.string().min(1, "Variable name cannot be empty"),
    z.string() // Variable value can be empty string (null values are normalized to empty string)
  ).optional().default({}),

  toggleStates: z.record(
    z.string().min(1, "Toggle name cannot be empty"),
    z.boolean()
  ).optional().default({}),

  customInsertions: z.array(CustomInsertionSchema)
    .optional()
    .default([]),

  internalNotes: z.array(InternalNoteSchema)
    .optional()
    .default([])
});

/**
 * Partial Embed Config Schema
 * For validating updates to specific fields only
 */
export const PartialEmbedConfigSchema = EmbedConfigSchema.partial();

/**
 * Variable Metadata Schema
 * Validates variable definitions in Source/Excerpt configuration
 */
export const VariableMetadataSchema = z.object({
  name: z.string().min(1, "Variable name is required"),
  description: z.string().max(500, "Description too long").optional(),
  example: z.string().max(200, "Example too long").optional(),
  required: z.boolean().optional().default(false)
});

/**
 * Toggle Metadata Schema
 * Validates toggle definitions in Source/Excerpt configuration
 */
export const ToggleMetadataSchema = z.object({
  name: z.string().min(1, "Toggle name is required"),
  description: z.string().max(500, "Description too long").optional()
});

/**
 * Source Configuration Schema
 * Schema for Blueprint Standard Source configuration
 *
 * Note: This is for future use when migrating Source config forms.
 * Currently, Source configuration is handled separately.
 */
export const SourceConfigSchema = z.object({
  excerptName: z.string()
    .min(1, "Name is required")
    .max(100, "Name must be less than 100 characters"),

  category: z.string()
    .min(1, "Category is required"),

  content: z.object({
    type: z.literal('doc'),
    version: z.literal(1).optional(),
    content: z.array(z.any()) // ADF content is too complex to fully validate with Zod
  }),

  variableMetadata: z.array(VariableMetadataSchema)
    .optional()
    .default([]),

  toggleMetadata: z.array(ToggleMetadataSchema)
    .optional()
    .default([]),

  documentationLinks: z.array(
    z.object({
      label: z.string().min(1, "Link label is required"),
      url: z.string().url("Invalid URL format")
    })
  ).optional().default([])
});

/**
 * Category Schema
 * Validates category objects
 */
export const CategorySchema = z.object({
  name: z.string()
    .min(1, "Category name is required")
    .max(50, "Category name must be less than 50 characters"),
  order: z.number().int().min(0).optional()
});

/**
 * Helper function to normalize variable values
 * Ensures all values are strings (converts null/undefined to empty string)
 */
export function normalizeVariableValues(variableValues) {
  if (!variableValues || typeof variableValues !== 'object') {
    return {};
  }

  const normalized = {};
  for (const [key, value] of Object.entries(variableValues)) {
    // Normalize: null, undefined, or empty string all become empty string
    normalized[key] = value === null || value === undefined ? '' : String(value);
  }

  return normalized;
}

/**
 * Helper function to validate and normalize Embed config data
 * Useful for preparing data before saving
 */
export function validateAndNormalizeEmbedConfig(data) {
  // Normalize variable values first
  const normalizedData = {
    ...data,
    variableValues: normalizeVariableValues(data.variableValues)
  };

  // Validate with Zod schema
  const result = EmbedConfigSchema.safeParse(normalizedData);

  if (!result.success) {
    return {
      success: false,
      error: 'Validation failed',
      details: result.error.flatten()
    };
  }

  return {
    success: true,
    data: result.data
  };
}

