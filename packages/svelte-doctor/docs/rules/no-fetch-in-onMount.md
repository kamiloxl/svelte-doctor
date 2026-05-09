# no-fetch-in-onMount

**Category:** state-effects
**Severity:** error
**Versions:** Svelte 4

## Why

`onMount` fires on the client only. A `fetch()` inside it forces the user to wait after hydration, blocks SSR data, and runs again on every navigation that re-mounts the component. In SvelteKit you should fetch in a `+page.ts` / `+page.server.ts` `load` function so the request happens during navigation and benefits from data preloading.

## Bad

```svelte
<script>
  import { onMount } from 'svelte';
  let data;
  onMount(() => { fetch('/api/items').then(r => r.json()).then(d => data = d); });
</script>
```

## Good

```ts
// +page.ts
export const load = async ({ fetch }) => {
  const r = await fetch('/api/items');
  return { items: await r.json() };
};
```

## Suppress

```svelte
<script>
  // svelte-doctor-cli-disable-next-line svelte-doctor-cli/no-fetch-in-onMount
  onMount(() => fetch('/api/legacy'));
</script>
```
