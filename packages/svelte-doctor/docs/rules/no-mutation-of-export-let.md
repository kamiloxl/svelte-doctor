# no-mutation-of-export-let

**Category:** state-effects
**Severity:** error
**Versions:** Svelte 4

## Why

In Svelte 4, `export let` declares a prop. Reassigning it inside the component breaks one-way data flow: the parent owns the value, and writing to it locally either silently de-syncs from the parent or triggers a `bind:` round-trip the parent didn't sign up for.

## Bad

```svelte
<script>
  export let count;
  function increment() { count++; }
</script>
```

## Good — emit a callback

```svelte
<script>
  export let count;
  export let onIncrement;
</script>

<button on:click={() => onIncrement?.()}>+</button>
```

## Good — use `bind:` (parent opts in)

```svelte
<!-- Parent.svelte -->
<Counter bind:count />
```

## Suppress

```svelte
<script>
  // svelte-doctor-cli-disable-next-line svelte-doctor-cli/no-mutation-of-export-let
  export let count;
  count = 0;
</script>
```
