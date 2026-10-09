// The following snippets are placed into the compiled code, so they should not
// import modules (except `import type` statements). These functions can't be
// run in advance in the plugin transformation because they rely on GraphQL
// #import statements being resolved, so instead these functions are included
// in the output. They are converted to strings using `.toString()`, which will
// return the JavaScript version compiled by the TypeScript compiler.

import type { ASTNode, DefinitionNode, DocumentNode, Location } from "graphql";

// Snippets are modified from `graphql-tag/loader.js`
// Source: https://github.com/apollographql/graphql-tag/blob/main/loader.js
// License: MIT (https://github.com/apollographql/graphql-tag/blob/main/LICENSE)

// Both helpers carry explicit return types: an inferred one spells out every
// node kind, including kinds newer than the oldest `graphql` the peer range
// allows, and the shipped declarations then fail to type-check against it.

// Merges the definitions of a file and the files it #imports. The same
// definition reached through two import paths is kept once. Two different
// definitions sharing a name would make the merged document invalid, so that
// is an error here rather than a server error later.
export const graphqlLoaderUniqueChecker = (defs: DefinitionNode[]): DefinitionNode[] => {
    // `Object.create(null)` so property lookups don't hit Object.prototype: a
    // fragment named `constructor` or `toString` would otherwise be falsely
    // reported as a duplicate and dropped on its first occurrence.
    const seen: Record<string, string> = Object.create(null);
    return defs.filter((def) => {
        if (def.kind !== "FragmentDefinition" && def.kind !== "OperationDefinition") return true;
        if (!def.name) return true;

        // Operations and fragments are separate namespaces. `loc` says which
        // file a definition came from, so it is left out of the comparison.
        const key = `${def.kind}:${def.name.value}`;
        const serialized = JSON.stringify({ ...def, loc: undefined });
        if (!(key in seen)) {
            seen[key] = serialized;
            return true;
        }
        if (seen[key] === serialized) return false;
        throw new Error(
            `graphql-loader: ${def.kind === "FragmentDefinition" ? "fragment" : "operation"} "${def.name.value}" is defined differently in two files merged by #import`,
        );
    });
};

// A `loc` for a document assembled from these definitions, with a body made
// of each definition's own text. Every definition the loader emits carries
// the offsets of its text and a reference to the source it came from, so the
// body matches the definitions even when they come from several files.
export const graphqlLoaderSourceLoc = (
    definitions: readonly DefinitionNode[],
): Location | undefined => {
    const parts: string[] = [];
    for (const definition of definitions) {
        const loc = definition.loc;
        if (!loc || !loc.source) return undefined;
        parts.push(loc.source.body.slice(loc.start, loc.end));
    }
    const body = parts.join("\n\n");
    return {
        start: 0,
        end: body.length,
        source: { body, name: "GraphQL request", locationOffset: { line: 1, column: 1 } },
    } as unknown as Location;
};

// A document holding one named operation or fragment of `doc` together with
// every fragment it spreads, directly or through other fragments.
export const graphqlLoaderExtractQuery = (
    doc: DocumentNode,
    operationName: string,
): DocumentNode => {
    // Names of the fragments a node spreads, including inside nested selections.
    const collectFragmentReferences = (node: ASTNode, refs: Set<string>): Set<string> => {
        if (node.kind === "FragmentSpread") {
            refs.add(node.name.value);
        }
        if ("selectionSet" in node && node.selectionSet) {
            node.selectionSet.selections.forEach((selection) => {
                collectFragmentReferences(selection, refs);
            });
        }
        return refs;
    };

    // A spread only ever names a fragment, so an #imported fragment named like
    // a local operation neither shadows it nor is shadowed by it.
    const findFragment = (name: string) =>
        doc.definitions.find((def) => def.kind === "FragmentDefinition" && def.name.value === name);

    const rootOperation = doc.definitions.find(
        (def) =>
            (def.kind === "OperationDefinition" || def.kind === "FragmentDefinition") &&
            def.name !== undefined &&
            def.name.value === operationName,
    );
    if (!rootOperation) {
        throw new Error(`graphql-loader: operation "${operationName}" not found in document`);
    }

    const definitions: DefinitionNode[] = [rootOperation];
    const included = new Set<string>();
    const pending = [...collectFragmentReferences(rootOperation, new Set())];
    for (let i = 0; i < pending.length; i++) {
        const name = pending[i];
        if (included.has(name)) continue;
        included.add(name);
        // A spread of a fragment the document doesn't define is left for
        // validation to report.
        const fragment = findFragment(name);
        if (!fragment) continue;
        definitions.push(fragment);
        pending.push(...collectFragmentReferences(fragment, new Set()));
    }

    // The file's `loc` describes every definition in the file, so the new
    // document gets one describing only its own. Clients that send
    // `loc.source.body` rather than printing (urql, graphql-tag's `gql`)
    // would otherwise send every operation in the file.
    const { loc: _wholeFileLoc, ...docWithoutLoc } = doc;
    const loc = graphqlLoaderSourceLoc(definitions);
    return loc ? { ...docWithoutLoc, definitions, loc } : { ...docWithoutLoc, definitions };
};
