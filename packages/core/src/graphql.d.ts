declare module "*.gql" {
    const Query: import("graphql").DocumentNode;
    export default Query;

    export const _queries: Record<string, import("graphql").DocumentNode>;
    export const _fragments: Record<string, import("graphql").FragmentDefinitionNode>;
}

declare module "*.graphql" {
    const Query: import("graphql").DocumentNode;
    export default Query;

    export const _queries: Record<string, import("graphql").DocumentNode>;
    export const _fragments: Record<string, import("graphql").FragmentDefinitionNode>;
}

// Bun serves `?raw` imports as text, bypassing the loader.
declare module "*.gql?raw" {
    const source: string;
    export default source;
}
