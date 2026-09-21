# graphql-loader

Loads GraphQL `.gql` and `.graphql` files as ES modules, for Vite and for Bun.

| Package                                                | npm                                                             | Use with                |
| ------------------------------------------------------ | --------------------------------------------------------------- | ----------------------- |
| [`vite-plugin-graphql-loader`](./packages/vite#readme) | [npm](https://www.npmjs.com/package/vite-plugin-graphql-loader) | Vite 5, 6, 7, 8         |
| [`bun-graphql-loader`](./packages/bun#readme)          | [npm](https://www.npmjs.com/package/bun-graphql-loader)         | `bun build`, `bun test` |

Both packages wrap one shared transform in `packages/core`. They previously
lived in separate repositories and drifted, with the Bun copy missing several
correctness and security fixes. Core is compiled into each published package
rather than published on its own, so neither package gains a dependency.

## Layout

```
packages/core    shared transform + the snippets injected into emitted modules
packages/vite    -> vite-plugin-graphql-loader
packages/bun     -> bun-graphql-loader
tests            shared fixtures, run under vitest and bun test
integration-test a real Vite build consuming the published package layout
```

## Development

```bash
bun install
bun run test:run     # vitest (shared fixtures) + bun test (Bun runtime/build)
bun run typecheck
bun run lint
bun run build        # builds both packages
```

The `tests/testcases` fixtures are golden files. Delete a `-expected.js` and
re-run the tests twice to regenerate it.

## Releasing

Tags select the package: `vite-v5.3.0` publishes `packages/vite`,
`bun-v2.0.0` publishes `packages/bun`. Both use npm Trusted Publishing, which
has to be configured per package on npmjs.com.
