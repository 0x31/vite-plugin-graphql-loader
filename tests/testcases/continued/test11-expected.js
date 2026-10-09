const _gql_source = `{
    users {
        name
    }
}
`;
const _gql_doc = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","variableDefinitions":[],"directives":[],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"users"},"arguments":[],"directives":[],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"},"arguments":[],"directives":[]}]}}]},"loc":{"start":0,"end":34}}],"loc":{"start":0,"end":35}};
_gql_doc.loc.source = {"name":"GraphQL request","locationOffset":{"line":1,"column":1}};
_gql_doc.loc.source.body = _gql_source;
_gql_doc.definitions.forEach((def) => Object.defineProperty(def.loc, "source", { value: _gql_doc.loc.source }));
export const _queries = {};
export const _fragments = {};
export default _gql_doc;
