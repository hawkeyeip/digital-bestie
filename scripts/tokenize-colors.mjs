/**
 * Script: tokenize-colors.mjs
 *
 * Converts hardcoded cyan rgba(0, 240, 255, X) and purple rgba(179, 71, 255, X)
 * into semantic CSS variables:
 *   rgba(var(--accent-1-rgb), X)
 *   rgba(var(--accent-2-rgb), X)
 *
 * This allows all 6 themes + custom accent color to recolor the entire app instantly.
 */

import fs from 'node:fs';
import path from 'node:path';

const filesToTokenize = [
  'src/styles/index.css',
  'src/styles/onboarding.css'
];

function tokenize(content) {
  // Replace cyan rgba(0, 240, 255, X)
  let updated = content.replace(/rgba\(\s*0\s*,\s*240\s*,\s*255\s*,\s*([0-9.]+)\s*\)/g, 'rgba(var(--accent-1-rgb), $1)');

  // Replace purple rgba(179, 71, 255, X)
  updated = updated.replace(/rgba\(\s*179\s*,\s*71\s*,\s*255\s*,\s*([0-9.]+)\s*\)/g, 'rgba(var(--accent-2-rgb), $1)');

  return updated;
}

for (const rel of filesToTokenize) {
  const full = path.resolve(rel);
  if (!fs.existsSync(full)) {
    console.warn(`File not found: ${rel}`);
    continue;
  }
  const original = fs.readFileSync(full, 'utf-8');
  const tokenized = tokenize(original);
  fs.writeFileSync(full, tokenized, 'utf-8');
  console.log(`Tokenized colors in ${rel}`);
}
