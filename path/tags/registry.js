/**
 * ACG Path - Tag Registry
 * Manages tag instances within the ISA-95 hierarchy.
 * Tags are leaf-level data points (sensors, setpoints, statuses).
 */
import { LEVEL_ORDER } from '../udts/isa95.js';

const _tags = new Map();
let _idCounter = 0;

/**
 * Tag data types following IEC 61131-3 conventions.
 */
export const TAG_TYPES = {
  BOOL: 'bool',
  INT: 'int',
  REAL: 'real',
  STRING: 'string',
  TIMESTAMP: 'timestamp',
  ENUM: 'enum',
  ARRAY: 'array',
  STRUCT: 'struct',
};

/**
 * Create a tag instance.
 */
export function createTag(opts) {
  const tag = {
    id: opts.id || `tag-${++_idCounter}`,
    name: opts.name,
    path: opts.path,
    type: opts.type || TAG_TYPES.REAL,
    value: opts.value ?? null,
    unit: opts.unit || '',
    description: opts.description || '',
    quality: opts.quality || 'good',
    timestamp: Date.now(),
    metadata: opts.metadata || {},
    history: [],
  };

  _tags.set(tag.id, tag);
  return tag;
}

/**
 * Read a tag value.
 */
export function readTag(id) {
  const tag = _tags.get(id);
  if (!tag) return null;
  return { id: tag.id, name: tag.name, value: tag.value, quality: tag.quality, timestamp: tag.timestamp };
}

/**
 * Write a tag value (updates timestamp and pushes to history).
 */
export function writeTag(id, value, quality = 'good') {
  const tag = _tags.get(id);
  if (!tag) throw new Error(`Tag not found: ${id}`);

  tag.history.push({ value: tag.value, quality: tag.quality, timestamp: tag.timestamp });
  if (tag.history.length > 1000) tag.history.shift();

  tag.value = value;
  tag.quality = quality;
  tag.timestamp = Date.now();

  return readTag(id);
}

/**
 * Get all tags, optionally filtered by path prefix.
 */
export function getAllTags(pathPrefix) {
  const result = [];
  for (const tag of _tags.values()) {
    if (!pathPrefix || tag.path.startsWith(pathPrefix)) {
      result.push(readTag(tag.id));
    }
  }
  return result;
}

/**
 * Get tag history.
 */
export function getTagHistory(id, limit = 100) {
  const tag = _tags.get(id);
  if (!tag) return [];
  return tag.history.slice(-limit);
}

/**
 * Delete a tag.
 */
export function deleteTag(id) {
  return _tags.delete(id);
}

/**
 * Browse tags by hierarchy level.
 */
export function browseTags(path) {
  const parts = path ? path.split('/') : [];
  const level = parts.length;
  const prefix = path ? path + '/' : '';

  const children = new Set();
  for (const tag of _tags.values()) {
    if (tag.path.startsWith(prefix)) {
      const rest = tag.path.slice(prefix.length);
      const next = rest.split('/')[0];
      if (next) children.add(next);
    }
  }

  return {
    path,
    level: LEVEL_ORDER[level] || 'Tag',
    children: [...children],
    tags: getAllTags(path).filter(t => {
      const tagParts = t.path ? t.path.split('/') : [];
      return tagParts.length === level + 1;
    }),
  };
}

/**
 * Clear all tags (for testing).
 */
export function clearTags() {
  _tags.clear();
  _idCounter = 0;
}
