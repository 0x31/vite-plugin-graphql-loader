// The following snippets are placed into the compiled code, so they should not
// import modules (except `import type` statements) or throw errors. These
// functions can't be run in advance in the plugin transformation because they
// rely on GraphQL #import statements being resolved, so instead these functions
// are included in the output. They are converted to strings using
// `.toString()`, which will return the JavaScript version compiled by the
// TypeScript compiler.

import type { ASTNode, DefinitionNode, DocumentNode } from "graphql";

// Snippets are modified from `graphql-tag/loader.js`
// Source: https://github.com/apollographql/graphql-tag/blob/main/loader.js
// License: MIT (https://github.com/apollographql/graphql-tag/blob/main/LICENSE)

export const vitePluginGraphqlLoaderUniqueChecker = (
    defs: DefinitionNode[],
) => {
    const names = {};
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

export const vitePluginGraphqlLoaderExtractQuery = (
    doc: DocumentNode,
    operationName: string,
) => {
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
        const definitionRefs = {};
        // Extract references.
        doc.definitions.forEach(function (def: DefinitionNode) {
            if ("name" in def && def.name) {
                definitionRefs[def.name.value] = collectFragmentReferences(
                    def,
                    new Set(),
                );
            }
        });
        return definitionRefs;
    };

    const findOperation = (doc: DocumentNode, name: string) => {
        for (let i = 0; i < doc.definitions.length; i++) {
            const element = doc.definitions[i];
            if (
                element &&
                "name" in element &&
                element.name &&
                element.name.value == name
            ) {
                return element;
            }
        }
    };

    const definitionRefs = extractReferences(doc);

    // Copy the DocumentNode, but clear out the definitions.
    const newDoc = Object.assign({}, doc, {
        definitions: [findOperation(doc, operationName)],
    });

    // Now, for the operation we're running, find any fragments referenced by
    // it or the fragments it references.
    const opRefs = definitionRefs[operationName] || new Set<string>();
    const allRefs = new Set<string>();
    let newRefs = new Set<string>();

    // IE 11 doesn't support "new Set(iterable)", so we add the members of
    // opRefs to newRefs one by one.
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
            newDoc.definitions.push(op);
        }
    });

    return newDoc;
};
