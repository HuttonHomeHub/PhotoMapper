import { BackupsCard, InstanceInfoCard, SettingsCard, SettingsPanel } from '@hhh/ui';
import { useSettings } from '../hooks/useSettings.js';

const MB = 1024 * 1024;

function formatSize(bytes) {
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatWhen(iso) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function backupStatus(data) {
  const { scheduler, backups } = data;
  if (scheduler.lastError) return { tone: 'danger', label: 'Last scheduled backup failed' };
  if (!data.enabled) return { tone: 'neutral', label: 'Schedule off' };
  const latest = scheduler.lastSuccessAt ?? backups[0]?.createdAt;
  if (latest) return { tone: 'success', label: `Latest ${formatWhen(latest)}` };
  return { tone: 'warning', label: 'No backups yet' };
}

function scheduleText(data) {
  const every = data.intervalHours === 24 ? 'Daily' : `Every ${data.intervalHours} h`;
  const what = data.includeUploads ? 'database and photos' : 'database only';
  const next = data.scheduler.nextRunAt ? `, next ${formatWhen(data.scheduler.nextRunAt)}` : '';
  return data.enabled
    ? `${every}, ${what}, keeping ${data.keep}${next}`
    : `Scheduled backups are off (BACKUP_ENABLED); back up by hand below`;
}

/** The gear's panel: this instance's set-up and its backups. */
export function SettingsDialog({ open, onClose, onRestored }) {
  const { info, backups, error, backupNow, restore, uploadRestore } = useSettings(open);

  return (
    <SettingsPanel open={open} onClose={onClose}>
      {error ? (
        <SettingsCard title="Settings unavailable">
          <p>{error}</p>
        </SettingsCard>
      ) : null}
      {info ? (
        <InstanceInfoCard
          info={{
            version: info.version,
            counts: [
              {
                label: 'Library',
                value: `${info.counts.photos} photos · ${info.counts.projects} projects · ${info.counts.clients} clients`,
              },
            ],
            paths: info.paths,
            limits: [
              { label: 'Max upload', value: `${info.limits.maxUploadMb} MB per photo` },
              {
                label: 'API rate limit',
                value: `${info.limits.apiRate.limit} per ${Math.round(info.limits.apiRate.windowMs / 60000)} min`,
              },
            ],
            trustProxyHops: info.trustProxyHops,
          }}
        />
      ) : null}
      {backups ? (
        <BackupsCard
          status={backupStatus(backups)}
          schedule={scheduleText(backups)}
          backups={backups.backups.map((b) => ({
            name: b.name,
            size: formatSize(b.size),
            created: formatWhen(b.createdAt),
          }))}
          freshDownloadHref="/api/backup/download"
          downloadHref={(name) => `/api/backup/download/${encodeURIComponent(name)}`}
          onBackupNow={backupNow}
          onRestore={async (name) => {
            await restore(name);
            await onRestored();
          }}
          onUploadRestore={async (file) => {
            await uploadRestore(file);
            await onRestored();
          }}
        />
      ) : null}
    </SettingsPanel>
  );
}
