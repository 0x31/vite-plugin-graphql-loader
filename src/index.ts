import { DocumentNode } from "graphql";
import { gql } from "graphql-tag";
import MagicString, { SourceMap, SourceMapOptions } from "magic-string";
import type { Plugin } from "vite";
import {
    vitePluginGraphqlLoaderUniqueChecker,
    vitePluginGraphqlLoaderExtractQuery,
} from "./snippets.js";

const DOC_NAME = "_gql_doc";

// Resolves GraphQL #import statements into ESM import statements.
const expandImports = (source: string): { imports: string[]; importAppends: string[] } => {
    const lines = source.split(/\r\n|\r|\n/);

    const importNames = new Set<string>();
    const imports: string[] = [];
    const importAppends: string[] = [];

    // Go through each line, checking if it is an import. Uses `.some` instead
    // of `.forEach` so it can return early after finding a non-export.
    lines.some((line: string) => {
        const result = line.match(/^#\s?import (?:.* from )?(.+)$/);

        // If it's an import, replace it with an ESM import.
        if (result) {
            let importFile = result[1].trim();

            // Strip any surrounding quotes so we can re-quote safely below.
            const quoted = importFile.match(/^"(.*)"$/) || importFile.match(/^'(.*)'$/);
            if (quoted) {
                importFile = quoted[1];
            }

            // Reject paths containing characters that would break the emitted
            // ESM import statement.
            if (/["'`\\\n\r]/.test(importFile)) {
                throw new Error(
                    `vite-plugin-graphql-loader: invalid #import path ${JSON.stringify(importFile)}`,
                );
            }

            // Generate name for the import based on the filepath.
            let importName = "Import_" + importFile.replace(/[^a-z0-9]/gi, "_");
            // Ensure import name is unique.
            while (importNames.has(importName)) {
                importName = importName + "_";
            }
            importNames.add(importName);

            imports.push(`import ${importName} from ${JSON.stringify(importFile)};\n`);
            importAppends.push(
                `${DOC_NAME}.definitions = ${vitePluginGraphqlLoaderUniqueChecker.name}(${DOC_NAME}.definitions.concat(${importName}.definitions));\n`,
            );
        }

        // Once we've reached a non-import line, return true to stop iterating.
        return line.length !== 0 && line[0] !== "#";
    });

    return { imports, importAppends };
};

/** Vite GraphQL Loader. */
export const vitePluginGraphqlLoader = (options?: {
    noSourceMap?: boolean;
    sourceMapOptions?: SourceMapOptions;
}): Plugin => {
    // RegEx to match GraphQL file extensions.
    const graphqlRegex = /\.(?:gql|graphql)(?:\?.*)?$/;

    return {
        name: "graphql-loader",

        // Run before Vite core plugins.
        enforce: "pre" as const,

        transform(source: string, id: string) {
            // Only transform GraphQL files (.gql or .graphql).
            if (!graphqlRegex.test(id)) {
                return;
            }

            let documentNode: DocumentNode;
            try {
                documentNode = gql`
                    ${source}
                `;
            } catch (error) {
                throw new Error(
                    `vite-plugin-graphql-loader: failed to parse ${id}: ${error instanceof Error ? error.message : String(error)}`,
                    { cause: error },
                );
            }

            // MagicString is used to generate the source map.
            let outputCode = new MagicString(source)
                .replaceAll("`", "\\`")
                .replaceAll("${", "\\${");

            outputCode.prepend(`const _gql_source = \``);
            // ORIGINAL SOURCE CODE ENDS UP BETWEEN THESE TWO LINES, AS A JS
            // STRING.
            outputCode.append(`\`;\n`);

            // Convert document node to plain object. Strip the top-level
            // `loc.source` so we can re-attach it in emitted code with `body`
            // pointing at the source-mapped `_gql_source` constant. Doing this
            // via post-stringify string replacement would be fragile if the
            // user's GraphQL source happened to contain the sentinel.
            const documentObject = JSON.parse(JSON.stringify(documentNode));
            const topLoc = documentNode.loc;
            if (documentObject.loc) {
                delete documentObject.loc.source;
            }

            outputCode.append(`const ${DOC_NAME} = ${JSON.stringify(documentObject)};\n`);
            if (topLoc && topLoc.source) {
                outputCode.append(
                    `${DOC_NAME}.loc.source = ${JSON.stringify({
                        name: topLoc.source.name,
                        locationOffset: topLoc.source.locationOffset,
                    })};\n`,
                );
                outputCode.append(`${DOC_NAME}.loc.source.body = _gql_source;\n`);
            }

            // Resolve #import statements.
            const { imports, importAppends } = expandImports(source);
            if (imports.length) {
                outputCode.prepend(imports.join(""));
                outputCode.append(
                    `const ${vitePluginGraphqlLoaderUniqueChecker.name} = ${vitePluginGraphqlLoaderUniqueChecker.toString()};\n`,
                );
                outputCode.append(importAppends.join(""));
            }

            // Allow multiple query/mutation definitions in a file. This parses out dependencies
            // at compile time, and then uses those at load time to create minimal query documents
            // We cannot do the latter at compile time due to how the #import code works.
            const operationCount = documentNode.definitions.filter(
                (op) =>
                    (op.kind === "OperationDefinition" || op.kind === "FragmentDefinition") &&
                    op.name,
            ).length;

            const queryNames: string[] = [];
            const fragmentNames: string[] = [];

            if (operationCount >= 1) {
                const extractQueries = operationCount > 1 || imports.length > 0;
                if (extractQueries) {
                    outputCode.append(
                        `const ${vitePluginGraphqlLoaderExtractQuery.name} = ${vitePluginGraphqlLoaderExtractQuery.toString()};\n`,
                    );
                }

                for (const op of documentNode.definitions) {
                    if (op.kind === "OperationDefinition" || op.kind === "FragmentDefinition") {
                        if (!op.name) {
                            if (operationCount > 1) {
                                throw new Error(
                                    "Query/mutation names are required for a document with multiple definitions",
                                );
                            } else {
                                continue;
                            }
                        }

                        const opName = op.name.value;
                        outputCode.append(
                            `export const ${opName} = ${extractQueries ? `${vitePluginGraphqlLoaderExtractQuery.name}(${DOC_NAME}, "${opName}")` : DOC_NAME};\n`,
                        );

                        if (op.kind === "OperationDefinition") {
                            queryNames.push(opName);
                        } else {
                            fragmentNames.push(opName);
                        }
                    }
                }
            }

            outputCode.append(`export const _queries = {${queryNames.join(",")}};\n`);
            outputCode.append(`export const _fragments = {${fragmentNames.join(",")}};\n`);

            outputCode.append(`export default ${DOC_NAME};\n`);

            return {
                code: outputCode.toString(),
                map: options?.noSourceMap
                    ? ({ mappings: "" } as SourceMap)
                    : outputCode.generateMap(options?.sourceMapOptions),
            };
        },
    };
};

export default vitePluginGraphqlLoader;
