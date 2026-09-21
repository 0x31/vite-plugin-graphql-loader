import Import____fragment__gql from "./_fragment_.gql";
import Import____fragment__gql_ from "./_fragment-.gql";
const _gql_source = `#import "./_fragment_.gql"
#import "./_fragment-.gql"

# Both files declare Frag1, so the dedup in the emitted module has to keep
# exactly one copy. Uses "./"-prefixed paths so the emitted ESM import
# resolves at runtime, not just at transform time.
query ImportingQuery {
    test {
        ...Frag1
    }
}
`;
const _gql_doc = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"ImportingQuery"},"variableDefinitions":[],"directives":[],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"test"},"arguments":[],"directives":[],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"Frag1"},"directives":[]}]}}]}}],"loc":{"start":0,"end":311}};
_gql_doc.loc.source = {"name":"GraphQL request","locationOffset":{"line":1,"column":1}};
_gql_doc.loc.source.body = _gql_source;
const graphqlLoaderUniqueChecker = (defs) => {
	// `Object.create(null)` so property lookups don't hit Object.prototype —
	// a fragment named `constructor` or `toString` would otherwise be falsely
	// reported as a duplicate and dropped on its first occurrence.
	const names = Object.create(null);
	return defs.filter(function(def) {
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
_gql_doc.definitions = graphqlLoaderUniqueChecker(_gql_doc.definitions.concat(Import____fragment__gql.definitions));
_gql_doc.definitions = graphqlLoaderUniqueChecker(_gql_doc.definitions.concat(Import____fragment__gql_.definitions));
const graphqlLoaderExtractQuery = (doc, operationName) => {
	// Recursively navigate node tree to find references to fragments.
	const collectFragmentReferences = (node, refs) => {
		if (node.kind === "FragmentSpread") {
			refs.add(node.name.value);
		} else if (node.kind === "VariableDefinition") {
			const type = node.type;
			if (type.kind === "NamedType") {
				refs.add(type.name.value);
			}
		};
		if (node && "selectionSet" in node && node.selectionSet) {
			node.selectionSet.selections.forEach((selection) => {
				collectFragmentReferences(selection, refs);
			});
		};
		if (node && "variableDefinitions" in node && node.variableDefinitions) {
			node.variableDefinitions.forEach((def) => {
				collectFragmentReferences(def, refs);
			});
		};
		if (node && "definitions" in node && node.definitions) {
			node.definitions.forEach((def) => {
				collectFragmentReferences(def, refs);
			});
		};
		return refs;
	};
	const extractReferences = (doc) => {
		// `Object.create(null)` so a definition named `constructor` or
		// `toString` doesn't collide with Object.prototype properties.
		const definitionRefs = Object.create(null);
		// Extract references.
		doc.definitions.forEach(function(def) {
			if ("name" in def && def.name) {
				definitionRefs[def.name.value] = collectFragmentReferences(def, new Set());
			}
		});
		return definitionRefs;
	};
	const findOperation = (doc, name) => {
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
	};
	// Copy the DocumentNode, but clear out the definitions.
	const newDoc = Object.assign({}, doc, { definitions: [rootOperation] });
	// Now, for the operation we're running, find any fragments referenced by
	// it or the fragments it references.
	const opRefs = definitionRefs[operationName] || new Set();
	const allRefs = new Set();
	let newRefs = new Set();
	opRefs.forEach((refName) => {
		newRefs.add(refName);
	});
	while (newRefs.size > 0) {
		const prevRefs = newRefs;
		newRefs = new Set();
		prevRefs.forEach((refName) => {
			if (!allRefs.has(refName)) {
				allRefs.add(refName);
				const childRefs = definitionRefs[refName] || new Set();
				childRefs.forEach((childRef) => {
					newRefs.add(childRef);
				});
			}
		});
	};
	allRefs.forEach((refName) => {
		const op = findOperation(doc, refName);
		if (op) {
			newDoc.definitions.push(op);
		}
	});
	return newDoc;
};
export const ImportingQuery = graphqlLoaderExtractQuery(_gql_doc, "ImportingQuery");
export const _queries = {ImportingQuery};
export const _fragments = {};
export default _gql_doc;
