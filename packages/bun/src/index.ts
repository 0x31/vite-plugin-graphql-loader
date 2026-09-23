import type { BunPlugin, PluginBuilder } from "bun";
import { relative } from "node:path";
import {
    GRAPHQL_FILE_REGEX,
    transformGraphQL,
    type GraphqlLoaderOptions,
} from "../../core/src/index.js";

export type { GraphqlLoaderOptions };

// Bun 1.3.13 does not compose this inline map into Bun.build output maps.
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
                const { code, map } = transformGraphQL(source, args.path, {
                    ...options,
                    sourceMapOptions: {
                        // Relative to the working directory, so the emitted map
                        // is identical wherever the build runs and carries no
                        // absolute build path.
                        source: relative(process.cwd(), args.path) || args.path,
                        includeContent: true,
                        ...options?.sourceMapOptions,
                    },
                });

                return {
                    contents: map ? inlineSourceMap(code, map) : code,
                    loader: "js",
                };
            });
        },
    };
};

export default bunGraphqlLoader;
