# vite-plugin-graphql-loader

[![License](https://img.shields.io/github/license/0x31/vite-plugin-graphql-loader?style=for-the-badge&labelColor=2e3440&color=6f4fbe)](https://github.com/0x31/vite-plugin-graphql-loader/blob/master/LICENSE.txt)
[![Version](https://img.shields.io/npm/v/vite-plugin-graphql-loader.svg?label=Version&style=for-the-badge&labelColor=2e3440&color=eea837)](https://www.npmjs.com/package/vite-plugin-graphql-loader)
[![Downloads](https://img.shields.io/npm/dw/vite-plugin-graphql-loader?style=for-the-badge&labelColor=2e3440&color=50b6a9)](https://www.npmjs.com/package/vite-plugin-graphql-loader)
[![Vite Badge](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=fff&style=for-the-badge)](https://vite.dev)
[![GraphQL Badge](https://img.shields.io/badge/GraphQL-E10098?logo=graphql&logoColor=fff&style=for-the-badge&color=ee4367)](https://graphql.org)
[![TypeScript Badge](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=fff&style=for-the-badge)](https://www.typescriptlang.org)

A Vite plugin for loading GraphQL .gql and .graphql files, based on [graphql-tag/loader](https://github.com/apollographql/graphql-tag)

This package _doesn't_ generate TypeScript definitions from the queries and fragments - see [vite-plugin-graphql-codegen](https://www.npmjs.com/package/vite-plugin-graphql-codegen) if you require this.

## Install

```bash
yarn add -D vite-plugin-graphql-loader graphql
```

or

```bash
npm i --save-dev vite-plugin-graphql-loader graphql
```

## Usage

In `vite.config.ts` or `vite.config.js`:

```typescript
import { defineConfig } from "vite";
import graphqlLoader from "vite-plugin-graphql-loader";

export default defineConfig({
    plugins: [graphqlLoader()],
});
```

Now you can import queries from `.gql` or `.graphql` files.

`example.graphql`:

```graphql
#import "./ExampleImport.graphql"

fragment ExampleFragment on example {
    id
    name
}

query ExampleQuery {
    example {
        ...ExampleFragment
        ...ExampleImport
    }
}
```

`example.js`:

```javascript
import ExampleQuery, { ExampleFragment } from "./example.graphql";
```

If you have multiple queries in the same file, import them like this:

```javascript
import { FirstQuery, SecondQuery } from "./example.graphql";
```

## TypeScript

If you are using TypeScript, you will have to declare `.gql` or `.graphql` files.

Create `graphql.d.ts` anywhere in your source directory:

```typescript
declare module "*.gql";
declare module "*.graphql";
```

**_Alternatively_**, for full type information (replacing `.gql` with `.graphql` depending on what you use):

```typescript
declare module "*.gql" {
    const Query: import("graphql").DocumentNode;
    export default Query;
    export const _queries: Record<string, import("graphql").DocumentNode>;
    export const _fragments: Record<string, import("graphql").FragmentDefinitionNode>;
}
```

And then import fragments and queries like so in order to type them as `DocumentNode` and `FragmentDefinitionNode` objects.

```typescript
import Document, { _queries, _fragments } from "./example.graphql";
console.log(Document); // Has type `DocumentNode`
console.log(_queries.ExampleQuery); // Has type `DocumentNode`
console.log(_fragments.ExampleFragment); // Has type `FragmentDefinitionNode`
```

## Changelog

**_v5.1.0_**:

- **Security**: validate `#import` paths and reject those containing quotes, backticks, backslashes, or newlines (could otherwise inject code into the emitted ESM via a crafted path).
- **Fix**: escape `${` in emitted template literals so GraphQL sources containing `${...}` (e.g. in comments/descriptions) no longer interpolate into the emitted code.
- **Fix**: emit LF newlines so source maps remain accurate on Windows (the previous `os.EOL` replace happened after MagicString computed its byte offsets, desyncing the sourcemap on CRLF systems).
- **Fix**: match `.gql` / `.graphql` IDs with `?query` suffixes (Vite emits these for some module-graph operations).
- **Fix**: `extractQuery` now throws a clear error when the named operation is not in the document (previously produced `definitions: [undefined]`).
- **Fix**: `loc.source` is now reattached via separate emitted statements rather than UUID-placeholder string replacement (no collision risk if a GraphQL source happened to contain the sentinel).
- Annotate the plugin's return type as Vite's `Plugin` for consumer DX.
- Add `prepublishOnly` script (`build && test:run`), `engines.node` (`^20.19.0 || >=22.12.0`).
- Flatten dist layout: `dist/index.js` (was `dist/src/index.js`). Exports field updated — no consumer-facing change via the package entrypoint.
- CI on GitHub Actions (lint, typecheck, tests, build, integration test), tag-triggered release with npm provenance via Trusted Publishing and auto-generated GitHub Releases.

**_v5.0.0_**:

- **Breaking:** `graphql` is now a peer dependency. If you don't already have it installed, run `npm i graphql`.
- Added `vite` as a peer dependency with support for vite 5, 6, 7, and 8.
- Switched build tooling to tsgo (TypeScript 7 native compiler), oxlint, and oxfmt.
- Updated all dependencies to latest versions.
- Added integration test suite covering all import styles and query patterns.
- Fixed named import syntax (`#import ... from ...`) not being published in v4.0.4 (fixes #12).

**_v4.0.1_**:

- Allow passing `sourceMapOptions` when initializing the plugin to configure how the source map is generated (see options [here](https://github.com/Rich-Harris/magic-string?tab=readme-ov-file#sgeneratemap-options-)). `noSourceMap` can alternatively be used to disable source map generation. For example, to enable more detailed source maps:

```ts
import graphqlLoader from "vite-plugin-graphql-loader";
graphqlLoader({ sourceMapOptions: { hires: true } });
```

**_v4.0.0_**:

- Added source-map generation. Can be disabled by initializing with `graphqlLoader({noSourceMap: true})`.
- Refactored code generation to be more maintainable, added more test cases.
- Migrated from `yarn` to `bun`.

**_v3.0.1_**:

- Switched `await import` statements to top-level `import` statements (fixes #5 - `Top-level await is not available` error).
- Added `_queries` and `_fragments` for improved module declaration types.
- Updated snippets to be defined in TypeScript and then stringified.

**_v3.0.0_**:

- [Moved from CJS to ESM](https://github.com/0x31/vite-plugin-graphql-loader/commit/0e0b37cfcb0ecbdf28e985aeca3454137b4b73e3), inline with Vite 5.0's CJS deprecation. If you are using CommonJS, continue using v2.0 of this package. If you have `"type": "module"`, in your `package.json` then it should work as expected.
