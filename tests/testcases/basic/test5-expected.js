const _gql_source = `fragment TestFragment on test {
    name
}

query TestQuery {
    test(where: { name: { _eq: "\\\\\`a" } }) {
        ...TestFragment
    }
}

query TestQuery2 {
    test(where: { name: { _eq: "test" } }) {
        ...TestFragment
    }
}
`;
const _gql_doc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TestFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"test"}},"directives":[],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"},"arguments":[],"directives":[]}]},"loc":{"start":0,"end":42}},{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"TestQuery"},"variableDefinitions":[],"directives":[],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"test"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"name"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"StringValue","value":"\\`a","block":false}}]}}]}}],"directives":[],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TestFragment"},"directives":[]}]}}]},"loc":{"start":44,"end":138}},{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"TestQuery2"},"variableDefinitions":[],"directives":[],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"test"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"name"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"StringValue","value":"test","block":false}}]}}]}}],"directives":[],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TestFragment"},"directives":[]}]}}]},"loc":{"start":140,"end":235}}],"loc":{"start":0,"end":236}};
_gql_doc.loc.source = {"name":"GraphQL request","locationOffset":{"line":1,"column":1}};
_gql_doc.loc.source.body = _gql_source;
_gql_doc.definitions.forEach((def) => Object.defineProperty(def.loc, "source", { value: _gql_doc.loc.source }));
const graphqlLoaderSourceLoc = (definitions) => {
	const parts = [];
	for (const definition of definitions) {
		const loc = definition.loc;
		if (!loc || !loc.source) return undefined;
		parts.push(loc.source.body.slice(loc.start, loc.end));
	};
	const body = parts.join("\n\n");
	return {
		start: 0,
		end: body.length,
		source: {
			body,
			name: "GraphQL request",
			locationOffset: {
				line: 1,
				column: 1
			}
		}
	};
};
const graphqlLoaderExtractQuery = (doc, operationName) => {
	// Names of the fragments a node spreads, including inside nested selections.
	const collectFragmentReferences = (node, refs) => {
		if (node.kind === "FragmentSpread") {
			refs.add(node.name.value);
		};
		if ("selectionSet" in node && node.selectionSet) {
			node.selectionSet.selections.forEach((selection) => {
				collectFragmentReferences(selection, refs);
			});
		};
		return refs;
	};
	// A spread only ever names a fragment, so an #imported fragment named like
	// a local operation neither shadows it nor is shadowed by it.
	const findFragment = (name) => doc.definitions.find((def) => def.kind === "FragmentDefinition" && def.name.value === name);
	const rootOperation = doc.definitions.find((def) => (def.kind === "OperationDefinition" || def.kind === "FragmentDefinition") && def.name !== undefined && def.name.value === operationName);
	if (!rootOperation) {
		throw new Error(`graphql-loader: operation "${operationName}" not found in document`);
	};
	const definitions = [rootOperation];
	const included = new Set();
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
	};
	// The file's `loc` describes every definition in the file, so the new
	// document gets one describing only its own. Clients that send
	// `loc.source.body` rather than printing (urql, graphql-tag's `gql`)
	// would otherwise send every operation in the file.
	const { loc: _wholeFileLoc, ...docWithoutLoc } = doc;
	const loc = graphqlLoaderSourceLoc(definitions);
	return loc ? {
		...docWithoutLoc,
		definitions,
		loc
	} : {
		...docWithoutLoc,
		definitions
	};
};
const $TestFragment = graphqlLoaderExtractQuery(_gql_doc, "TestFragment");
export { $TestFragment as TestFragment };
const $TestQuery = graphqlLoaderExtractQuery(_gql_doc, "TestQuery");
export { $TestQuery as TestQuery };
const $TestQuery2 = graphqlLoaderExtractQuery(_gql_doc, "TestQuery2");
export { $TestQuery2 as TestQuery2 };
export const _queries = {"TestQuery": $TestQuery, "TestQuery2": $TestQuery2};
export const _fragments = {"TestFragment": $TestFragment};
export default _gql_doc;
