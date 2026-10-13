/**
 * Vault Backup & Disaster Recovery
 *
 * Three layers of protection:
 *  1. Daily local snapshots   (~/.digital-bestie/snapshots/, 7-day rolling) — undo mistakes
 *  2. Encrypted export files  (.bestie-backup, AES-256-GCM + PBKDF2)        — survive a lost/dead Mac
 *  3. Optional auto-copy      (encrypted copy written to a folder you pick,
 *                              e.g. iCloud Drive / Dropbox / USB)           — off-device without remembering
 *
 * Keychain-encrypted vault files (Electron safeStorage) are machine-bound, so exports
 * decrypt them first and restores re-encrypt them with the new Mac's Keychain.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import * as electron from 'electron';
import { writeFileAtomic, saveSecureJSON } from './memory.js';

const safeStorage = electron.safeStorage || electron.default?.safeStorage || null;
const pbkdf2 = promisify(crypto.pbkdf2);

export const BACKUP_FORMAT = 'digital-bestie-backup';
export const BACKUP_VERSION = 1;
export const BACKUP_EXTENSION = 'bestie-backup';
export const KDF_ITERATIONS = 310000;
export const SNAPSHOT_RETENTION = 7;
export const PRE_RESTORE_RETENTION = 3;
export const MIN_PASSPHRASE_LENGTH = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Regenerable logs / caches / machine-local state that are never backed up */
const EXCLUDED_FILES = new Set([
  'telemetry.json',
  'execution_audit.json',
  'governance_audit.json',
  'drift_telemetry.json',
  'mcp_sessions.json',
  'backup_state.json'
]);
const CHAT_FILES = new Set(['conversation.json', 'conversations.json']);
/** Machine-bound secret key file; only ever packed inside an *encrypted* backup */
const SECRET_KEY_FILES = new Set(['.zdr_master_key']);
const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

// ------------------------------------------------------------
// Paths & state
// ------------------------------------------------------------

export function getDataDir() {
  return process.env.BESTIE_DATA_DIR || path.join(os.homedir(), '.digital-bestie');
}
function snapshotsDir() { return path.join(getDataDir(), 'snapshots'); }
function statePath() { return path.join(getDataDir(), 'backup_state.json'); }

const DEFAULT_STATE = {
  last_export_at: null,
  last_mirror_at: null,
  last_snapshot_at: null,
  last_reminder_at: null,
  snoozed_until: null,
  changes_since_export: 0,
  credential_changed_since_export: false,
  mirror: { enabled: false, folder: '', passphrase_enc: '', last_error: '' }
};

export function loadBackupState() {
  try {
    if (fs.existsSync(statePath())) {
      const parsed = JSON.parse(fs.readFileSync(statePath(), 'utf-8'));
      return { ...DEFAULT_STATE, ...parsed, mirror: { ...DEFAULT_STATE.mirror, ...(parsed.mirror || {}) } };
    }
  } catch (err) {
    console.warn('[Backup] Could not read backup state:', err.message);
  }
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

export function saveBackupState(state) {
  writeFileAtomic(statePath(), JSON.stringify(state, null, 2));
}

function encryptionAvailable() {
  return !!(safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable());
}

// ------------------------------------------------------------
// Collect vault contents
// ------------------------------------------------------------

function isSecureEnvelope(parsed) {
  return !!(parsed && parsed._security && parsed._security.encrypted && parsed.payload);
}

/** List backup-eligible files in the data directory */
export function listVaultFiles({ includeChats = true, includeSecretKeys = false } = {}) {
  const dir = getDataDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isFile())
    .map(d => d.name)
    .filter(name => SAFE_NAME.test(name) && !name.endsWith('.tmp'))
    .filter(name => {
      if (EXCLUDED_FILES.has(name)) return false;
      if (SECRET_KEY_FILES.has(name)) return includeSecretKeys;
      if (CHAT_FILES.has(name)) return includeChats;
      return name.endsWith('.json');
    })
    .sort();
}

/**
 * Read every vault file into a portable structure.
 * Keychain-encrypted files are decrypted so they can be moved to another Mac.
 */
