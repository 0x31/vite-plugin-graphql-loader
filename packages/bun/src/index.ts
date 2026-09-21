import type { BunPlugin, PluginBuilder } from "bun";
import {
    GRAPHQL_FILE_REGEX,
    transformGraphQL,
    type GraphqlLoaderOptions,
} from "../../core/src/index.js";

export type { GraphqlLoaderOptions };

// Bun's loader API has no source map channel, so the map has to ride along
// inside the returned code as a data URL.
const inlineSourceMap = (code: string, map: { toString(): string }): string => {
    const encoded = Buffer.from(map.toString(), "utf8").toString("base64");
    return `${code}//# sourceMappingURL=data:application/json;charset=utf-8;base64,${encoded}\n`;
};

/** Bun GraphQL Loader. */
export const bunGraphqlLoader = (options?: GraphqlLoaderOptions): BunPlugin => {
    return {
        name: "graphql-loader",

        setup(build: PluginBuilder) {
            build.onLoad({ filter: GRAPHQL_FILE_REGEX }, async (args) => {
                const source = await Bun.file(args.path).text();
                const { code, map } = transformGraphQL(source, args.path, options);

                return {
                    contents: map ? inlineSourceMap(code, map) : code,
                    loader: "js",
                };
            });
        },
    };
};

export default bunGraphqlLoader;
