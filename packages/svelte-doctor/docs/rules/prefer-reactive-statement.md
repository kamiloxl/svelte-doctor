# prefer-reactive-statement

**Category:** state-effects
**Severity:** warning
**Versions:** Svelte 4

## Why

A plain `let foo = expr` in `<script>` runs once at component setup. If `expr` references a prop, `foo` will not update when the prop changes. `$: foo = expr` re-runs whenever its dependencies change.

## Bad

```svelte
<script>
  export let count;
  let doubled = count * 2;
</script>

<p>{doubled}</p>
```

## Good

```svelte
<script>
  export let count;
  $: doubled = count * 2;
</script>

<p>{doubled}</p>
```

## Suppress

```svelte
<script>
  export let count;
  // svelte-doctor-cli-disable-next-line svelte-doctor-cli/prefer-reactive-statement
  let snapshot = count;
</script>
```
