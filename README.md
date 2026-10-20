# graphql-loader

[![License](https://img.shields.io/github/license/0x31/vite-plugin-graphql-loader?style=for-the-badge&labelColor=2e3440&color=6f4fbe)](https://github.com/0x31/vite-plugin-graphql-loader/blob/master/LICENSE.txt)
[![CI](https://img.shields.io/github/actions/workflow/status/0x31/vite-plugin-graphql-loader/ci.yml?branch=master&label=CI&style=for-the-badge&labelColor=2e3440)](https://github.com/0x31/vite-plugin-graphql-loader/actions/workflows/ci.yml)
[![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=fff&style=for-the-badge)](https://vite.dev)
[![Bun](https://img.shields.io/badge/Bun-000?logo=bun&logoColor=fff&style=for-the-badge&color=2e3440)](https://bun.sh)
[![GraphQL](https://img.shields.io/badge/GraphQL-E10098?logo=graphql&logoColor=fff&style=for-the-badge&color=ee4367)](https://graphql.org)

Loads GraphQL `.gql` and `.graphql` files as ES modules, for Vite and for Bun.

| Package                                                | Version                                                                                                                                                                                                          | Weekly downloads                                                                                                                                                                                         | Use with                |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| [`vite-plugin-graphql-loader`](./packages/vite#readme) | [![Vite loader version](https://img.shields.io/npm/v/vite-plugin-graphql-loader.svg?label=Version&style=for-the-badge&labelColor=2e3440&color=eea837)](https://www.npmjs.com/package/vite-plugin-graphql-loader) | [![Vite loader weekly downloads](https://img.shields.io/npm/dw/vite-plugin-graphql-loader?style=for-the-badge&labelColor=2e3440&color=50b6a9)](https://www.npmjs.com/package/vite-plugin-graphql-loader) | Vite 5, 6, 7, 8         |
| [`bun-graphql-loader`](./packages/bun#readme)          | [![Bun loader version](https://img.shields.io/npm/v/bun-graphql-loader.svg?label=Version&style=for-the-badge&labelColor=2e3440&color=eea837)](https://www.npmjs.com/package/bun-graphql-loader)                  | [![Bun loader weekly downloads](https://img.shields.io/npm/dw/bun-graphql-loader?style=for-the-badge&labelColor=2e3440&color=50b6a9)](https://www.npmjs.com/package/bun-graphql-loader)                  | `bun build`, `bun test` |

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

Tags select the package: `vite-v6.0.0` publishes `packages/vite`,
`bun-v2.0.0` publishes `packages/bun`. Both are setup to use npm Trusted
Publishing.
