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
const _gql_doc = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","variableDefinitions":[],"directives":[],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"test"},"arguments":[],"directives":[],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"Frag1"},"directives":[]}]}}]}}],"loc":{"start":0,"end":174}};
_gql_doc.loc.source = {"name":"GraphQL request","locationOffset":{"line":1,"column":1}};
_gql_doc.loc.source.body = _gql_source;
const vitePluginGraphqlLoaderUniqueChecker = (defs) => {
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
_gql_doc.definitions = vitePluginGraphqlLoaderUniqueChecker(_gql_doc.definitions.concat(Import__fragment__gql.definitions));
_gql_doc.definitions = vitePluginGraphqlLoaderUniqueChecker(_gql_doc.definitions.concat(Import__fragment__gql_.definitions));
export const _queries = {};
export const _fragments = {};
export default _gql_doc;
