#!/usr/bin/env node
/* eslint-disable */
/**
 * Build-time guard for the "use client" trap that bit us twice (PR #33, #35).
 *
 * Fails the build if any file under app/api/** imports (directly or via path
 * alias) a module under lib/ whose first non-empty line is "use client".
 * Server route handlers can't bind to client-module exports at runtime —
 * the build doesn't catch it because Next compiles both targets, but the
 * route crashes at request time.
 *
 * Run via `node scripts/check-server-imports.mjs`. Hook into `build` in
 * package.json so deploys stop before they get pushed broken.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";

const ROOT = resolve(process.cwd());
const APP_API_DIR = join(ROOT, "app", "api");
const LIB_DIR = join(ROOT, "lib");

/** Recursive .ts/.tsx walker. */
function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/** Read the first non-empty, non-comment line of a file. */
function firstDirective(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("//") || line.startsWith("/*") || line.startsWith("*")) continue;
    return line;
  }
  return null;
}

/** Parse top-level import statements; return the set of source strings. */
function importsFrom(path) {
  const text = readFileSync(path, "utf8");
  const sources = new Set();
  const re = /^\s*(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/gm;
  let m;
  while ((m = re.exec(text)) !== null) sources.add(m[1]);
  // Also catch bare side-effect imports: `import "./foo";`
  const reSide = /^\s*import\s+["']([^"']+)["']/gm;
  while ((m = reSide.exec(text)) !== null) sources.add(m[1]);
  return sources;
}

/** Resolve an import string to an on-disk path. Handles "@/x" alias and
 *  relative paths. Returns null if it isn't a local lib/ file. */
function resolveLib(fromFile, spec) {
  let absNoExt;
  if (spec.startsWith("@/")) {
    absNoExt = join(ROOT, spec.slice(2));
  } else if (spec.startsWith(".")) {
    absNoExt = resolve(dirname(fromFile), spec);
  } else {
    return null; // package import, ignore
  }
  // Only care about files actually under lib/.
  if (!absNoExt.startsWith(LIB_DIR + "/") && !absNoExt.startsWith(LIB_DIR + "\\")) {
    return null;
  }
  for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const candidate = absNoExt + ext;
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {}
  }
  return null;
}

function main() {
  const apiFiles = walk(APP_API_DIR);
  const offenders = [];
  for (const file of apiFiles) {
    const sources = importsFrom(file);
    for (const spec of sources) {
      const libPath = resolveLib(file, spec);
      if (!libPath) continue;
      const directive = firstDirective(libPath);
      if (directive === '"use client";' || directive === "'use client';") {
        offenders.push({
          route: relative(ROOT, file),
          lib: relative(ROOT, libPath),
          spec,
        });
      }
    }
  }

  if (offenders.length === 0) {
    console.log(`✓ server-import guard: ${apiFiles.length} API files scanned, none import a 'use client' lib module.`);
    return;
  }

  console.error("");
  console.error("✗ server-import guard FAILED — server routes import 'use client' modules:");
  console.error("");
  for (const o of offenders) {
    console.error(`  ${o.route}`);
    console.error(`    imports  ${o.spec}`);
    console.error(`    resolves ${o.lib}  (has 'use client' at top)`);
  }
  console.error("");
  console.error("  Fix: if the lib module is pure data / pure functions, remove the");
  console.error("  'use client' directive — it's only for modules that USE the browser");
  console.error("  runtime (React hooks, window, localStorage, navigator).");
  console.error("");
  process.exit(1);
}

main();
