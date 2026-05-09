# Rule reference

Each rule lives in its own page. Open `<rule>.md` next to this file for details, examples, and fixes.

## state-effects

- [`no-fetch-in-effect`](./no-fetch-in-effect.md) — error
- `prefer-derived-over-effect` — warn
- `no-mutation-of-props` — error
- `no-effect-without-cleanup` — warn
- `no-cascading-state-in-effect` — warn
- `no-circular-reactivity` — warn

## performance

- `no-array-index-as-each-key` — warn

## security

- `no-unsafe-html-binding` — error
- `no-href-javascript` — error

## architecture

- `component-too-large` — warn

## sveltekit

- `server-only-import-in-client` — error
- `no-fetch-in-load-without-event` — error

Detail pages for the remaining rules are forthcoming. The CLI already prints the meta-description and rule URL for every diagnostic with `--explain` or `--verbose`.