export function collectVaultData({ includeChats = true, includeSecretKeys = false } = {}) {
  const dir = getDataDir();
  const files = {};
  for (const name of listVaultFiles({ includeChats, includeSecretKeys })) {
    const text = fs.readFileSync(path.join(dir, name), 'utf-8');
    if (!name.endsWith('.json')) {
      files[name] = { type: 'text', text };
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      files[name] = { type: 'text', text }; // keep as-is; never silently drop data
      continue;
    }
    if (isSecureEnvelope(parsed)) {
      if (!encryptionAvailable()) {
        throw new Error(`Cannot read ${name}: macOS Keychain decryption is unavailable.`);
      }
      const decrypted = safeStorage.decryptString(Buffer.from(parsed.payload, 'base64'));
      files[name] = { type: 'secure-json', data: JSON.parse(decrypted) };
    } else {
      files[name] = { type: 'text', text };
    }
  }
  return files;
}

function readEntryData(entry) {
  if (!entry) return null;
  if (entry.type === 'secure-json') return entry.data;
  try { return JSON.parse(entry.text); } catch { return null; }
}

export function summarizeFiles(files) {
  const count = (name, pick) => {
    const data = readEntryData(files[name]);
    const val = pick(data);
    return Array.isArray(val) ? val.length : 0;
  };
  return {
    credentials: count('credentials_vault.json', d => d),
    conversations: count('conversations.json', d => d?.conversations),
    prompts: count('prompts_vault.json', d => d),
    tasks: count('taskflow.json', d => d?.tasks),
    has_profile: !!files['user_profile.json'],
    has_settings: !!files['settings.json']
  };
}

// ------------------------------------------------------------
// Encrypted backup file format
// ------------------------------------------------------------

function aadFor(header) {
  // Fixed key order so the authenticated header is reproducible on restore
  return Buffer.from(JSON.stringify({
    format: header.format,
    version: header.version,
    app_version: header.app_version,
    created_at: header.created_at,
    encrypted: header.encrypted,
    manifest: header.manifest
  }), 'utf-8');
}

/**
 * Build a backup document (object) from vault data.
 * passphrase === null → unencrypted (only allowed when the caller explicitly opts in)
 */
export async function buildBackupDocument({ passphrase, appVersion = '0.0.0', includeChats = true, allowUnencrypted = false } = {}) {
  const encrypted = passphrase !== null && passphrase !== undefined && passphrase !== '';
  if (!encrypted && !allowUnencrypted) {
    throw new Error('A backup passphrase is required.');
  }
  if (encrypted && String(passphrase).length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(`Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`);
  }

  const files = collectVaultData({ includeChats, includeSecretKeys: encrypted });
  const header = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    app_version: appVersion,
    created_at: new Date().toISOString(),
    encrypted,
    manifest: { files: Object.keys(files), counts: summarizeFiles(files), includes_chats: includeChats }
  };
  const compressed = zlib.gzipSync(Buffer.from(JSON.stringify({ files }), 'utf-8'));

  if (!encrypted) {
    return { ...header, payload: compressed.toString('base64') };
  }

  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = await pbkdf2(String(passphrase), salt, KDF_ITERATIONS, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aadFor(header));
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
  return {
    ...header,
    kdf: { name: 'PBKDF2-SHA256', iterations: KDF_ITERATIONS, salt: salt.toString('base64') },
    cipher: { name: 'AES-256-GCM', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') },
    payload: ciphertext.toString('base64')
  };
}

export async function createBackup({ destPath, passphrase, appVersion, includeChats = true, allowUnencrypted = false }) {
  const doc = await buildBackupDocument({ passphrase, appVersion, includeChats, allowUnencrypted });
  writeFileAtomic(destPath, JSON.stringify(doc));
  return { path: destPath, created_at: doc.created_at, encrypted: doc.encrypted, counts: doc.manifest.counts };
}

/** Convert the pre-2.5 plain JSON export ("Export Data" button) into backup entries */
function legacyExportToFiles(data) {
  const files = {};
  const put = (name, value) => { if (value !== undefined && value !== null) files[name] = { type: 'secure-json', data: value }; };
  put('user_profile.json', data.profile);
  put('settings.json', data.settings);
  if (data.conversationsStore) put('conversations.json', data.conversationsStore);
  else put('conversation.json', data.conversation);
  put('prompts_vault.json', data.promptsVault);
  put('credentials_vault.json', data.credentialsVault);
  return files;
}

/**
 * Open and (if needed) decrypt a backup file.
 * Returns { header, files }. Throws a friendly error on wrong passphrase / tampering.
 */
