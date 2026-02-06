/**
 * ACG Path - ISA-95 User Defined Types
 * Defines the ISA-95 equipment hierarchy as structured UDTs.
 * Each level maps to the standard: Enterprise > Site > Area > Line > Cell > Unit
 *
 * Reference: ISA-95 (IEC 62264) Part 1 - Equipment Hierarchy
 */

export const ISA95_HIERARCHY = {
  Enterprise: {
    level: 0,
    description: 'Top-level organizational entity',
    children: ['Site'],
    properties: {
      id: { type: 'string', required: true },
      name: { type: 'string', required: true },
      description: { type: 'string', default: '' },
      location: { type: 'string', default: '' },
    },
  },
  Site: {
    level: 1,
    description: 'Physical or logical location within an enterprise',
    parent: 'Enterprise',
    children: ['Area'],
    properties: {
      id: { type: 'string', required: true },
      name: { type: 'string', required: true },
      description: { type: 'string', default: '' },
      timezone: { type: 'string', default: 'UTC' },
      coordinates: { type: 'object', default: { lat: 0, lon: 0 } },
    },
  },
  Area: {
    level: 2,
    description: 'Physical or logical grouping within a site',
    parent: 'Site',
    children: ['Line'],
    properties: {
      id: { type: 'string', required: true },
      name: { type: 'string', required: true },
      description: { type: 'string', default: '' },
      areaType: { type: 'string', enum: ['production', 'storage', 'utility', 'other'], default: 'production' },
    },
  },
  Line: {
    level: 3,
    description: 'Production line or process segment',
    parent: 'Area',
    children: ['Cell'],
    properties: {
      id: { type: 'string', required: true },
      name: { type: 'string', required: true },
      description: { type: 'string', default: '' },
      lineType: { type: 'string', enum: ['continuous', 'batch', 'discrete'], default: 'discrete' },
      capacity: { type: 'number', default: 0 },
    },
  },
  Cell: {
    level: 4,
    description: 'Work cell or process cell',
    parent: 'Line',
    children: ['Unit'],
    properties: {
      id: { type: 'string', required: true },
      name: { type: 'string', required: true },
      description: { type: 'string', default: '' },
      cellType: { type: 'string', enum: ['process', 'work', 'control'], default: 'work' },
    },
  },
  Unit: {
    level: 5,
    description: 'Individual equipment unit',
    parent: 'Cell',
    children: [],
    properties: {
      id: { type: 'string', required: true },
      name: { type: 'string', required: true },
      description: { type: 'string', default: '' },
      unitType: { type: 'string', default: 'generic' },
      status: { type: 'string', enum: ['running', 'stopped', 'faulted', 'maintenance'], default: 'stopped' },
      tags: { type: 'array', default: [] },
    },
  },
};

export const LEVEL_ORDER = ['Enterprise', 'Site', 'Area', 'Line', 'Cell', 'Unit'];

/**
 * Create an instance of an ISA-95 UDT with defaults.
 */
export function createUDTInstance(level, data = {}) {
  const def = ISA95_HIERARCHY[level];
  if (!def) throw new Error(`Unknown ISA-95 level: ${level}`);

  const instance = { _type: level, _level: def.level };
  for (const [key, prop] of Object.entries(def.properties)) {
    if (data[key] !== undefined) {
      instance[key] = data[key];
    } else if (prop.required) {
      throw new Error(`Required property "${key}" missing for ${level}`);
    } else {
      instance[key] = typeof prop.default === 'object' ? JSON.parse(JSON.stringify(prop.default)) : prop.default;
    }
  }
  return instance;
}

/**
 * Validate data against an ISA-95 UDT definition.
 */
export function validateUDT(level, data) {
  const def = ISA95_HIERARCHY[level];
  if (!def) return { valid: false, errors: [`Unknown level: ${level}`] };

  const errors = [];
  for (const [key, prop] of Object.entries(def.properties)) {
    if (prop.required && (data[key] === undefined || data[key] === null)) {
      errors.push(`Missing required property: ${key}`);
    }
    if (data[key] !== undefined && prop.type) {
      const actual = Array.isArray(data[key]) ? 'array' : typeof data[key];
      if (actual !== prop.type) {
        errors.push(`Property "${key}": expected ${prop.type}, got ${actual}`);
      }
    }
    if (data[key] !== undefined && prop.enum && !prop.enum.includes(data[key])) {
      errors.push(`Property "${key}": "${data[key]}" not in [${prop.enum.join(', ')}]`);
    }
  }

  return { valid: errors.length === 0, errors };
}
