# vite-plugin-graphql-loader

[![NPM](https://nodei.co/npm/vite-plugin-graphql-loader.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/vite-plugin-graphql-loader/)

[![npm version](https://img.shields.io/npm/v/vite-plugin-graphql-loader.svg)](https://www.npmjs.com/package/vite-plugin-graphql-loader)

A Vite plugin for loading GraphQL .gql and .graphql files, based on [graphql-tag/loader](https://github.com/apollographql/graphql-tag)

If you are using TypeScript, I recommend using GraphQL Codegen and [vite-plugin-graphql-codegen](https://www.npmjs.com/package/vite-plugin-graphql-codegen) instead to generate TypesScript interfaces for your queries and fragments.

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
fragment ExampleFragment on example {
    id
    name
}

query ExampleQuery {
    example {
        ...ExampleFragment
    }
}
```

`example.js`:

```javascript
import ExampleQuery, { ExampleFragment } from "./example.graphql";
```

If you are using TypeScript, you will have to declare `.gql` or `.graphql` files:

`graphql.d.ts`:

```typescript
declare module "*.gql";
declare module "*.graphql";

// Or if you aren't using fragments:
// declare module "*.gql" {
//     const Query: import("graphql").DocumentNode;
//     export default Query;
// }
```

## Changelog

**_v3.0.0_**: Moved from CJS to ESM, inline with Vite 5.0's CJS deprecation. If you are using CommonJS, continue using v2.0 of this package.
