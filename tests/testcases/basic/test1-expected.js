const _gql_source = `fragment TestFragment on test {
    name
}
`;
const _gql_doc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TestFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"test"}},"directives":[],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"},"arguments":[],"directives":[]}]}}],"loc":{"start":0,"end":81,"source":{"name":"GraphQL request","locationOffset":{"line":1,"column":1},"body":_gql_source}}};
export const TestFragment = _gql_doc;
export const _queries = {};
export const _fragments = {TestFragment};
export default _gql_doc;
