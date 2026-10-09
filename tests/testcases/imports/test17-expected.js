import Import___test1_gql from "./test1.gql";
const _gql_source = `#import TestFragment from ./test1.gql

query TestQuery {
    test(where: { name: { _eq: "test" } }) {
        ...TestFragment
    }
}
`;
const _gql_doc = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"TestQuery"},"variableDefinitions":[],"directives":[],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"test"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"name"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"StringValue","value":"test","block":false}}]}}]}}],"directives":[],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TestFragment"},"directives":[]}]}}]},"loc":{"start":39,"end":133}}],"loc":{"start":0,"end":134}};
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
const graphqlLoaderUniqueChecker = (defs) => {
	// `Object.create(null)` so property lookups don't hit Object.prototype: a
	// fragment named `constructor` or `toString` would otherwise be falsely
	// reported as a duplicate and dropped on its first occurrence.
	const seen = Object.create(null);
	return defs.filter((def) => {
		if (def.kind !== "FragmentDefinition" && def.kind !== "OperationDefinition") return true;
		if (!def.name) return true;
		// Operations and fragments are separate namespaces. `loc` says which
		// file a definition came from, so it is left out of the comparison.
		const key = `${def.kind}:${def.name.value}`;
		const serialized = JSON.stringify({
			...def,
			loc: undefined
		});
		if (!(key in seen)) {
			seen[key] = serialized;
			return true;
		};
		if (seen[key] === serialized) return false;
		throw new Error(`graphql-loader: ${def.kind === "FragmentDefinition" ? "fragment" : "operation"} "${def.name.value}" is defined differently in two files merged by #import`);
	});
};
_gql_doc.definitions = graphqlLoaderUniqueChecker(_gql_doc.definitions.concat(Import___test1_gql.definitions));
_gql_doc.loc = graphqlLoaderSourceLoc(_gql_doc.definitions);
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
const $TestQuery = graphqlLoaderExtractQuery(_gql_doc, "TestQuery");
export { $TestQuery as TestQuery };
export const _queries = {"TestQuery": $TestQuery};
export const _fragments = {};
export default _gql_doc;
