const _gql_source = `# https://anmolksachan.github.io/graphql/
query {
    runCommand(command: "ls -la")
}
`;
const _gql_doc = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","variableDefinitions":[],"directives":[],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"runCommand"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"command"},"value":{"kind":"StringValue","value":"ls -la","block":false}}],"directives":[]}]}}],"loc":{"start":0,"end":124,"source":{"name":"GraphQL request","locationOffset":{"line":1,"column":1},"body":_gql_source}}};
export const _queries = {};
export const _fragments = {};
export default _gql_doc;
