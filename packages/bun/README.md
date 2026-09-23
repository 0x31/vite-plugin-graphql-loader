# bun-graphql-loader

[![License](https://img.shields.io/github/license/0x31/vite-plugin-graphql-loader?style=for-the-badge&labelColor=2e3440&color=6f4fbe)](https://github.com/0x31/vite-plugin-graphql-loader/blob/master/LICENSE.txt)
[![Version](https://img.shields.io/npm/v/bun-graphql-loader.svg?label=Version&style=for-the-badge&labelColor=2e3440&color=eea837)](https://www.npmjs.com/package/bun-graphql-loader)
[![Downloads](https://img.shields.io/npm/dw/bun-graphql-loader?style=for-the-badge&labelColor=2e3440&color=50b6a9)](https://www.npmjs.com/package/bun-graphql-loader)
[![Bun Badge](https://img.shields.io/badge/Bun-000?logo=bun&logoColor=fff&style=for-the-badge&color=2e3440)](https://bun.sh)
[![GraphQL Badge](https://img.shields.io/badge/GraphQL-E10098?logo=graphql&logoColor=fff&style=for-the-badge&color=ee4367)](https://graphql.org)

A Bun plugin for loading GraphQL .gql and .graphql files.

Shares its implementation with [`vite-plugin-graphql-loader`](https://www.npmjs.com/package/vite-plugin-graphql-loader), so a project that builds with Vite and tests with Bun gets identical `.graphql` imports in both.

## Install

```bash
bun add --dev bun-graphql-loader graphql
```

### Compatibility

| Peer      | Supported  |
| --------- | ---------- |
| `graphql` | 16.x, 17.x |
| `bun`     | >=1.1.0    |

## Usage

With `Bun.build`:

```typescript
import bunGraphqlLoader from "bun-graphql-loader";

await Bun.build({
    entrypoints: ["./index.ts"],
    plugins: [bunGraphqlLoader()],
});
```

With `bun test` or the Bun runtime, register the loader from a preload file.

`bunGraphqlLoader.ts`:

```typescript
import { plugin } from "bun";
import bunGraphqlLoader from "bun-graphql-loader";

void plugin(bunGraphqlLoader());
```

`bunfig.toml`:

```toml
preload = ["./bunGraphqlLoader.ts"]

[test]
preload = ["./bunGraphqlLoader.ts"]
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

`example.ts`:

```typescript
import ExampleQuery, { ExampleFragment } from "./example.graphql";
```

If you have multiple queries in the same file, import them like this:

```typescript
import { FirstQuery, SecondQuery } from "./example.graphql";
```

## Options

```typescript
bunGraphqlLoader({
    // Omit the inline source map from the generated module.
    noSourceMap: false,
    // Passed through to MagicString's `generateMap`.
    sourceMapOptions: { hires: true },
});
```

### Source map limitation

The generated module includes an inline map with the original file path (relative to the working directory) and GraphQL source content. `sourceMapOptions` can override these defaults.

Bun 1.3.13 does **not** compose this inline map into `Bun.build` output maps. Those maps refer to the generated JavaScript, not the original GraphQL. This plugin does not currently provide original GraphQL source mapping through `Bun.build`. `noSourceMap` controls only the inline map and does not change Bun's own `sourcemap` build option.

## TypeScript

Declare `.gql` or `.graphql` files somewhere in your source directory:

```typescript
declare module "*.gql";
declare module "*.graphql";
```

**_Alternatively_**, for full type information:

```typescript
declare module "*.graphql" {
    const Query: import("graphql").DocumentNode;
    export default Query;
    export const _queries: Record<string, import("graphql").DocumentNode>;
    export const _fragments: Record<string, import("graphql").FragmentDefinitionNode>;
}
```

## Changelog

**_v2.0.0_**:

- Now built from the same source as `vite-plugin-graphql-loader`, in [one repository](https://github.com/0x31/vite-plugin-graphql-loader). The previous standalone implementation had drifted well behind and was missing these fixes:
    - **Security**: `#import` paths are validated and rejected if they contain quotes, backticks, backslashes or newlines. A crafted path could previously inject code into the emitted module.
    - **Fix**: `${` and backslashes in the GraphQL source are escaped, so a document containing either no longer corrupts the emitted module or its `loc.source.body`.
    - **Fix**: fragment deduplication and reference collection are prototype-safe. A fragment named `constructor` or `toString` was previously dropped.
    - **Fix**: definitions using a reserved identifier name (`_gql_doc`, `_gql_source`, `_queries`, `_fragments`) now throw at load time instead of emitting a module with duplicate `const` declarations.
    - **Fix**: a clear error when an extracted operation is not in the document, instead of a document containing `undefined`.
    - **Fix**: emitted `loc.start`/`loc.end` match `loc.source.body`. They were previously offset by the loader's own source indentation.
    - **Fix**: `noSourceMap` does something. Source map generation was commented out entirely, so the option was inert. The map is now inlined into the loaded module unless the option is set. It includes the source path and content, but Bun 1.3.13 does not compose it into build output maps (see the source map limitation above).
    - Output no longer depends on the host platform's line endings.
    - **Fix**: identical fragments within a file are deduplicated. Conflicting fragments, duplicate operations, and operations sharing a fragment name fail the build with a clear error.
- GraphQL 17 is supported alongside 16, and `graphql` is a peer dependency rather than a direct one.
- `magic-string` is updated to 1.x. `sourceMapOptions` passes straight through to it, so `hires` also accepts `"boundary"` and `"experimental-range"`.

**_v1.0.3_** and earlier: see the [archived repository](https://github.com/0x31/bun-graphql-loader).
