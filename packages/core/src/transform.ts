import { DocumentNode, parse, print } from "graphql";
import MagicString, { SourceMap, SourceMapOptions } from "magic-string";
import { graphqlLoaderUniqueChecker, graphqlLoaderExtractQuery } from "./snippets.js";

const DOC_NAME = "_gql_doc";

// Identifiers the emitted module declares for itself; a GraphQL definition
// whose name collides with one of these would emit a duplicate `const`.
const RESERVED_NAMES = new Set([DOC_NAME, "_gql_source", "_queries", "_fragments"]);

// Drop `loc` from every node below the document root. Keeping them would
// roughly double the size of the emitted document for no benefit, and it
// matches the shape `graphql-tag` produced before this loader parsed directly.
const stripNestedLoc = (value: unknown): void => {
    if (Array.isArray(value)) {
        value.forEach(stripNestedLoc);
        return;
    }
    if (value && typeof value === "object") {
        const node = value as Record<string, unknown>;
        delete node.loc;
        Object.values(node).forEach(stripNestedLoc);
    }
};

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
                    `graphql-loader: invalid #import path ${JSON.stringify(importFile)}`,
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
                `${DOC_NAME}.definitions = ${graphqlLoaderUniqueChecker.name}(${DOC_NAME}.definitions.concat(${importName}.definitions));\n`,
            );
        }

        // Once we've reached a non-import line, return true to stop iterating.
        return line.length !== 0 && line[0] !== "#";
    });

    return { imports, importAppends };
};

export interface GraphqlLoaderOptions {
    /** Skip source map generation. */
    noSourceMap?: boolean;
    /** Passed through to MagicString's `generateMap`. */
    sourceMapOptions?: SourceMapOptions;
}

export interface TransformResult {
    code: string;
    /** `null` when `noSourceMap` is set. */
    map: SourceMap | null;
}

/** Matches the GraphQL file extensions this loader handles. */
export const GRAPHQL_FILE_REGEX = /\.(?:gql|graphql)(?:\?.*)?$/;

/**
 * Compiles a GraphQL document into an ES module exporting its operations and
 * fragments. Shared by the Vite and Bun loaders, which only differ in how they
 * receive the source and hand back the result.
 */
export const transformGraphQL = (
    source: string,
    id: string,
    options?: GraphqlLoaderOptions,
): TransformResult => {
    let documentNode: DocumentNode;
    try {
        // Parse via `graphql` rather than `graphql-tag`. `gql` caches
        // documents keyed by whitespace-normalized source, so two files
        // differing only in whitespace would share one DocumentNode and
        // inherit each other's `loc` offsets, which no longer match the
        // `loc.source.body` emitted alongside them.
        documentNode = parse(source);
    } catch (error) {
        throw new Error(
            `graphql-loader: failed to parse ${id}: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
        );
    }

    // Reject definitions that would collide with identifiers the emitted
    // module declares for itself. Without this guard the emitted code would
    // contain duplicate `const` declarations and fail to load.
    for (const def of documentNode.definitions) {
        if ("name" in def && def.name && RESERVED_NAMES.has(def.name.value)) {
            throw new Error(
                `graphql-loader: definition "${def.name.value}" in ${id} uses a reserved identifier name (${[...RESERVED_NAMES].join(", ")})`,
            );
        }
    }

    // Preserve fragment deduplication without ignoring differences inside string values.
    const seenNames = new Map<string, string | null>();
    documentNode = {
        ...documentNode,
        definitions: documentNode.definitions.filter((def) => {
            if (def.kind !== "OperationDefinition" && def.kind !== "FragmentDefinition")
                return true;
            if (!def.name) return true;

            const name = def.name.value;
            const fragment = def.kind === "FragmentDefinition" ? print(def) : null;
            if (seenNames.has(name)) {
                if (fragment !== null && seenNames.get(name) === fragment) return false;
                throw new Error(
                    `graphql-loader: "${name}" in ${id} is declared more than once. Each operation and fragment is exported under its own name, so names have to be unique within a file.`,
                );
            }
            seenNames.set(name, fragment);
            return true;
        }),
    };

    // MagicString is used to generate the source map. Order matters: escape
    // backslashes first so the subsequent backtick and `${` escape insertions
    // are themselves preserved verbatim in the emitted template literal
    // (otherwise `\${` would round-trip as just `${` and re-introduce the
    // interpolation bug).
    const outputCode = new MagicString(source)
        .replaceAll("\\", "\\\\")
        .replaceAll("`", "\\`")
        .replaceAll("${", "\\${");

    outputCode.prepend(`const _gql_source = \``);
    // ORIGINAL SOURCE CODE ENDS UP BETWEEN THESE TWO LINES, AS A JS STRING.
    outputCode.append(`\`;\n`);

    // Convert document node to plain object. Strip the top-level `loc.source`
    // so we can re-attach it in emitted code with `body` pointing at the
    // source-mapped `_gql_source` constant. Doing this via post-stringify
    // string replacement would be fragile if the user's GraphQL source
    // happened to contain the sentinel.
    const documentObject = JSON.parse(JSON.stringify(documentNode));
    const topLoc = documentNode.loc;
    stripNestedLoc(documentObject.definitions);
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
            `const ${graphqlLoaderUniqueChecker.name} = ${graphqlLoaderUniqueChecker.toString()};\n`,
        );
        outputCode.append(importAppends.join(""));
    }

    // Allow multiple query/mutation definitions in a file. This parses out
    // dependencies at compile time, and then uses those at load time to create
    // minimal query documents. We cannot do the latter at compile time due to
    // how the #import code works.
    const operationCount = documentNode.definitions.filter(
        (op) => (op.kind === "OperationDefinition" || op.kind === "FragmentDefinition") && op.name,
    ).length;

    const queryNames: string[] = [];
    const fragmentNames: string[] = [];

    if (operationCount >= 1) {
        const extractQueries = operationCount > 1 || imports.length > 0;
        if (extractQueries) {
            outputCode.append(
                `const ${graphqlLoaderExtractQuery.name} = ${graphqlLoaderExtractQuery.toString()};\n`,
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
                    `export const ${opName} = ${extractQueries ? `${graphqlLoaderExtractQuery.name}(${DOC_NAME}, "${opName}")` : DOC_NAME};\n`,
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
        map: options?.noSourceMap ? null : outputCode.generateMap(options?.sourceMapOptions),
    };
};
