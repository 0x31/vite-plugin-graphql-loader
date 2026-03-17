const _gql_source = `fragment TestFragment on test {
    name
}

query TestQuery {
    test(where: { name: { _eq: "\\\`a" } }) {
        ...TestFragment
    }
}

query TestQuery2 {
    test(where: { name: { _eq: "test" } }) {
        ...TestFragment
    }
}
`;
const _gql_doc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TestFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"test"}},"directives":[],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"},"arguments":[],"directives":[]}]}},{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"TestQuery"},"variableDefinitions":[],"directives":[],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"test"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"name"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"StringValue","value":"\\`a","block":false}}]}}]}}],"directives":[],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TestFragment"},"directives":[]}]}}]}},{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"TestQuery2"},"variableDefinitions":[],"directives":[],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"test"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"name"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"StringValue","value":"test","block":false}}]}}]}}],"directives":[],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TestFragment"},"directives":[]}]}}]}}],"loc":{"start":0,"end":274,"source":{"name":"GraphQL request","locationOffset":{"line":1,"column":1},"body":_gql_source}}};
const vitePluginGraphqlLoaderExtractQuery = (doc, operationName) => {
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
		const definitionRefs = {};
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
	// Copy the DocumentNode, but clear out the definitions.
	const newDoc = Object.assign({}, doc, { definitions: [findOperation(doc, operationName)] });
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
export const TestFragment = vitePluginGraphqlLoaderExtractQuery(_gql_doc, "TestFragment");
export const TestQuery = vitePluginGraphqlLoaderExtractQuery(_gql_doc, "TestQuery");
export const TestQuery2 = vitePluginGraphqlLoaderExtractQuery(_gql_doc, "TestQuery2");
export const _queries = {TestQuery,TestQuery2};
export const _fragments = {TestFragment};
export default _gql_doc;
