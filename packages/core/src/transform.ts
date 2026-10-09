import {
    type FragmentDefinitionNode,
    type NameNode,
    type OperationDefinitionNode,
    DocumentNode,
    parse,
    print,
} from "graphql";
import MagicString, { SourceMap, SourceMapOptions } from "magic-string";
import {
    graphqlLoaderUniqueChecker,
    graphqlLoaderExtractQuery,
    graphqlLoaderSourceLoc,
} from "./snippets.js";

// The definition kinds that become a named export.
type NamedDefinition = OperationDefinitionNode | FragmentDefinitionNode;

const DOC_NAME = "_gql_doc";

// Names the emitted module exports for itself. A definition using one of them
// would declare a second export of the same name.
const RESERVED_NAMES = new Set(["default", "_queries", "_fragments"]);

// Drop `loc` from every node below the top-level definitions. Keeping them all
// would roughly double the size of the emitted document. A definition keeps
// its own `{start, end}` so its text can be sliced back out of the source
// when documents are assembled from several definitions at runtime.
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

// `#import "./a.gql"`, `#import './a.gql'`, `#import ./a.gql` and the
// `#import { A } from "./a.gql"` form. Quotes allow spaces in the path.
const IMPORT_LINE = /^#\s*import\s+(?:.+?\s+from\s+)?(?:"([^"]*)"|'([^']*)'|(\S+))\s*$/;

// A comment meant as an import but not parseable as one: the path starts
// with a quote or a dot, which prose such as `# import the fragment first`
// does not. Failing loudly beats silently treating it as a comment.
const IMPORT_ATTEMPT = /^#\s*import\s+(?:.+?\s+from\s+)?["'.]/;

