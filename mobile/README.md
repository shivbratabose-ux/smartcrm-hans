# SmartCRM Mobile

React Native + Expo app for the SmartCRM sales team. Connects to the same
Supabase backend as the web app — no schema changes, no separate API,
shared RLS. Android first; iOS works from the same codebase when needed.

## What's in the box

| Area | Status |
|---|---|
| **Auth** | Email + password (matches web app); OTP / magic-link wired but disabled until SMS provider is configured |
| **Dashboard** | Today's follow-ups, new leads assigned, pending tasks, upcoming meetings, 4 quick-action buttons |
| **Leads** | List + instant search + detail + inline status update + add remark + create-new-lead form |
| **Contacts** | List + search + detail + create new contact |
| **Activity log** | Today's calls + meetings + pending follow-ups |
| **Click-to-call** | `tel:` deep link from any phone field |
| **WhatsApp** | `whatsapp://send?phone=...&text=...` deep link |
| **Email** | `mailto:` deep link |
| **Offline** | All read paths cached via TanStack Query + AsyncStorage; writes queue and replay on reconnect |
| **Push notifications** | Expo Notifications wired (server-side broadcast is a Phase 2 follow-up) |

## Architecture

- **Expo SDK 51** managed workflow — no Android Studio required for dev; `eas build` for store releases
- **TypeScript** strict mode
- **React Navigation** (bottom tabs + native stack)
- **TanStack Query v5** for data fetching + offline cache
- **AsyncStorage** for the cache persister
- **Supabase JS v2** — same instance as the web app
- **Single source of truth for the schema:** the existing JSONB tables. The mobile app reads/writes the same rows, governed by the same RLS policies.

## Prerequisites

- Node 18+
- Android: Android device with developer mode + USB debugging, OR Android Studio emulator
- iOS (optional): Xcode 15+

## Setup

```bash
cd mobile
npm install
cp .env.example .env
# Paste the SAME values that the web app uses in its .env:
#   EXPO_PUBLIC_SUPABASE_URL=...
#   EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

## Run on a real Android device (fastest path)

1. Install **Expo Go** from the Play Store on the device.
2. `npm run start` — Metro bundler boots and prints a QR code.
3. Scan the QR with Expo Go. The app loads over the local network.

Reload after code changes: shake the device → tap *Reload*. Or use the dev menu via `npm run start` then `r`.

## Run on an Android emulator

```bash
# 1. Start an emulator from Android Studio first
npm run android
```

## Build a production APK / AAB for Play Store

```bash
# One-time
npm install -g eas-cli
eas login
eas build:configure

# APK for sideloading / internal testing
eas build --platform android --profile preview

# AAB for Play Store
eas build --platform android --profile production
```

The signed artefact lands on EAS's servers — download link in the CLI output.

## Project layout

```
mobile/
├── App.tsx                     Root: Providers + navigation
├── app.json                    Expo config (icons, splash, permissions)
├── package.json
├── tsconfig.json
├── babel.config.js
├── .env.example
└── src/
    ├── theme.ts                Color tokens + typography
    ├── lib/
    │   ├── supabase.ts         Supabase client (auth + storage)
    │   └── queryClient.ts      TanStack Query + AsyncStorage persister
    ├── auth/
    │   ├── AuthContext.tsx     Session + role gating
    │   └── LoginScreen.tsx     Password + OTP UI
    ├── screens/
    │   ├── DashboardScreen.tsx
    │   ├── LeadsScreen.tsx     List + search
    │   ├── LeadDetailScreen.tsx
    │   ├── NewLeadScreen.tsx
    │   ├── ContactsScreen.tsx
    │   ├── NewContactScreen.tsx
    │   └── ActivityLogScreen.tsx
    ├── components/             Shared UI (KpiCard, Row, Button, ...)
    ├── hooks/                  useLeads / useContacts / useActivities
    └── utils/
        ├── dial.ts             tel: / whatsapp: / mailto: helpers
        └── format.ts
```

## Sharing with the web app

The mobile app is intentionally **not** a code-sharing monorepo (yet) — it has its own `package.json` and `node_modules` so the web app's build pipeline never sees React Native dependencies. They share data only via Supabase.

If we want shared TypeScript types later, the next step is hoisting `web/src/data/seed.js` constants into a `packages/shared/` workspace. That can wait; today we hardcode the small enum lists the mobile app needs.

## Permissions Android requests

| Permission | Why |
|---|---|
| `INTERNET` | Talk to Supabase |
| `READ_PHONE_STATE` (optional) | Click-to-call confirmation |
| `POST_NOTIFICATIONS` (Android 13+) | Reminder push |

No microphone / camera / contacts access — feature-creep we don't need today.

## What's NOT in this PR (deliberately)

- iOS configuration / TestFlight upload (codebase is iOS-ready; one `eas build --platform ios` away)
- Server-side push notification scheduling (the client SDK is wired; the cron / Supabase edge function that fires daily-followup reminders is Phase 2)
- Calendar sync with Google / Outlook (pending the same web-app feature)
- Field-sales geo check-in (Phase 2)
- Performance summary charts (Phase 2 — needs the lightweight charts library decision: Victory Native vs. Recharts-Native)

These are wired as `// TODO Phase 2` markers throughout the code where relevant.
