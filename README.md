# vite-plugin-graphql-loader

![License](https://img.shields.io/github/license/0x31/vite-plugin-graphql-loader?style=for-the-badge&labelColor=2e3440&color=6f4fbe)
![Version](https://img.shields.io/npm/v/vite-plugin-graphql-loader.svg?label=Version&style=for-the-badge&labelColor=2e3440&color=eea837)
![Downloads](https://img.shields.io/npm/dw/vite-plugin-graphql-loader?style=for-the-badge&labelColor=2e3440&color=50b6a9)
![Vite Badge](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=fff&style=for-the-badge)
![GraphQL Badge](https://img.shields.io/badge/GraphQL-E10098?logo=graphql&logoColor=fff&style=for-the-badge&color=ee4367)
![TypeScript Badge](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=fff&style=for-the-badge)

<!-- ![Vitest Badge](https://img.shields.io/badge/Vitest-6E9F18?logo=vitest&logoColor=fff&style=for-the-badge&color=10ad6a) -->

A Vite plugin for loading GraphQL .gql and .graphql files, based on [graphql-tag/loader](https://github.com/apollographql/graphql-tag)

This package _doesn't_ generate TypeScript definitions from the queries and fragments - see [vite-plugin-graphql-codegen](https://www.npmjs.com/package/vite-plugin-graphql-codegen) if you require this.

## Install

```bash
yarn add -D vite-plugin-graphql-loader
```

or

```bash
npm i vite-plugin-graphql-loader --save-dev
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

Create `graphql.d.ts` anywhere in your source directory and

```typescript
declare module "*.gql";
declare module "*.graphql";
```

**_Alternatively_**, change it to this (replacing .gql with .graphql depending on what you use):

```typescript
declare module "*.gql" {
    const Query: import("graphql").DocumentNode;
    export default Query;
    export const _queries: Record<string, import("graphql").DocumentNode>;
    export const _fragments: Record<
        string,
        import("graphql").FragmentDefinitionNode
    >;
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

**_v4.0.1_**:

-   Allow passing `sourceMapOptions` when initializing the plugin to configure how the source map is generated (see options [here](https://github.com/Rich-Harris/magic-string?tab=readme-ov-file#sgeneratemap-options-)). `noSourceMap` can alternatively be used to disable source map generation. For example, to enable more detailed source maps:

```ts
import graphqlLoader from "vite-plugin-graphql-loader";
graphqlLoader({ sourceMapOptions: { hires: true } });
```

**_v4.0.0_**:

-   Added source-map generation. Can by disabled by initializing with `graphqlLoader({noSourceMap: true})`.
-   Refactored code generation to be more maintainable, added more test cases.
-   Migrated from `yarn` to `bun`.

**_v3.0.1_**:

-   Switched `await import` statements to top-level `import` statements (fixes #5 - `Top-level await is not available` error).
-   Added `_queries` and `_fragments` for improved module declaration types.
-   Updated snippets to be defined in TypeScript and then stringified.

**_v3.0.0_**:

-   [Moved from CJS to ESM](https://github.com/0x31/vite-plugin-graphql-loader/commit/0e0b37cfcb0ecbdf28e985aeca3454137b4b73e3), inline with Vite 5.0's CJS deprecation. If you are using CommonJS, continue using v2.0 of this package. If you have `"type": "module"`, in your `package.json` then it should work as expected.
