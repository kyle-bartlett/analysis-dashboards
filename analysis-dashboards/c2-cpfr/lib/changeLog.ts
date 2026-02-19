// =============================================================================
// Change Log — Tracks accept/update actions
// =============================================================================
// Uses a JSON file for storage. On Vercel, this persists in /tmp/ during the
// function lifetime. For production persistence, swap to Vercel KV or similar.

import { promises as fs } from 'fs';
import path from 'path';
import type { ChangeLogEntry } from './types';

const LOG_PATH = path.join(process.cwd(), 'data', 'changelog.json');
const MAX_ENTRIES = 200;

async function ensureDir() {
  const dir = path.dirname(LOG_PATH);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {
    // Already exists
  }
}

export async function getChangeLog(limit = 20): Promise<ChangeLogEntry[]> {
  try {
    await ensureDir();
    const raw = await fs.readFile(LOG_PATH, 'utf-8');
    const entries: ChangeLogEntry[] = JSON.parse(raw);
    return entries.slice(0, limit);
  } catch {
    return [];
  }
}

export async function addChangeLogEntry(
  entry: Omit<ChangeLogEntry, 'id' | 'timestamp'>
): Promise<ChangeLogEntry> {
  await ensureDir();

  const full: ChangeLogEntry = {
    id: `cl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };

  let entries: ChangeLogEntry[] = [];
  try {
    const raw = await fs.readFile(LOG_PATH, 'utf-8');
    entries = JSON.parse(raw);
  } catch {
    // File doesn't exist yet
  }

  // Prepend new entry and cap at MAX_ENTRIES
  entries.unshift(full);
  if (entries.length > MAX_ENTRIES) {
    entries = entries.slice(0, MAX_ENTRIES);
  }

  await fs.writeFile(LOG_PATH, JSON.stringify(entries, null, 2));
  return full;
}