// Resolves GraphQL #import statements into ESM import statements.
const expandImports = (source: string): { imports: string[]; importAppends: string[] } => {
    const lines = source.split(/\r\n|\r|\n/);

    const importNames = new Set<string>();
    const imports: string[] = [];
    const importAppends: string[] = [];

    // Imports are read from the comment lines before the first definition.
    // Uses `.some` instead of `.forEach` so it can stop at that definition.
    lines.some((rawLine: string) => {
        const line = rawLine.trim();
        if (line === "") return false;
        if (line[0] !== "#") return true;

        const result = line.match(IMPORT_LINE);
        if (!result) {
            if (IMPORT_ATTEMPT.test(line)) {
                throw new Error(
                    `graphql-loader: cannot parse #import line ${JSON.stringify(line)}`,
                );
            }
            return false;
        }
        const importFile = result[1] ?? result[2] ?? result[3];

        // Reject paths containing characters that would break the emitted
        // ESM import statement.
        if (/["'`\\\n\r]/.test(importFile)) {
            throw new Error(`graphql-loader: invalid #import path ${JSON.stringify(importFile)}`);
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
        return false;
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
    // A byte order mark would hide the `#` of a first-line import and shift
    // every `loc` offset by one against the emitted body, so the text that
    // is parsed, scanned and emitted starts after it.
    const hasBom = source.charCodeAt(0) === 0xfeff;
    const text = hasBom ? source.slice(1) : source;

    let documentNode: DocumentNode;
    try {
        // Parse via `graphql` rather than `graphql-tag`. `gql` caches
        // documents keyed by whitespace-normalized source, so two files
        // differing only in whitespace would share one DocumentNode and
        // inherit each other's `loc` offsets, which no longer match the
        // `loc.source.body` emitted alongside them.
        documentNode = parse(text);
    } catch (error) {
        throw new Error(
            `graphql-loader: failed to parse ${id}: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
        );
    }

    // Named operations and fragments become named exports.
    const isNamedDefinition = (
        def: DocumentNode["definitions"][number],
    ): def is NamedDefinition & { name: NameNode } =>
        (def.kind === "OperationDefinition" || def.kind === "FragmentDefinition") &&
        def.name !== undefined;

    for (const def of documentNode.definitions) {
        if (isNamedDefinition(def) && RESERVED_NAMES.has(def.name.value)) {
            throw new Error(
                `graphql-loader: definition "${def.name.value}" in ${id} uses a reserved name (${[...RESERVED_NAMES].join(", ")}), which the emitted module exports itself`,
            );
        }
    }

    // An anonymous operation is only legal as a document's sole operation
    // (GraphQL's LoneAnonymousOperation rule), and it has no name to be
    // exported under. Fragments are not operations and don't count here.
    const operations = documentNode.definitions.filter((def) => def.kind === "OperationDefinition");
    if (operations.length > 1 && operations.some((op) => !op.name)) {
        throw new Error(
            `graphql-loader: ${id} declares an anonymous operation alongside other operations. An anonymous operation has to be the only operation in a file.`,
        );
    }

    // Preserve fragment deduplication without ignoring differences inside string values.
    const definitionCount = documentNode.definitions.length;
    const seenNames = new Map<string, NamedDefinition>();
    documentNode = {
        ...documentNode,
        definitions: documentNode.definitions.filter((def) => {
            if (def.kind !== "OperationDefinition" && def.kind !== "FragmentDefinition")
                return true;
            if (!def.name) return true;

            const previous = seenNames.get(def.name.value);
            if (previous) {
                // Only print once a name actually collides, which is rare, so
                // the common path doesn't pay for it. Two equivalent fragments
                // are deduplicated; anything else sharing a name is ambiguous.
                if (
                    def.kind === "FragmentDefinition" &&
                    previous.kind === "FragmentDefinition" &&
                    print(previous) === print(def)
                ) {
                    return false;
                }
                throw new Error(
                    `graphql-loader: "${def.name.value}" in ${id} is declared more than once. Each operation and fragment is exported under its own name, so names have to be unique within a file.`,
                );
            }
            seenNames.set(def.name.value, def);
            return true;
        }),
    };
    const deduplicated = documentNode.definitions.length !== definitionCount;

    // MagicString is used to generate the source map. Each replacement is
    // matched against the original string, so they can't interfere with each
    // other. `\r` is escaped because a template literal would otherwise
    // normalize CRLF to LF, leaving `loc` offsets pointing past the body.
    const outputCode = new MagicString(source)
        .replaceAll("\\", "\\\\")
        .replaceAll("`", "\\`")
        .replaceAll("${", "\\${")
        .replaceAll("\r", "\\r");
    if (hasBom) outputCode.remove(0, 1);

    outputCode.prepend(`const _gql_source = \``);
    // ORIGINAL SOURCE CODE ENDS UP BETWEEN THESE TWO LINES, AS A JS STRING.
    outputCode.append(`\`;\n`);

    // Convert the document to a plain object. graphql's `Location.toJSON`
    // leaves `source` out, so it is re-attached in emitted code with `body`
    // pointing at the source-mapped `_gql_source` constant.
    const documentObject = JSON.parse(JSON.stringify(documentNode));
    const topLoc = documentNode.loc;
    for (const definition of documentObject.definitions) {
        for (const [key, value] of Object.entries(definition)) {
            if (key !== "loc") stripNestedLoc(value);
        }
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
        // Each definition points at the source it was sliced from, so a
        // document assembled from several files can rebuild its body. Not
        // enumerable, so serializing a document doesn't repeat the file once
        // per definition.
        outputCode.append(
            `${DOC_NAME}.definitions.forEach((def) => Object.defineProperty(def.loc, "source", { value: ${DOC_NAME}.loc.source }));\n`,
        );
    }

    // Resolve #import statements.
    const { imports, importAppends } = expandImports(text);
    const extractQueries =
        documentNode.definitions.filter(isNamedDefinition).length > 1 || imports.length > 0;

    // Once definitions are merged in from other files, or dropped as
    // duplicates, the file's text no longer describes the document. Rebuild
    // `loc.source.body` from the definitions for clients that send it rather
    // than printing (urql's `stringifyDocument`, graphql-tag's `gql`).
    if (extractQueries || deduplicated) {
        outputCode.append(
            `const ${graphqlLoaderSourceLoc.name} = ${graphqlLoaderSourceLoc.toString()};\n`,
        );
    }
    if (imports.length) {
        outputCode.prepend(imports.join(""));
        outputCode.append(
            `const ${graphqlLoaderUniqueChecker.name} = ${graphqlLoaderUniqueChecker.toString()};\n`,
        );
        outputCode.append(importAppends.join(""));
    }
    if (imports.length || deduplicated) {
        outputCode.append(
            `${DOC_NAME}.loc = ${graphqlLoaderSourceLoc.name}(${DOC_NAME}.definitions);\n`,
        );
    }

    // Allow multiple query/mutation definitions in a file. This parses out
    // dependencies at compile time, and then uses those at load time to create
    // minimal query documents. We cannot do the latter at compile time due to
    // how the #import code works.
    const namedDefinitions = documentNode.definitions.filter(isNamedDefinition);
    if (namedDefinitions.length > 0 && extractQueries) {
        outputCode.append(
            `const ${graphqlLoaderExtractQuery.name} = ${graphqlLoaderExtractQuery.toString()};\n`,
        );
    }

    // Entries of the `_queries` and `_fragments` registries, as `"name": local`.
    const queries: string[] = [];
    const fragments: string[] = [];

    for (const def of namedDefinitions) {
        const name = def.name.value;

        // Each export is aliased from a `$`-prefixed local. `$` cannot appear
        // in a GraphQL name, so the local can neither collide with the module's
        // own identifiers nor shadow a global the helpers use, and an export
        // specifier accepts reserved words (`export { $delete as delete }`)
        // where `export const delete` would not parse.
        let local = DOC_NAME;
        if (extractQueries) {
            local = `$${name}`;
            outputCode.append(
                `const ${local} = ${graphqlLoaderExtractQuery.name}(${DOC_NAME}, ${JSON.stringify(name)});\n`,
            );
        }
        outputCode.append(`export { ${local} as ${name} };\n`);

        (def.kind === "OperationDefinition" ? queries : fragments).push(
            `${JSON.stringify(name)}: ${local}`,
        );
    }

    outputCode.append(`export const _queries = {${queries.join(", ")}};\n`);
    outputCode.append(`export const _fragments = {${fragments.join(", ")}};\n`);

    outputCode.append(`export default ${DOC_NAME};\n`);

    return {
        code: outputCode.toString(),
        map: options?.noSourceMap ? null : outputCode.generateMap(options?.sourceMapOptions),
    };
};
