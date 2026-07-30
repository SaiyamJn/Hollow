# Hollow — mobile app spec (React Native + Expo)

## Setup

```
npx create-expo-app mobile -t expo-template-blank-typescript
```

Reuse the same TypeScript types and API client shape as the web app. If this
becomes a monorepo, put shared types/API client in `packages/shared` and
import from both `frontend/` and `mobile/`.

## Navigation

Bottom tab navigator (`@react-navigation/bottom-tabs`), same four sections as
the web sidebar tabs: Notebooks, Quick notes, Tasks, Graph. A separate stack
screen for Settings (theme toggle, account, logout), reachable from a header
icon.

## Auth & token storage

- Use `expo-secure-store` for the JWT, not `AsyncStorage` — this is the
  mobile equivalent of not putting a token somewhere trivially readable.
- On app launch, read the token from SecureStore; if present, validate by
  calling a lightweight authenticated endpoint (e.g. `GET /notebooks`) before
  showing the main app; fall back to the login screen on failure.

## Theming

Same CSS-variable-equivalent approach conceptually: a `ThemeContext` mirroring
the web `ThemeProvider`, but persisting the choice via SecureStore (or
AsyncStorage, since theme preference isn't sensitive) instead of
`localStorage`. Dark by default. Drive colors through a small `theme.ts`
constants object (React Native has no CSS variables) with the same hex values
as the web `globals.css` light/dark blocks, and read `theme === "dark" ?
darkColors : lightColors` in each styled component.

## Networking specifics for mobile

- **Token refresh / backgrounding**: on `AppState` change to `active`, check
  token expiry and prompt re-login if expired rather than silently failing
  mid-session.
- **Socket reconnect**: on network change (Wi-Fi <-> cellular, detected via
  `@react-native-community/netinfo`), tear down and re-create the Socket.io
  connection rather than assuming it survives the handoff.
- **Offline write queue**: when a request fails due to no connectivity,
  append `{ method, url, body }` to a local queue (AsyncStorage-backed).
  On reconnect (NetInfo listener), replay the queue in order, then clear it.
  Once collaborative editing (Yjs) is wired in per the backend doc, this
  queue mostly matters for non-page actions (creating tasks/quick notes
  offline); Yjs handles offline page edits merging automatically once the
  document resyncs.
- **Locked sections**: same in-memory-only password handling as web — hold
  it in a React context/state, never write it to SecureStore or AsyncStorage.

## Screens (mirror the web feature set)

- Notebooks: tree view adapted to mobile (expandable list rows instead of a
  desktop sidebar tree); tapping a page opens a native-feeling BlockNote-
  equivalent editor (`@10play/tentap-editor` or a simple markdown editor if a
  full block editor proves too heavy on mobile — note this as an open
  implementation choice).
- Quick notes: card grid, same fields as web (color, pin, archive).
- Tasks: same grouped-by-due-date list, with an optional Expo push
  notification reminder near `dueAt` (stretch goal, not required for v1).
- Graph: either a simplified list of backlinks per page (recommended for
  v1, since a force-directed graph is harder to make usable on a small
  screen) or a pinch-zoomable react-flow-equivalent if you want the full
  visual graph.
