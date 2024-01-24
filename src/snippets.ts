const names = {};
const unique = (defs) => {
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

export const UNIQUE_FUNCTION_TEMPLATE = `
const names = {};
const unique = ${unique.toString()};
`;

// Collect any fragment/type references from a node, adding them to the refs Set
const collectFragmentReferences = (node, refs) => {
    if (node.kind === "FragmentSpread") {
        refs.add(node.name.value);
    } else if (node.kind === "VariableDefinition") {
        const type = node.type;
        if (type.kind === "NamedType") {
            refs.add(type.name.value);
        }
    }
    if (node.selectionSet) {
        node.selectionSet.selections.forEach(function (selection) {
            collectFragmentReferences(selection, refs);
        });
    }
    if (node.variableDefinitions) {
        node.variableDefinitions.forEach(function (def) {
            collectFragmentReferences(def, refs);
        });
    }
    if (node.definitions) {
        node.definitions.forEach(function (def) {
            collectFragmentReferences(def, refs);
        });
    }
};
const definitionRefs = {};
const extractReferences = (doc) => {
    // Extract references.
    doc.definitions.forEach(function (def) {
        if (def.name) {
            const refs = new Set();
            collectFragmentReferences(def, refs);
            definitionRefs[def.name.value] = refs;
        }
    });
};
const findOperation = (doc, name) => {
    for (let i = 0; i < doc.definitions.length; i++) {
        const element = doc.definitions[i];
        if (element.name && element.name.value == name) {
            return element;
        }
    }
};
const oneQuery = (doc, operationName) => {
    // Copy the DocumentNode, but clear out the definitions
    const newDoc: any = {
        kind: doc.kind,
        definitions: [findOperation(doc, operationName)],
    };
    if (doc.hasOwnProperty("loc")) {
        newDoc.loc = doc.loc;
    }
    // Now, for the operation we're running, find any fragments referenced by
    // it or the fragments it references
    const opRefs = definitionRefs[operationName] || new Set<string>();
    const allRefs = new Set<string>();
    let newRefs = new Set<string>();
    // IE 11 doesn't support "new Set(iterable)", so we add the members of opRefs to newRefs one by one
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

export const ONE_QUERY_FUNCTION_TEMPLATE = `
const collectFragmentReferences = ${collectFragmentReferences.toString()};
const definitionRefs = {};
const extractReferences = ${extractReferences.toString()};
extractReferences(doc);
const findOperation = ${findOperation.toString()};
const oneQuery = ${oneQuery.toString()};

export const _queries = {};
export const _fragments = {};

export default doc;
`;
