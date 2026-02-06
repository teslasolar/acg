/**
 * ACG Path - Path resolution and management
 * Parses and resolves ISA-95 hierarchical paths.
 * Maps path segments to UDT levels and tag instances.
 */
import { ISA95_HIERARCHY, LEVEL_ORDER, createUDTInstance, validateUDT } from './udts/isa95.js';
import { getAllTags, browseTags } from './tags/registry.js';

/**
 * Parse an ISA-95 path string into structured components.
 *
 * @param {string} pathStr - e.g. "Enterprise/Site/Area/Line/Cell"
 * @returns {{ levels: string[], segments: object[], fullPath: string }}
 */
export function parsePath(pathStr) {
  if (!pathStr) return { levels: [], segments: [], fullPath: '' };

  const parts = pathStr.split('/').filter(Boolean);
  const segments = parts.map((name, i) => ({
    name,
    level: LEVEL_ORDER[i] || 'Tag',
    index: i,
    isLeaf: i === parts.length - 1,
  }));

  return {
    levels: parts,
    segments,
    fullPath: parts.join('/'),
    depth: parts.length,
  };
}

/**
 * Resolve a path to its ISA-95 level definition and any matching tags.
 */
export function resolvePath(pathStr) {
  const parsed = parsePath(pathStr);
  const depth = parsed.depth;
  const levelName = LEVEL_ORDER[depth - 1] || null;
  const levelDef = levelName ? ISA95_HIERARCHY[levelName] : null;

  const tags = getAllTags(pathStr);
  const browse = browseTags(pathStr);

  return {
    ...parsed,
    level: levelName,
    definition: levelDef,
    tags,
    children: browse.children,
  };
}

/**
 * Validate a full path against the ISA-95 hierarchy.
 */
export function validatePath(pathStr) {
  const parsed = parsePath(pathStr);
  const errors = [];

  if (parsed.depth === 0) {
    errors.push('Empty path');
    return { valid: false, errors };
  }

  if (parsed.depth > LEVEL_ORDER.length) {
    errors.push(`Path too deep: ${parsed.depth} levels (max ${LEVEL_ORDER.length})`);
  }

  return { valid: errors.length === 0, errors, parsed };
}

/**
 * Build a path string from components.
 */
export function buildPath(...parts) {
  return parts.filter(Boolean).join('/');
}

/**
 * Get the parent path.
 */
export function parentPath(pathStr) {
  const parts = pathStr.split('/').filter(Boolean);
  parts.pop();
  return parts.join('/') || null;
}

/**
 * CLI runner for path commands.
 */
export async function run(args) {
  const [subcommand, ...subArgs] = args;

  switch (subcommand) {
    case 'resolve': {
      const result = resolvePath(subArgs[0]);
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case 'validate': {
      const result = validatePath(subArgs[0]);
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case 'browse': {
      const result = browseTags(subArgs[0] || '');
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case 'hierarchy': {
      for (const level of LEVEL_ORDER) {
        const def = ISA95_HIERARCHY[level];
        console.log(`${level} (Level ${def.level}): ${def.description}`);
      }
      break;
    }
    default:
      console.log('ACG Path Commands:');
      console.log('  resolve <path>   - Resolve an ISA-95 path');
      console.log('  validate <path>  - Validate a path');
      console.log('  browse [path]    - Browse tag hierarchy');
      console.log('  hierarchy        - Show ISA-95 levels');
  }
}

export default run;
