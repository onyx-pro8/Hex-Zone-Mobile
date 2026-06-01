# Hex Zone Mobile

React Native (Expo **SDK 54**) + TypeScript mobile client for the [Zone Weaver API](https://zone-weaver-wwws2.ondigitalocean.app/).

Dark **UAX-inspired** UI: black backgrounds, neon magenta accents, rounded cards, and bottom tab navigation.

## Stack

| Layer | Version |
|-------|---------|
| Expo SDK | 54 |
| React Native | 0.81 |
| React | 19.1 |
| Expo Router | 6 |
| Reanimated | 4 (New Architecture) |
| NativeWind | 4 |
| TypeScript | 5.9 |

## Features

| Area | Mobile implementation |
|------|----------------------|
| Auth | Welcome splash, login, signup, PIN verification screen |
| Dashboard | 7 zone types (Grid, Geofence, Proximity, Dynamic, Communal ID, Government code, Object), map draw/preview, `GET /zones/capabilities`, validate/generate reference, dynamic preview |
| Members | Linked account roster |
| Messages | Inbox with category filters — **push notifications** instead of WebSocket |
| Access | Member invite QR, guest access QR, pending arrivals approve/reject |
| Guest passes | List + accept/reject/revoke |
| Devices | Registered device list (auto-enrolled on login) |
| Settings | Profile, push status, logout |

## Backend

Default API URL:

```
https://zone-weaver-wwws2.ondigitalocean.app
```

Override with `.env`:

```bash
cp .env.example .env
# edit EXPO_PUBLIC_API_BASE_URL if needed
```

## Push notifications (Messages)

The web client uses WebSockets for live message delivery. On mobile, **Expo Push Notifications** are used instead:

1. On login, the app requests notification permission (dev/production builds only).
2. An Expo push token is registered via `POST /devices/push-token`.
3. The device is also enrolled under `/devices/` with `enable_notification: true`.
4. When a push arrives (foreground or background), the Messages screen refreshes from `GET /messages/`.
5. A polling fallback keeps the inbox fresh while the app is open.

### Expo Go vs development build

**Remote push does not work in Expo Go on SDK 53+ (Android).** This is an Expo platform limit, not a bug in this app. In Expo Go:

- The app skips push token registration and polls the inbox every **30 seconds**.
- Pull-to-refresh on Messages still works.

To test **real push notifications**, create a development build:

```bash
# Android (requires Android Studio / SDK)
npx expo run:android

# iOS (macOS + Xcode)
npx expo run:ios
```

Or use [EAS Build](https://docs.expo.dev/develop/development-builds/introduction/) for a installable dev client.

> **Production:** Set a real `projectId` in `app.json` → `extra.eas.projectId` and configure FCM (Android) / APNs (iOS) in Expo.

## Getting started

Requirements: Node 20+, Expo Go (SDK 54) or a dev build on a physical device (push requires a real device).

> **New Architecture is enabled by default** in this project (required for Reanimated 4). When using Expo Go on Android, you may see "fabric" enabled by default.

```bash
cd Hex-Zone-Mobile
npm install
npm start
```

Then press `a` for Android or `i` for iOS in the Expo CLI, or scan the QR code with Expo Go.

## Project structure

```
Hex-Zone-Mobile/
├── app/                  # Expo Router screens
│   ├── (auth)/           # Welcome, login, signup, PIN
│   └── (tabs)/           # Main app tabs
├── src/
│   ├── api/              # REST client mirroring web frontend
│   ├── components/ui/    # Shared UI (Button, Input, Card…)
│   ├── context/          # Auth + notification providers
│   ├── hooks/            # useMessagesFeed
│   ├── lib/              # Storage, push helpers
│   └── theme/            # Colors & gradients
└── assets/               # App icons & splash
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start Expo dev server |
| `npm run android` | Open on Android |
| `npm run ios` | Open on iOS |
| `npm run typecheck` | Run TypeScript check |

## Related projects

- `Hex-Zone-Client/` — existing Vite web frontend
- `server/` — FastAPI backend
