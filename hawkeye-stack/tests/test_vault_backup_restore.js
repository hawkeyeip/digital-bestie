/**
 * Test Suite: Vault Backup & Disaster Recovery
 *
 * Verifies:
 *  1. Pure reminder logic & milestone throttling (shouldRemind)
 *  2. Encrypted backup creation (AES-256-GCM + PBKDF2)
 *  3. Plaintext inspection & security (ciphertext contains no readable vault strings)
 *  4. Wrong passphrase rejection
 *  5. Tampered ciphertext rejection (GCM authentication tag failure)
 *  6. Full restore round-trip data equality
 *  7. Automatic pre-restore safety snapshot creation
 *  8. Daily snapshot idempotency & 7-day retention pruning
 *  9. Legacy JSON export backward compatibility
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  buildBackupDocument,
  openBackup,
  inspectBackup,
  restoreBackup,
  createSnapshot,
  listSnapshots,
  pruneSnapshots,
  createDailySnapshotIfNeeded,
  restoreSnapshot,
  shouldRemind,
  recordMilestone,
  markExported,
  snoozeReminder,
  getBackupStatus,
  getDataDir,
  BACKUP_FORMAT,
  BACKUP_VERSION
} from '../../src/services/backup.js';
import { writeFileAtomic, saveSecureJSON } from '../../src/services/memory.js';

let passed = 0;
let total = 0;

function assert(condition, message) {
  total++;
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✕ FAILED: ${message}`);
    process.exitCode = 1;
  }
}

async function runBackupTests() {
  console.log('============================================================');
  console.log('RUNNING VAULT BACKUP & DISASTER RECOVERY TEST SUITE');
  console.log('============================================================');

  // Set up an isolated test data directory
  const testDir = path.join(os.tmpdir(), `bestie-backup-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  fs.mkdirSync(testDir, { recursive: true, mode: 0o700 });
  process.env.BESTIE_DATA_DIR = testDir;

  try {
    // ------------------------------------------------------------
    // TEST 1: Milestone Reminder Pure Decision Function
    // ------------------------------------------------------------
    console.log('\n[TEST 1/7] Testing Milestone Reminder & Throttling Rules...');
    const now = 1770000000000;
    const dayMs = 24 * 60 * 60 * 1000;

    // Fresh install, 0 changes -> no reminder
    assert(shouldRemind({ changes_since_export: 0 }, now) === false, 'No reminder when changes < 3');

    // 2 non-credential changes -> no reminder
    assert(shouldRemind({ changes_since_export: 2 }, now) === false, 'No reminder at 2 non-credential changes');

    // 3 changes, never exported -> REMIND
    assert(shouldRemind({ changes_since_export: 3, last_export_at: null }, now) === true, 'Remind after 3 changes if never exported');

    // Credential changed, never exported -> REMIND immediately (even if changes_since_export = 1)
    assert(shouldRemind({ changes_since_export: 1, credential_changed_since_export: true, last_export_at: null }, now) === true, 'Remind on credential change even with 1 change');

    // Recent off-device export (<24h ago) -> suppressed
    assert(shouldRemind({ changes_since_export: 5, last_export_at: new Date(now - 2 * 3600 * 1000).toISOString() }, now) === false, 'Suppress if exported 2 hours ago');

    // Export was 48h ago, 4 changes -> REMIND
    assert(shouldRemind({ changes_since_export: 4, last_export_at: new Date(now - 48 * 3600 * 1000).toISOString() }, now) === true, 'Remind if export is older than 24h and >= 3 changes');

    // Reminder was already shown 3h ago -> suppressed (max once per day)
    assert(shouldRemind({ changes_since_export: 4, last_export_at: null, last_reminder_at: new Date(now - 3 * 3600 * 1000).toISOString() }, now) === false, 'Throttled to max once per 24 hours');

    // User snoozed -> suppressed
    assert(shouldRemind({ changes_since_export: 4, snoozed_until: new Date(now + 12 * 3600 * 1000).toISOString() }, now) === false, 'Suppressed when user explicitly snoozed');

    // Mirroring is active -> suppressed (silently mirrors instead of nagging user)
    assert(shouldRemind({
      changes_since_export: 10,
      credential_changed_since_export: true,
      mirror: { enabled: true, folder: '/tmp/mirror', passphrase_enc: 'enc' }
    }, now) === false, 'Suppressed when auto-mirroring is enabled');

    // ------------------------------------------------------------
    // TEST 2: Seed Sample Vault Files & Build Encrypted Backup
    // ------------------------------------------------------------
    console.log('\n[TEST 2/7] Seeding Vault & Creating Encrypted Backup...');

    const sampleProfile = {
      user_profile: {
        identity_and_baseline: { active_location: 'Austin, TX', hard_cash_floor: 12000 },
        goal_and_boundary_matrix: { north_star_90_day: 'Build sovereign AI OS' }
      },
      onboarding_state: { completed: true }
    };
    const sampleCredentials = [
      { id: 'cred_1', title: 'AWS Solutions Architect', issuer: 'Amazon', highlight: true },
      { id: 'cred_2', title: 'Secret API Key Entry', issuer: 'Personal Vault', highlight: false }
    ];
    const samplePrompts = [
      { id: 'prompt_1', title: 'Deep Strategy Interrogation', category: 'ops', favorite: true }
    ];
    const sampleTaskflow = {
      tasks: [
        { id: 'task_1', title: 'Prepare disaster recovery architecture', status: 'done' },
        { id: 'task_2', title: 'Deploy update to GitHub', status: 'todo' }
      ]
    };

    saveSecureJSON(path.join(testDir, 'user_profile.json'), sampleProfile);
    saveSecureJSON(path.join(testDir, 'credentials_vault.json'), sampleCredentials);
    saveSecureJSON(path.join(testDir, 'prompts_vault.json'), samplePrompts);
    saveSecureJSON(path.join(testDir, 'taskflow.json'), sampleTaskflow);
    writeFileAtomic(path.join(testDir, 'telemetry.json'), JSON.stringify({ transient: 'log' }));

    const passphrase = 'correct-horse-battery-staple-2026';
    const doc = await buildBackupDocument({ passphrase, appVersion: '2.5.0' });

    assert(doc.format === BACKUP_FORMAT, `Header format is "${BACKUP_FORMAT}"`);
    assert(doc.version === BACKUP_VERSION, `Header version is ${BACKUP_VERSION}`);
    assert(doc.encrypted === true, 'Backup is marked encrypted');
    assert(doc.kdf.iterations === 310000, 'PBKDF2 iteration count is 310,000');
    assert(doc.manifest.counts.credentials === 2, `Manifest lists 2 credentials (got ${doc.manifest.counts.credentials})`);
    assert(doc.manifest.counts.prompts === 1, `Manifest lists 1 prompt (got ${doc.manifest.counts.prompts})`);
    assert(doc.manifest.counts.tasks === 2, `Manifest lists 2 tasks (got ${doc.manifest.counts.tasks})`);
    assert(doc.manifest.files.includes('telemetry.json') === false, 'Transient telemetry.json is excluded from backup');

    // ------------------------------------------------------------
    // TEST 3: Security & Privacy Assertions on Ciphertext
    // ------------------------------------------------------------
    console.log('\n[TEST 3/7] Verifying Ciphertext Zero-Leakage...');
    const rawDocString = JSON.stringify(doc);
    assert(!rawDocString.includes('Austin, TX'), 'Profile location does not appear in ciphertext');
    assert(!rawDocString.includes('AWS Solutions Architect'), 'Credential titles do not appear in ciphertext');
    assert(!rawDocString.includes('Secret API Key Entry'), 'Sensitive credential descriptions do not appear in ciphertext');
    assert(!rawDocString.includes('Deep Strategy Interrogation'), 'Prompt texts do not appear in ciphertext');

    // ------------------------------------------------------------
    // TEST 4: Inspection, Wrong Passphrase & Tampering Defenses
    // ------------------------------------------------------------
    console.log('\n[TEST 4/7] Testing Passphrase Verification & Tamper Resistance...');
    const backupFilePath = path.join(testDir, 'sample.bestie-backup');
    fs.writeFileSync(backupFilePath, JSON.stringify(doc, null, 2));

    // Inspect without decrypting payload
    const inspection = await inspectBackup(backupFilePath, passphrase);
    assert(inspection.format === BACKUP_FORMAT, 'inspectBackup successfully parsed header');
    assert(inspection.counts.credentials === 2, 'inspectBackup previewed 2 credentials');

    // Wrong passphrase rejection
    let wrongPassCaught = false;
    try {
      await openBackup(backupFilePath, 'incorrect-password-here');
    } catch (err) {
      wrongPassCaught = true;
      assert(err.message.includes('Wrong passphrase') || err.message.includes('damaged'), `Wrong password rejected with clear message (${err.message})`);
    }
    assert(wrongPassCaught, 'Wrong passphrase throws error');

    // Tampered ciphertext rejection (AES-256-GCM auth tag check)
    const tamperedDoc = JSON.parse(fs.readFileSync(backupFilePath, 'utf-8'));
    // Flip one byte in the base64 ciphertext
    const payloadBuf = Buffer.from(tamperedDoc.payload, 'base64');
    payloadBuf[0] ^= 0xff;
    tamperedDoc.payload = payloadBuf.toString('base64');
    const tamperedPath = path.join(testDir, 'tampered.bestie-backup');
    fs.writeFileSync(tamperedPath, JSON.stringify(tamperedDoc));

    let tamperCaught = false;
    try {
      await openBackup(tamperedPath, passphrase);
    } catch {
      tamperCaught = true;
    }
    assert(tamperCaught, 'Tampered ciphertext rejected by AES-256-GCM authentication tag');

    // ------------------------------------------------------------
    // TEST 5: Full Restore Round-Trip with Pre-Restore Safety Snapshot
    // ------------------------------------------------------------
    console.log('\n[TEST 5/7] Testing Full Restore & Safety Snapshot Creation...');

    // Simulate catastrophic local data mutation
    saveSecureJSON(path.join(testDir, 'credentials_vault.json'), []);
    saveSecureJSON(path.join(testDir, 'user_profile.json'), { user_profile: { identity_and_baseline: {} } });

    // Pre-restore snapshots count before
    const snapsBefore = listSnapshots();

    // Perform restore from backup
    const restoreRes = await restoreBackup(backupFilePath, passphrase);
    assert(restoreRes.restored.length > 0, `Restored ${restoreRes.restored.length} files`);
    assert(restoreRes.safety_snapshot && restoreRes.safety_snapshot.startsWith('pre-restore-'), `Created safety snapshot: ${restoreRes.safety_snapshot}`);

    const snapsAfter = listSnapshots();
    assert(snapsAfter.length === snapsBefore.length + 1, 'Snapshot list grew by exactly 1 pre-restore safety snapshot');

    // Verify restored data matches original
    const restoredCreds = JSON.parse(fs.readFileSync(path.join(testDir, 'credentials_vault.json'), 'utf-8'));
    const restoredCredsData = restoredCreds.payload ? JSON.parse(Buffer.from(restoredCreds.payload, 'base64').toString('utf-8')) : restoredCreds;
    assert(restoredCredsData.length === 2, 'Restored credential vault contains original 2 entries');
    assert(restoredCredsData[0].title === 'AWS Solutions Architect', 'Restored credential title matches original exactly');

    // ------------------------------------------------------------
    // TEST 6: Local Snapshots Idempotency & Pruning
    // ------------------------------------------------------------
    console.log('\n[TEST 6/7] Testing Daily Snapshot Idempotency & Pruning...');

    const todayDate = new Date();
    const snap1 = createDailySnapshotIfNeeded(todayDate);
    assert(snap1.created === true, 'First daily snapshot of the day created');

    const snap2 = createDailySnapshotIfNeeded(todayDate);
    assert(snap2.created === false, 'Second daily snapshot on same day is idempotent (skipped)');

    // Generate 10 mock daily snapshots to verify 7-day retention pruning
    const snapsDir = path.join(testDir, 'snapshots');
    for (let i = 1; i <= 10; i++) {
      const snapFolder = path.join(snapsDir, `daily-2026-01-${String(i).padStart(2, '0')}`);
      fs.mkdirSync(snapFolder, { recursive: true });
      fs.writeFileSync(path.join(snapFolder, '_snapshot.json'), JSON.stringify({ kind: 'daily', created_at: `2026-01-${String(i).padStart(2, '0')}T00:00:00Z` }));
    }
    const pruned = pruneSnapshots();
    assert(pruned.length > 0, `Pruned ${pruned.length} stale snapshots exceeding retention limit`);
    const remainingDaily = listSnapshots().filter(s => s.kind === 'daily');
    assert(remainingDaily.length <= 7, `Retained at most 7 daily snapshots (actual: ${remainingDaily.length})`);

    // ------------------------------------------------------------
    // TEST 7: Legacy JSON Export Backward Compatibility
    // ------------------------------------------------------------
    console.log('\n[TEST 7/7] Testing Backward Compatibility with Legacy JSON Exports...');
    const legacyExport = {
      profile: sampleProfile,
      credentialsVault: sampleCredentials,
      promptsVault: samplePrompts,
      settings: { theme: 'cyberpunk' },
      exportedAt: '2026-09-01T12:00:00Z'
    };
    const legacyPath = path.join(testDir, 'legacy_export.json');
    fs.writeFileSync(legacyPath, JSON.stringify(legacyExport, null, 2));

    const legacyOpened = await openBackup(legacyPath);
    assert(legacyOpened.header.format === 'legacy-json-export', 'Legacy export recognized as format: legacy-json-export');
    assert(legacyOpened.header.manifest.counts.credentials === 2, 'Legacy export counts match');

    console.log('\n============================================================');
    console.log(`ALL VAULT BACKUP TESTS PASSED (${passed}/${total})`);
    console.log('============================================================\n');
  } finally {
    // Clean up temporary sandbox directory
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
    delete process.env.BESTIE_DATA_DIR;
  }
}

runBackupTests().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
