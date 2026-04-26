# notify-followups — daily push reminder

Sends a daily Expo Push notification to every active user with a registered device token, summarising today's follow-ups + meetings + tasks. Tap → mobile app deep-links to Plan tab with the "Today" chip pre-selected.

## Deploy

```bash
# 1. Apply the migration that adds users.expo_push_token + notification_log:
psql "$SUPABASE_DB_URL" -f supabase/push_notifications_v1.sql

# 2. Deploy the function
supabase functions deploy notify-followups
```

## Schedule daily 9 AM dispatch

Two equivalent options — pick one:

### Option A — Postgres cron (recommended)

```sql
-- Enable pg_cron once per project
create extension if not exists pg_cron with schema extensions;

-- Replace <PROJECT_REF> with your project ref (the part before .supabase.co)
-- Replace <ANON_OR_SERVICE_KEY> with your service-role key for auth
select cron.schedule(
  'daily-followup-9am',         -- job name
  '0 9 * * *',                  -- 9:00 daily, UTC by default
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/notify-followups',
    headers := jsonb_build_object('Authorization', 'Bearer <SERVICE_ROLE_KEY>')
  );
  $$
);
```

### Option B — Supabase Dashboard scheduled function

1. Open Supabase dashboard → Functions → notify-followups → Schedule
2. Add cron expression `0 9 * * *`
3. Save

## Manual trigger (debugging)

```bash
curl -X POST https://<PROJECT>.supabase.co/functions/v1/notify-followups \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
```

Returns `{ ok: true, dispatched: <n> }` or an error.

## What gets sent

Per user, IF they have any of:
- `leads.next_call = today` (they own)
- `events.date = today` (they own)
- `activities.date = today AND status = 'Planned'` (they own)

Title is composed dynamically — e.g. *"3 follow-ups, 1 meeting today"*.

Users with zero items today are skipped (we don't send "you have 0 things").

## Env vars

| Var | Required | Notes |
|---|---|---|
| `SUPABASE_URL` | yes | Auto-injected by Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Auto-injected; needed to bypass RLS for the all-users count query |
| `EXPO_ACCESS_TOKEN` | no | Only required if "Enhanced Push Security" is enabled in Expo dashboard |

## Audit

Every send writes a row to `notification_log` with status from Expo's response. Users see their own rows via the `notification_log_self_read` RLS policy; admins/MD/director see all.

```sql
-- Last 24h dispatch summary
select
  kind,
  count(*) total,
  count(*) filter (where expo_status = 'ok') ok,
  count(*) filter (where expo_status = 'error') errors
from notification_log
where sent_at > now() - interval '24 hours'
group by kind;
```

## What's NOT in this function (deferred)

- **30-min-before-meeting reminder** — needs a separate cron running every minute, more complex scheduling. Future PR.
- **Per-user timezone** — today the cron fires at 9 AM UTC. For India-only orgs this is 14:30 IST, which is wrong. Either change the cron to `30 3 * * *` (9 AM IST) or, for multi-timezone, store user timezone and dispatch per-tz from the function. Future PR.
- **Open / click tracking** — Expo's push receipts API has it; we'd poll receipts the next morning. Future PR.
