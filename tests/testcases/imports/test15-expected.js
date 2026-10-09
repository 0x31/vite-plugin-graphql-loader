import Import__fragment__gql from "_fragment_.gql";
import Import__fragment__gql_ from "_fragment-.gql";
const _gql_source = `#import "_fragment_.gql"
#import "_fragment-.gql"

# Test that both fragments are imported.
query {
    test {
        ...Frag1
    }
}
`;
const _gql_doc = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","variableDefinitions":[],"directives":[],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"test"},"arguments":[],"directives":[],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"Frag1"},"directives":[]}]}}]}}],"loc":{"start":0,"end":136}};
_gql_doc.loc.source = {"name":"GraphQL request","locationOffset":{"line":1,"column":1}};
_gql_doc.loc.source.body = _gql_source;
[[92,135]].forEach(([start, end], i) => Object.defineProperty(_gql_doc.definitions[i], "loc", { value: { start, end, source: _gql_doc.loc.source } }));
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
_gql_doc.definitions = graphqlLoaderUniqueChecker(_gql_doc.definitions.concat(Import__fragment__gql.definitions));
_gql_doc.definitions = graphqlLoaderUniqueChecker(_gql_doc.definitions.concat(Import__fragment__gql_.definitions));
_gql_doc.loc = graphqlLoaderSourceLoc(_gql_doc.definitions);
export const _queries = {};
export const _fragments = {};
export default _gql_doc;