export async function openBackup(filePath, passphrase) {
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    throw new Error('This file is not a readable Digital Bestie backup.');
  }

  // Legacy plain-JSON export from older versions
  if (doc && doc.format !== BACKUP_FORMAT && (doc.profile || doc.credentialsVault || doc.settings)) {
    const files = legacyExportToFiles(doc);
    return {
      header: {
        format: 'legacy-json-export', version: 0, app_version: 'pre-2.5',
        created_at: doc.exportedAt || null, encrypted: false,
        manifest: { files: Object.keys(files), counts: summarizeFiles(files), includes_chats: !!(doc.conversationsStore || doc.conversation) }
      },
      files
    };
  }

  if (!doc || doc.format !== BACKUP_FORMAT) throw new Error('This file is not a Digital Bestie backup.');
  if (doc.version > BACKUP_VERSION) throw new Error('This backup was made by a newer version of Digital Bestie. Please update the app first.');

  let compressed;
  if (doc.encrypted) {
    if (!passphrase) throw new Error('This backup is encrypted. Enter its passphrase.');
    try {
      const key = await pbkdf2(String(passphrase), Buffer.from(doc.kdf.salt, 'base64'), doc.kdf.iterations, 32, 'sha256');
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(doc.cipher.iv, 'base64'));
      decipher.setAAD(aadFor(doc));
      decipher.setAuthTag(Buffer.from(doc.cipher.tag, 'base64'));
      compressed = Buffer.concat([decipher.update(Buffer.from(doc.payload, 'base64')), decipher.final()]);
    } catch {
      throw new Error('Wrong passphrase, or the backup file has been damaged.');
    }
  } else {
    compressed = Buffer.from(doc.payload, 'base64');
  }

  const { files } = JSON.parse(zlib.gunzipSync(compressed).toString('utf-8'));
  const { payload, kdf, cipher, ...header } = doc;
  return { header, files };
}

export async function inspectBackup(filePath, passphrase) {
  const { header } = await openBackup(filePath, passphrase);
  return {
    format: header.format,
    app_version: header.app_version,
    created_at: header.created_at,
    encrypted: header.encrypted,
    counts: header.manifest?.counts || {},
    includes_chats: !!header.manifest?.includes_chats,
    file_count: (header.manifest?.files || []).length
  };
}

/** Write restored entries into the data directory (re-encrypting with this Mac's Keychain) */
function writeEntries(files) {
  const dir = getDataDir();
  const written = [];
  for (const [name, entry] of Object.entries(files || {})) {
    // Path traversal defense: backups may only contain plain file names
    if (!SAFE_NAME.test(name) || name.includes('..') || name !== path.basename(name)) continue;
    if (EXCLUDED_FILES.has(name)) continue;
    const target = path.join(dir, name);
    if (entry.type === 'secure-json') {
      saveSecureJSON(target, entry.data);
    } else if (typeof entry.text === 'string') {
      writeFileAtomic(target, entry.text);
    } else {
      continue;
    }
    written.push(name);
  }
  return written;
}

export async function restoreBackup(filePath, passphrase) {
  const { header, files } = await openBackup(filePath, passphrase);
  const safety = createSnapshot({ kind: 'pre-restore' });
  const written = writeEntries(files);
  return { restored: written, safety_snapshot: safety.name, created_at: header.created_at, counts: header.manifest?.counts || {} };
}

// ------------------------------------------------------------
// Local snapshots
// ------------------------------------------------------------

