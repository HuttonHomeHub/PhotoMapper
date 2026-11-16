// Backups and restore through the shared kit: one zip holding a consistent snapshot of
// the database plus (unless BACKUP_INCLUDE_UPLOADS is off) the uploads folder, written
// to BACKUP_DIR on a schedule and on demand, pruned to BACKUP_KEEP of each kind.
import {
  createBackup,
  restoreBackup,
  startBackupScheduler,
  type BackupContext,
  type BackupSettings,
  type RestoreResult,
  type SchedulerStatus,
} from '@hhh/server';
import { config } from '../config.ts';
import { closeDb, getDb, openDb } from '../db.ts';
import { withLock } from '../lock.ts';
import { logger } from '../logger.ts';
import { backupDir, dbPath, uploadsDir } from '../paths.ts';

export const backupSettings: BackupSettings = {
  prefix: 'photomapper-backup',
  backupDir,
  dbPath,
  uploadsDir,
  includeUploads: config.backup.includeUploads,
  keep: config.backup.keep,
  maxRestoreBytes: config.backup.maxRestoreBytes,
  requiredTables: ['photos', 'projects', 'clients'],
};

export const backupContext: BackupContext = { settings: backupSettings, withLock, getDb };

/** Writes a backup into BACKUP_DIR (pruning old ones) and returns its path. */
export function backupNow(label?: string): Promise<string> {
  return createBackup(backupContext, label ? { label } : {});
}

/** A one-off backup written to `dir`, for download; nothing is pruned in BACKUP_DIR. */
export function backupTo(dir: string): Promise<string> {
  return createBackup({ ...backupContext, settings: { ...backupSettings, backupDir: dir } });
}

/** Replaces the database and uploads with the zip's, after the kit's checks. */
export function restoreFrom(zipPath: string): Promise<RestoreResult> {
  return restoreBackup(backupContext, zipPath, { closeDb, openDb, logger });
}

let scheduler: ReturnType<typeof startBackupScheduler> | undefined;

/** Starts the BACKUP_INTERVAL_HOURS schedule (not under test). Returns its stop function. */
export function startBackups(): () => void {
  scheduler = startBackupScheduler({
    enabled: config.backup.enabled,
    intervalHours: config.backup.intervalHours,
    run: () => backupNow(),
    logger,
  });
  return scheduler.stop;
}

export function schedulerStatus(): SchedulerStatus {
  return (
    scheduler?.status() ?? {
      enabled: config.backup.enabled,
      intervalHours: config.backup.intervalHours,
    }
  );
}
