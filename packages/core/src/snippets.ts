// The following snippets are placed into the compiled code, so they should not
// import modules (except `import type` statements) or throw errors. These
// functions can't be run in advance in the plugin transformation because they
// rely on GraphQL #import statements being resolved, so instead these functions
// are included in the output. They are converted to strings using
// `.toString()`, which will return the JavaScript version compiled by the
// TypeScript compiler.

import type { ASTNode, DefinitionNode, DocumentNode, Location } from "graphql";

// Snippets are modified from `graphql-tag/loader.js`
// Source: https://github.com/apollographql/graphql-tag/blob/main/loader.js
// License: MIT (https://github.com/apollographql/graphql-tag/blob/main/LICENSE)

// Both helpers carry explicit return types: an inferred one spells out every
// node kind, including kinds newer than the oldest `graphql` the peer range
// allows, and the shipped declarations then fail to type-check against it.
export const graphqlLoaderUniqueChecker = (defs: DefinitionNode[]): DefinitionNode[] => {
    // `Object.create(null)` so property lookups don't hit Object.prototype —
    // a fragment named `constructor` or `toString` would otherwise be falsely
    // reported as a duplicate and dropped on its first occurrence.
    const names: Record<string, true> = Object.create(null);
    return defs.filter(function (def) {
        if (def.kind !== "FragmentDefinition") return true;
        const name = def.name.value;
        if (names[name]) {
            return false;
        } else {
            names[name] = true;
            return true;
        }
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

export const graphqlLoaderExtractQuery = (
    doc: DocumentNode,
    operationName: string,
): DocumentNode => {
    // Recursively navigate node tree to find references to fragments.
    const collectFragmentReferences = (node: ASTNode, refs: Set<string>) => {
        if (node.kind === "FragmentSpread") {
            refs.add(node.name.value);
        } else if (node.kind === "VariableDefinition") {
            const type = node.type;
            if (type.kind === "NamedType") {
                refs.add(type.name.value);
            }
        }
        if (node && "selectionSet" in node && node.selectionSet) {
            node.selectionSet.selections.forEach((selection) => {
                collectFragmentReferences(selection, refs);
            });
        }
        if (node && "variableDefinitions" in node && node.variableDefinitions) {
            node.variableDefinitions.forEach((def) => {
                collectFragmentReferences(def, refs);
            });
        }
        if (node && "definitions" in node && node.definitions) {
            node.definitions.forEach((def) => {
                collectFragmentReferences(def, refs);
            });
        }

        return refs;
    };

    const extractReferences = (doc: DocumentNode) => {
        // `Object.create(null)` so a definition named `constructor` or
        // `toString` doesn't collide with Object.prototype properties.
        const definitionRefs: Record<string, Set<string>> = Object.create(null);
        // Extract references.
        doc.definitions.forEach(function (def: DefinitionNode) {
            if ("name" in def && def.name) {
                definitionRefs[def.name.value] = collectFragmentReferences(def, new Set());
            }
        });
        return definitionRefs;
    };

    const findOperation = (doc: DocumentNode, name: string) => {
        for (let i = 0; i < doc.definitions.length; i++) {
            const element = doc.definitions[i];
            if (element && "name" in element && element.name && element.name.value === name) {
                return element;
            }
        }
    };

    const definitionRefs = extractReferences(doc);

    const rootOperation = findOperation(doc, operationName);
    if (!rootOperation) {
        throw new Error(`graphql-loader: operation "${operationName}" not found in document`);
    }

    const definitions: DefinitionNode[] = [rootOperation];

    // Now, for the operation we're running, find any fragments referenced by
    // it or the fragments it references.
    const opRefs = definitionRefs[operationName] || new Set<string>();
    const allRefs = new Set<string>();
    let newRefs = new Set<string>();

    opRefs.forEach((refName: string) => {
        newRefs.add(refName);
    });

    while (newRefs.size > 0) {
        const prevRefs = newRefs;
        newRefs = new Set();
        prevRefs.forEach((refName: string) => {
            if (!allRefs.has(refName)) {
                allRefs.add(refName);
                const childRefs = definitionRefs[refName] || new Set();
                childRefs.forEach((childRef: string) => {
                    newRefs.add(childRef);
                });
            }
        });
    }

    allRefs.forEach((refName) => {
        const op = findOperation(doc, refName);
        if (op) {
            definitions.push(op);
        }
    });

    // The file's `loc` describes every definition in the file, so the new
    // document gets one describing only its own. Clients that send
    // `loc.source.body` rather than printing (urql, graphql-tag's `gql`)
    // would otherwise send every operation in the file.
    const { loc: _wholeFileLoc, ...docWithoutLoc } = doc;
    const loc = graphqlLoaderSourceLoc(definitions);
    return loc ? { ...docWithoutLoc, definitions, loc } : { ...docWithoutLoc, definitions };
};
