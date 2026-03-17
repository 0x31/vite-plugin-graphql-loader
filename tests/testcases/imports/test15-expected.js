import Import___fragment__gql_ from "_fragment_.gql";
import Import___fragment__gql__ from "_fragment-.gql";
const _gql_source = `#import "_fragment_.gql"
#import "_fragment-.gql"

# Test that both fragments are imported.
query {
    test {
        ...Frag1
    }
}
`;
const _gql_doc = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","variableDefinitions":[],"directives":[],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"test"},"arguments":[],"directives":[],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"Frag1"},"directives":[]}]}}]}}],"loc":{"start":0,"end":174,"source":{"name":"GraphQL request","locationOffset":{"line":1,"column":1},"body":_gql_source}}};
const vitePluginGraphqlLoaderUniqueChecker = (defs) => {
	const names = {};
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
_gql_doc.definitions = vitePluginGraphqlLoaderUniqueChecker(_gql_doc.definitions.concat(Import___fragment__gql_.definitions));
_gql_doc.definitions = vitePluginGraphqlLoaderUniqueChecker(_gql_doc.definitions.concat(Import___fragment__gql__.definitions));
export const _queries = {};
export const _fragments = {};
export default _gql_doc;
