# Setup: run a lesson or build your own app

[All lessons](Home.md) → [1. Inventory](Inventory.md)

There are two ways to follow the lessons. Use the repository companions to explore
the finished behavior, or use an existing React + TypeScript app to build it yourself.

## 1. Run the working examples

Use Node 22 in this checkout. In the repository root:

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite with `/tutorials.html` appended. You should see
**Build with Granum Grid**, five lesson links, and the inventory explorer. No account,
external dataset download, or API key is needed.

The inventory, sensor, log, and compose companions live in
[`demo/src/tutorials`](../../demo/src/tutorials). The HTTP lesson reuses
[`HttpExample.tsx`](../../demo/src/HttpExample.tsx).

## 2. Install the library in your React app

This version is a local package, not a published npm release. Pack it and install the
archive with [step 1 of the quick start](../QUICK_START.md#1-install-the-library), which
also shows how to create a new React app. The package supports React and React DOM
18.2–19. The demo is not a runtime dependency of your application.

## 3. Copy one lesson

Each of the first three lessons provides two complete files: a typed provider and
a React component. Put the provider in `src/` under the filename shown. Use the
component as `src/App.tsx`; its default export can keep the name in the lesson.
Your existing React entry point should mount that default export. The compose lesson
adds one component and reuses the inventory provider.

Each component imports `granum-grid/styles.css` and supplies an explicit viewport
height. For a fresh Vite app, replace the starter `index.css` as in
[step 2 of the quick start](../QUICK_START.md#2-render-your-first-explorer).
In an existing application, retain your global layout and styles. Start the app
with its normal development command. The lesson wrapper/navigation is optional;
the supplied component works on its own.

## 4. Check your understanding

| User-facing address | JavaScript address |
| --- | --- |
| Row 1 | Index `0` |
| Row 60 | Index `59` |
| Rows 721 through 740, inclusive | Range `{ start: 720, end: 740 }` |

All provider ranges are half-open: the start is included and the end is excluded.
The library requires a known row count and a stable ordering for a revision.

**Next: [Build the inventory explorer](Inventory.md).**
