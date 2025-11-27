/**
 * Archetype Definitions
 *
 * Defines the available page archetypes and their chapter structures.
 * Each archetype represents a type of Blueprint page (e.g., Client Onboarding)
 * and contains a list of chapters that can be toggled on/off.
 *
 * Structure:
 * - Archetype: A page template type with a set of chapters
 * - Chapter: A section of the page tied to a specific Source excerpt
 *
 * Note: This is a configuration file that will eventually be managed
 * through the Admin UI. For now, it's hardcoded for initial implementation.
 *
 * @module archetype-definitions
 */

/**
 * @typedef {Object} Chapter
 * @property {string} id - Unique chapter identifier
 * @property {string} name - Display name for the chapter
 * @property {string} sourceId - The Source excerpt ID this chapter uses
 * @property {string} description - Brief description of the chapter
 * @property {number} order - Display order within the archetype
 * @property {boolean} defaultEnabled - Whether enabled by default for new pages
 * @property {boolean} required - Whether this chapter is required (cannot be disabled)
 */

/**
 * @typedef {Object} Archetype
 * @property {string} id - Unique archetype identifier
 * @property {string} name - Display name for the archetype
 * @property {string} description - Brief description of the archetype
 * @property {string} category - Category for grouping archetypes
 * @property {Chapter[]} chapters - List of chapters in this archetype
 */

/**
 * Available archetypes
 *
 * Each archetype defines a page template with specific chapters.
 * The sourceId in each chapter references a Blueprint Source excerpt
 * that will provide the content for that chapter.
 *
 * IMPORTANT: Update these sourceIds to match your actual Source excerpt IDs
 * from your Blueprint App storage.
 *
 * @type {Archetype[]}
 */
export const ARCHETYPES = [
  {
    id: 'client-onboarding',
    name: 'Client Onboarding',
    description: 'Standard client onboarding blueprint with all required chapters',
    category: 'Client Management',
    chapters: [
      {
        id: 'introduction',
        name: 'Introduction',
        sourceId: 'TODO-REPLACE-WITH-ACTUAL-SOURCE-ID', // Replace with actual Source ID
        description: 'Welcome and overview section',
        order: 1,
        defaultEnabled: true,
        required: true
      },
      {
        id: 'account-setup',
        name: 'Account Setup',
        sourceId: 'TODO-REPLACE-WITH-ACTUAL-SOURCE-ID', // Replace with actual Source ID
        description: 'Account configuration and access setup',
        order: 2,
        defaultEnabled: true,
        required: false
      },
      {
        id: 'team-contacts',
        name: 'Team & Contacts',
        sourceId: 'TODO-REPLACE-WITH-ACTUAL-SOURCE-ID', // Replace with actual Source ID
        description: 'Key contacts and team members',
        order: 3,
        defaultEnabled: true,
        required: false
      },
      {
        id: 'billing-info',
        name: 'Billing Information',
        sourceId: 'TODO-REPLACE-WITH-ACTUAL-SOURCE-ID', // Replace with actual Source ID
        description: 'Billing and invoicing details',
        order: 4,
        defaultEnabled: true,
        required: false
      },
      {
        id: 'reporting-cadence',
        name: 'Reporting Cadence',
        sourceId: 'TODO-REPLACE-WITH-ACTUAL-SOURCE-ID', // Replace with actual Source ID
        description: 'Reporting schedule and requirements',
        order: 5,
        defaultEnabled: true,
        required: false
      }
    ]
  },
  {
    id: 'vendor-setup',
    name: 'Vendor Setup',
    description: 'Vendor onboarding and integration blueprint',
    category: 'Vendor Management',
    chapters: [
      {
        id: 'vendor-intro',
        name: 'Vendor Overview',
        sourceId: 'TODO-REPLACE-WITH-ACTUAL-SOURCE-ID', // Replace with actual Source ID
        description: 'Vendor introduction and capabilities',
        order: 1,
        defaultEnabled: true,
        required: true
      },
      {
        id: 'integration-setup',
        name: 'Integration Setup',
        sourceId: 'TODO-REPLACE-WITH-ACTUAL-SOURCE-ID', // Replace with actual Source ID
        description: 'Technical integration requirements',
        order: 2,
        defaultEnabled: true,
        required: false
      },
      {
        id: 'contract-terms',
        name: 'Contract Terms',
        sourceId: 'TODO-REPLACE-WITH-ACTUAL-SOURCE-ID', // Replace with actual Source ID
        description: 'Contract and legal terms',
        order: 3,
        defaultEnabled: true,
        required: false
      }
    ]
  },
  {
    id: 'project-kickoff',
    name: 'Project Kickoff',
    description: 'Project initialization and planning blueprint',
    category: 'Project Management',
    chapters: [
      {
        id: 'project-overview',
        name: 'Project Overview',
        sourceId: 'TODO-REPLACE-WITH-ACTUAL-SOURCE-ID', // Replace with actual Source ID
        description: 'Project scope and objectives',
        order: 1,
        defaultEnabled: true,
        required: true
      },
      {
        id: 'timeline',
        name: 'Timeline & Milestones',
        sourceId: 'TODO-REPLACE-WITH-ACTUAL-SOURCE-ID', // Replace with actual Source ID
        description: 'Project timeline and key milestones',
        order: 2,
        defaultEnabled: true,
        required: false
      },
      {
        id: 'stakeholders',
        name: 'Stakeholders',
        sourceId: 'TODO-REPLACE-WITH-ACTUAL-SOURCE-ID', // Replace with actual Source ID
        description: 'Project stakeholders and RACI',
        order: 3,
        defaultEnabled: true,
        required: false
      },
      {
        id: 'risks',
        name: 'Risks & Dependencies',
        sourceId: 'TODO-REPLACE-WITH-ACTUAL-SOURCE-ID', // Replace with actual Source ID
        description: 'Project risks and dependencies',
        order: 4,
        defaultEnabled: false, // Off by default
        required: false
      }
    ]
  }
];

