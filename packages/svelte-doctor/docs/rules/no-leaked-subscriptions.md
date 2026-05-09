# no-leaked-subscriptions

**Category:** state-effects
**Severity:** warning
**Versions:** Svelte 4

## Why

Anything subscribed or attached inside `onMount` lives until the component unmounts. Without a cleanup, you leak memory, double-fire callbacks after re-mounts, and accumulate event listeners.

## Bad

```svelte
<script>
  import { onMount } from 'svelte';
  import { count } from './store.js';
  onMount(() => { count.subscribe(v => console.log(v)); });
</script>
```

## Good

```svelte
<script>
  import { onMount } from 'svelte';
  import { count } from './store.js';
  onMount(() => {
    const unsubscribe = count.subscribe(v => console.log(v));
    return () => unsubscribe();
  });
</script>
```

## Suppress

```svelte
<script>
  // svelte-doctor-cli-disable-next-line svelte-doctor-cli/no-leaked-subscriptions
  onMount(() => store.subscribe(handle));
</script>
```
