import type { SourceMap } from "magic-string";
import type { Plugin } from "vite";
import {
    GRAPHQL_FILE_REGEX,
    transformGraphQL,
    type GraphqlLoaderOptions,
} from "../../core/src/index.js";

export type { GraphqlLoaderOptions };

/** Vite GraphQL Loader. */
export const vitePluginGraphqlLoader = (options?: GraphqlLoaderOptions): Plugin => {
    return {
        name: "graphql-loader",

        // Run before Vite core plugins.
        enforce: "pre" as const,

        transform(source: string, id: string) {
            // Only transform GraphQL files (.gql or .graphql).
            if (!GRAPHQL_FILE_REGEX.test(id)) {
                return;
            }

            const { code, map } = transformGraphQL(source, id, options);

            return {
                code,
                // Vite wants a map object rather than null, so hand it an empty
                // one when source maps are disabled.
                map: map ?? ({ mappings: "" } as SourceMap),
            };
        },
    };
};

export default vitePluginGraphqlLoader;