function localDateStamp(d = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Raw copy of vault files (still Keychain-encrypted; this Mac only) */
export function createSnapshot({ kind = 'daily', now = new Date() } = {}) {
  const name = kind === 'daily'
    ? `daily-${localDateStamp(now)}`
    : `pre-restore-${now.toISOString().replace(/[:.]/g, '-')}`;
  const dest = path.join(snapshotsDir(), name);
  fs.mkdirSync(dest, { recursive: true, mode: 0o700 });
  const files = listVaultFiles({ includeChats: true, includeSecretKeys: true });
  for (const f of files) {
    fs.copyFileSync(path.join(getDataDir(), f), path.join(dest, f));
    try { fs.chmodSync(path.join(dest, f), 0o600); } catch { /* ignore */ }
  }
  fs.writeFileSync(path.join(dest, '_snapshot.json'), JSON.stringify({ kind, created_at: now.toISOString(), files }, null, 2), { mode: 0o600 });
  pruneSnapshots();
  return { name, files: files.length };
}

export function listSnapshots() {
  const dir = snapshotsDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory() && SAFE_NAME.test(d.name))
    .map(d => {
      const full = path.join(dir, d.name);
      let meta = {};
      try { meta = JSON.parse(fs.readFileSync(path.join(full, '_snapshot.json'), 'utf-8')); } catch { /* ignore */ }
      const files = fs.readdirSync(full).filter(f => f !== '_snapshot.json');
      const size = files.reduce((sum, f) => sum + fs.statSync(path.join(full, f)).size, 0);
      return {
        name: d.name,
        kind: meta.kind || (d.name.startsWith('pre-restore') ? 'pre-restore' : 'daily'),
        created_at: meta.created_at || fs.statSync(full).mtime.toISOString(),
        files: files.length,
        size_bytes: size
      };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function pruneSnapshots() {
  const all = listSnapshots();
  const daily = all.filter(s => s.kind === 'daily');
  const pre = all.filter(s => s.kind === 'pre-restore');
  const doomed = [...daily.slice(SNAPSHOT_RETENTION), ...pre.slice(PRE_RESTORE_RETENTION)];
  for (const s of doomed) {
    fs.rmSync(path.join(snapshotsDir(), s.name), { recursive: true, force: true });
  }
  return doomed.map(s => s.name);
}

export function createDailySnapshotIfNeeded(now = new Date()) {
  const state = loadBackupState();
  const today = localDateStamp(now);
  if (state.last_snapshot_at && localDateStamp(new Date(state.last_snapshot_at)) === today &&
      fs.existsSync(path.join(snapshotsDir(), `daily-${today}`))) {
    return { created: false };
  }
  if (listVaultFiles().length === 0) return { created: false }; // brand-new install, nothing to protect yet
  const snap = createSnapshot({ kind: 'daily', now });
  state.last_snapshot_at = now.toISOString();
  saveBackupState(state);
  return { created: true, ...snap };
}

export function restoreSnapshot(name) {
  if (!SAFE_NAME.test(name) || name.includes('..')) throw new Error('Invalid snapshot name.');
  const src = path.join(snapshotsDir(), name);
  if (!fs.existsSync(src)) throw new Error('Snapshot not found.');
  const safety = createSnapshot({ kind: 'pre-restore' });
  const restored = [];
  for (const f of fs.readdirSync(src)) {
    if (f === '_snapshot.json' || !SAFE_NAME.test(f)) continue;
    writeFileAtomic(path.join(getDataDir(), f), fs.readFileSync(path.join(src, f), 'utf-8'));
    restored.push(f);
  }
  return { restored, safety_snapshot: safety.name };
}

// ------------------------------------------------------------
// Milestones & reminder throttling
// ------------------------------------------------------------

export const MILESTONE_KINDS = ['credential', 'dossier', 'calibration', 'prompt', 'superbrain'];

let milestoneListener = null;
export function setMilestoneListener(fn) {
  milestoneListener = fn;
}

/** Pure decision function (unit-tested) */
export function shouldRemind(state, now = Date.now()) {
  if (state.mirror?.enabled && state.mirror?.folder && state.mirror?.passphrase_enc) return false;
  const enoughChanges = (state.changes_since_export || 0) >= 3 || !!state.credential_changed_since_export;
  if (!enoughChanges) return false;
  const lastOffDevice = Math.max(Date.parse(state.last_export_at || 0) || 0, Date.parse(state.last_mirror_at || 0) || 0);
  if (lastOffDevice && now - lastOffDevice < DAY_MS) return false;
  if (state.last_reminder_at && now - Date.parse(state.last_reminder_at) < DAY_MS) return false;
  if (state.snoozed_until && now < Date.parse(state.snoozed_until)) return false;
  return true;
}

/** Record a high-value change. Returns { remind, mirror } telling the caller what to do next. */
export function recordMilestone(kind, now = Date.now()) {
  const state = loadBackupState();
  state.changes_since_export = (state.changes_since_export || 0) + 1;
  if (kind === 'credential') state.credential_changed_since_export = true;
  const remind = shouldRemind(state, now);
  if (remind) state.last_reminder_at = new Date(now).toISOString();
  saveBackupState(state);
  const mirror = !!(state.mirror?.enabled && state.mirror?.folder && state.mirror?.passphrase_enc);
  if (typeof milestoneListener === 'function') {
    try {
      milestoneListener({ kind, remind, mirror, state });
    } catch (e) {
      console.warn('[Backup] Milestone listener error:', e);
    }
  }
  return { remind, mirror };
}

export function snoozeReminder(hours = 24, now = Date.now()) {
  const state = loadBackupState();
  state.snoozed_until = new Date(now + hours * 60 * 60 * 1000).toISOString();
  saveBackupState(state);
}

export function markExported(now = Date.now(), { viaMirror = false } = {}) {
  const state = loadBackupState();
  if (viaMirror) state.last_mirror_at = new Date(now).toISOString();
  else state.last_export_at = new Date(now).toISOString();
  state.changes_since_export = 0;
  state.credential_changed_since_export = false;
  saveBackupState(state);
}

// ------------------------------------------------------------
// Automatic encrypted copies to a folder (iCloud Drive / Dropbox / USB)
// ------------------------------------------------------------

export function configureMirror({ enabled, folder, passphrase }) {
  const state = loadBackupState();
  if (!enabled) {
    state.mirror = { ...DEFAULT_STATE.mirror };
    saveBackupState(state);
    return { enabled: false };
  }
  if (!folder || !fs.existsSync(folder)) throw new Error('Choose a folder that exists.');
  if (!passphrase || passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(`Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`);
  }
  if (!encryptionAvailable()) {
    throw new Error('Automatic copies need the macOS Keychain to remember your passphrase, and it is unavailable.');
  }
  state.mirror = {
    enabled: true,
    folder,
    passphrase_enc: safeStorage.encryptString(passphrase).toString('base64'),
    last_error: ''
  };
  saveBackupState(state);
  return { enabled: true, folder };
}

export async function mirrorIfConfigured({ appVersion, now = new Date() } = {}) {
  const state = loadBackupState();
  const m = state.mirror || {};
  if (!m.enabled || !m.folder || !m.passphrase_enc) return { mirrored: false, reason: 'not-configured' };
  try {
    if (!fs.existsSync(m.folder)) throw new Error('Backup folder is not available (drive disconnected or folder moved).');
    if (!encryptionAvailable()) throw new Error('macOS Keychain is unavailable.');
    const passphrase = safeStorage.decryptString(Buffer.from(m.passphrase_enc, 'base64'));
    const fileName = `digital-bestie-${localDateStamp(now)}.${BACKUP_EXTENSION}`;
    const dest = path.join(m.folder, fileName);
    await createBackup({ destPath: dest, passphrase, appVersion });
    // Keep the newest 7 dated copies in the folder
    const ours = fs.readdirSync(m.folder)
      .filter(f => /^digital-bestie-\d{4}-\d{2}-\d{2}\.bestie-backup$/.test(f))
      .sort().reverse();
    for (const old of ours.slice(SNAPSHOT_RETENTION)) fs.rmSync(path.join(m.folder, old), { force: true });
    markExported(now.getTime(), { viaMirror: true });
    const fresh = loadBackupState();
    fresh.mirror.last_error = '';
    saveBackupState(fresh);
    return { mirrored: true, path: dest };
  } catch (err) {
    const fresh = loadBackupState();
    fresh.mirror.last_error = err.message;
    saveBackupState(fresh);
    return { mirrored: false, reason: err.message };
  }
}

// ------------------------------------------------------------
// Status for the UI
// ------------------------------------------------------------

export function getBackupStatus() {
  const state = loadBackupState();
  const lastOffDevice = [state.last_export_at, state.last_mirror_at].filter(Boolean).sort().pop() || null;
  return {
    lastExportAt: state.last_export_at,
    lastMirrorAt: state.last_mirror_at,
    lastOffDeviceAt: lastOffDevice,
    lastSnapshotAt: state.last_snapshot_at,
    changesSinceExport: state.changes_since_export || 0,
    mirror: { enabled: !!state.mirror?.enabled, folder: state.mirror?.folder || '', lastError: state.mirror?.last_error || '' },
    snapshots: listSnapshots(),
    keychainAvailable: encryptionAvailable(),
    dataDir: getDataDir()
  };
}
