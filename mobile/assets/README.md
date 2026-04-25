# Mobile assets

Drop these PNGs here before the first `eas build`. Expo will substitute
defaults during `expo start` dev runs if they're missing, but production
builds need the real artefacts.

| File | Size | Purpose |
|---|---|---|
| `icon.png` | 1024×1024 | App store / launcher icon |
| `adaptive-icon.png` | 1024×1024 | Android 8+ adaptive icon foreground (will sit on a `#1B6B5A` background per `app.json`) |
| `splash.png` | 1284×2778 (or any 9:19.5) | Splash screen, shown on cold-start |
| `notification-icon.png` | 96×96, alpha-only white silhouette | Push notification status-bar icon (Android) |
| `favicon.png` | 48×48 | Used only for the unused `expo start --web` mode |

Until these land, dev mode still works — Expo picks defaults. The
**SmartCRM** brand mark + the existing brand color (`#1B6B5A`) are the
right base for the icon set; ask design for the export.
