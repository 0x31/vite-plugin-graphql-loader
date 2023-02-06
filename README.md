# vite-plugin-graphql-loader

[![NPM](https://nodei.co/npm/vite-plugin-graphql-loader.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/vite-plugin-graphql-loader/)

[![npm version](https://img.shields.io/npm/v/vite-plugin-graphql-loader.svg)](https://www.npmjs.com/package/vite-plugin-graphql-loader)

A Vite plugin for loading GraphQL .gql and .graphql files, based on [graphql-tag/loader](https://github.com/apollographql/graphql-tag)

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
