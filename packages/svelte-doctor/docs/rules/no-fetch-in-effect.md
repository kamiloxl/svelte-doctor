# `svelte-doctor-cli/no-fetch-in-effect`

**Category:** state-effects · **Default severity:** error

`fetch()` inside `$effect(...)` runs on every dependency change and races itself across re-runs. SvelteKit ships idiomatic ways to fetch that handle SSR replay, deduping, and cancellation for you.

## Why

- Each effect re-run starts a new request without cancelling the in-flight one.
- The data lands outside SvelteKit's data flow, so it cannot be SSR-rendered.
- You cannot easily await it before the page renders.

## Bad

```svelte
<script>
  let data = $state(null);
  $effect(() => {
    fetch(`/api/users/${id}`).then(r => r.json()).then(d => data = d);
  });
</script>
```

## Good — SvelteKit `load`

```ts
// +page.ts
export async function load({ fetch, params }) {
  const r = await fetch(`/api/users/${params.id}`);
  return { user: await r.json() };
}
```

## Good — `{#await}` with a top-level promise

```svelte
<script>
  const userPromise = fetch(`/api/users/${id}`).then(r => r.json());
</script>

{#await userPromise then user}
  {user.name}
{/await}
```
