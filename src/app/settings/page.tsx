import { SettingsBoard } from '@/components/settings/SettingsBoard';
import { Page } from '@/components/shell/Page';
import * as api from '@/lib/api';
import { fmtWeekdayTime } from '@/lib/format';

export default async function SettingsPage() {
  const settings = api.getSettings();
  const usage = (list: api.SettingsList, names: string[]) => names.map((name) => ({ name, used: api.listUsage(list, name) }));
  return (
    <Page title="Settings" meta="contexts, buckets, calendars, review checklist" phone={{ meta: null }}>
      <SettingsBoard
        contexts={usage('context', settings.contexts)}
        followUpContext={settings.followUpContext}
        buckets={usage('bucket', settings.buckets)}
        calendars={api.listExternalCalendars().map((c) => ({
          key: c.sourceId ?? `demo:${c.name}`,
          name: c.name,
          via: c.via,
          ...(c.sourceId && { host: c.host ?? '' }),
          ...(c.lastSyncAt && { lastSync: fmtWeekdayTime(c.lastSyncAt, api.timeZone()) }),
          ...(c.lastError && { error: c.lastError }),
        }))}
        canSync={api.configuredSources().length > 0}
        timezone={settings.timezone}
        serverZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
        zones={Intl.supportedValuesOf('timeZone')}
        template={settings.reviewTemplate}
        stepLinks={api.STEP_LINKS}
      />
    </Page>
  );
}
