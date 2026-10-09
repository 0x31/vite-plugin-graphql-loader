const _gql_source = `{
    users {
        name
    }
}
`;
const _gql_doc = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","variableDefinitions":[],"directives":[],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"users"},"arguments":[],"directives":[],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"},"arguments":[],"directives":[]}]}}]}}],"loc":{"start":0,"end":35}};
_gql_doc.loc.source = {"name":"GraphQL request","locationOffset":{"line":1,"column":1}};
_gql_doc.loc.source.body = _gql_source;
[[0,34]].forEach(([start, end], i) => Object.defineProperty(_gql_doc.definitions[i], "loc", { value: { start, end, source: _gql_doc.loc.source } }));
export const _queries = {};
export const _fragments = {};
export default _gql_doc;
