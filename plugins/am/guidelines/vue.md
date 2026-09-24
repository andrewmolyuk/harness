# Vue

For writing Vue 3 with TypeScript: the choices where more than one would be reasonable.
`typescript.md` covers the TypeScript.

## 1. Layout by feature

- A new app is feature-first: `src/app/` (entry, router, layouts), `src/shared/` (UI kit,
  cross-cutting composables, services, stores, types), `src/features/<feature>/` (its own
  components, composables, services, stores, views, `routes.ts`, and `index.ts` as its public
  API), and `src/views/` for pages no feature owns. An existing app keeps the layout it has.
- A feature imports only from `shared/` and itself; `shared/` never imports a feature. Others
  reach a feature through its `index.ts`, never a deep path. Relative imports inside a feature,
  the `@/` alias across layers.
- `eslint-plugin-vue-modular` with its recommended config checks this layout and the names
  below; add it to a new app rather than keeping these rules by hand.

**Test:** removing a feature's folder breaks only the imports of its `index.ts`.

## 2. Names

- Components PascalCase `.vue`; a routed page ends in `View.vue`. TypeScript files camelCase,
  folders kebab-case.
- A composable is `useX.ts`. A store or service is named for its domain, without a suffix:
  `auth.ts`, not `authStore.ts` or `authService.ts`; the store it defines is `useAuthStore`.

**Test:** a file's name says what it holds without opening it.

## 3. Components

- `<script setup lang="ts">`, then `<template>`, then `<style>` if there is one; no Options API.
- Props, emits and models are typed where they're declared: `defineProps<{ monitor: Monitor }>()`,
  `defineEmits<{ saved: [id: string] }>()`, `defineModel<string>()`.
- Styling comes from Tailwind classes and the design system's tokens; a `<style>` block is the
  exception.
- A component renders and reacts. Fetching and business rules live in a composable it calls.

**Test:** a component's script is mostly wiring: props, a composable, handlers.

## 4. State

- Server data lives in TanStack Query, behind one composable per resource (`useMonitors()`)
  that calls a service (`api/monitors.ts`) for the requests.
- Pinia holds only client state that outlives a component, such as the signed-in user, as a
  setup store: `defineStore('auth', () => { … })`.
- Tests are Vitest, `<name>.test.ts` beside the file.

**Test:** no store keeps a copy of data the server owns.