/**
 * Get archetype by ID
 *
 * @param {string} archetypeId - Archetype ID to find
 * @returns {Archetype|null} The archetype or null if not found
 */
export function getArchetypeById(archetypeId) {
  return ARCHETYPES.find(a => a.id === archetypeId) || null;
}

/**
 * Get chapters for an archetype
 *
 * @param {string} archetypeId - Archetype ID
 * @returns {Chapter[]|null} Chapters sorted by order, or null if not found
 */
export function getChaptersByArchetypeId(archetypeId) {
  const archetype = getArchetypeById(archetypeId);
  if (!archetype) return null;

  return [...archetype.chapters].sort((a, b) => a.order - b.order);
}

/**
 * Get all archetype categories
 *
 * @returns {string[]} Unique category names
 */
export function getArchetypeCategories() {
  const categories = new Set(ARCHETYPES.map(a => a.category));
  return Array.from(categories);
}

/**
 * Get archetypes by category
 *
 * @param {string} category - Category name
 * @returns {Archetype[]} Archetypes in that category
 */
export function getArchetypesByCategory(category) {
  return ARCHETYPES.filter(a => a.category === category);
}

/**
 * Validate archetype configuration
 *
 * Checks that all sourceIds are valid and chapters are properly configured.
 *
 * @param {string} archetypeId - Archetype ID to validate
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateArchetypeConfig(archetypeId) {
  const archetype = getArchetypeById(archetypeId);
  const errors = [];

  if (!archetype) {
    return { valid: false, errors: ['Archetype not found'] };
  }

  for (const chapter of archetype.chapters) {
    if (!chapter.id) {
      errors.push(`Chapter missing id`);
    }
    if (!chapter.sourceId) {
      errors.push(`Chapter ${chapter.id} missing sourceId`);
    }
    if (chapter.sourceId?.startsWith('TODO-')) {
      errors.push(`Chapter ${chapter.id} has placeholder sourceId`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

