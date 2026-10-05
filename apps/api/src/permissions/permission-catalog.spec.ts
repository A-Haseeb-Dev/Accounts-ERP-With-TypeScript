import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PERMISSION_CATALOG } from './permission-catalog';

const API_SRC = join(__dirname, '..');
const REPO_ROOT = join(API_SRC, '..', '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

const catalogNames = PERMISSION_CATALOG.map((p) => p.name);

describe('permission catalog', () => {
  it('has no duplicate permission names', () => {
    const seen = new Set<string>();
    const dupes = catalogNames.filter((n) => (seen.has(n) ? true : (seen.add(n), false)));
    expect(dupes).toEqual([]);
  });

  it('names every permission MODULE.ACTION', () => {
    const malformed = PERMISSION_CATALOG.filter((p) => !p.name.includes('.') || !p.module || !p.action);
    expect(malformed).toEqual([]);
  });

  it('covers every permission the controllers require', () => {
    const missing: string[] = [];
    for (const file of walk(API_SRC)) {
      if (!file.endsWith('.controller.ts')) continue;
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/@Permissions\(\s*'([^']+)'/g)) {
        const name = match[1];
        if (!catalogNames.includes(name)) missing.push(`${name} (${file})`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('covers every permission the web navigation gates on', () => {
    const navFile = join(REPO_ROOT, 'apps', 'web', 'src', 'lib', 'navigation.ts');
    // The web app is optional here so the API suite still runs standalone.
    if (!existsSync(navFile)) return;

    const source = readFileSync(navFile, 'utf8');
    const navPermissions = [...source.matchAll(/permission:\s*'([^']+)'/g)].map((m) => m[1]);
    expect(navPermissions.length).toBeGreaterThan(0);

    const missing = navPermissions.filter((name) => !catalogNames.includes(name));
    expect(missing).toEqual([]);
  });

  it('grants the screens that had no permission of their own', () => {
    // Print Layout and Security used to be reachable through the wider
    // `system.settings.manage` permission, or with no permission at all.
    expect(catalogNames).toContain('system.print_layout.manage');
    expect(catalogNames).toContain('system.security.manage');
  });

  it('exposes an export permission for every module that can print', () => {
    const printable = catalogNames.filter((n) => n.endsWith('.print') && n !== 'reports.print');
    const missing = printable.filter((n) => !catalogNames.includes(n.replace(/\.print$/, '.export')));
    expect(missing).toEqual([]);
  });
});