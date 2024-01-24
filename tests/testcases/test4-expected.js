
const doc = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"TestQuery"},"variableDefinitions":[],"directives":[],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"test"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"name"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"StringValue","value":"test","block":false}}]}}]}}],"directives":[],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TestFragment"},"directives":[]}]}}]}},{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"TestQuery2"},"variableDefinitions":[],"directives":[],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"test"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"name"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"StringValue","value":"test","block":false}}]}}]}}],"directives":[],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TestFragment"},"directives":[]}]}}]}}],"loc":{"start":0,"end":245}};
doc.loc.source = {"body":"\n                #import \"./test1.gql\"\n\nquery TestQuery {\n    test(where: { name: { _eq: \"test\" } }) {\n        ...TestFragment\n    }\n}\n\nquery TestQuery2 {\n    test(where: { name: { _eq: \"test\" } }) {\n        ...TestFragment\n    }\n}\n\n            ","name":"GraphQL request","locationOffset":{"line":1,"column":1}};
          

const names = {};
const unique = (defs) => {
  return defs.filter(function(def) {
    if (def.kind !== "FragmentDefinition")
      return true;
    const name = def.name.value;
    if (names[name]) {
      return false;
    } else {
      names[name] = true;
      return true;
    }
  });
};
import Import____test1_gql_ from "./test1.gql";
doc.definitions = doc.definitions.concat(unique(Import____test1_gql_.definitions));


const collectFragmentReferences = (node, refs) => {
  if (node.kind === "FragmentSpread") {
    refs.add(node.name.value);
  } else if (node.kind === "VariableDefinition") {
    const type = node.type;
    if (type.kind === "NamedType") {
      refs.add(type.name.value);
    }
  }
  if (node.selectionSet) {
    node.selectionSet.selections.forEach(function(selection) {
      collectFragmentReferences(selection, refs);
    });
  }
  if (node.variableDefinitions) {
    node.variableDefinitions.forEach(function(def) {
      collectFragmentReferences(def, refs);
    });
  }
  if (node.definitions) {
    node.definitions.forEach(function(def) {
      collectFragmentReferences(def, refs);
    });
  }
};
const definitionRefs = {};
const extractReferences = (doc) => {
  doc.definitions.forEach(function(def) {
    if (def.name) {
      const refs = /* @__PURE__ */ new Set();
      collectFragmentReferences(def, refs);
      definitionRefs[def.name.value] = refs;
    }
  });
};
extractReferences(doc);
const findOperation = (doc, name) => {
  for (let i = 0; i < doc.definitions.length; i++) {
    const element = doc.definitions[i];
    if (element.name && element.name.value == name) {
      return element;
    }
  }
};
const oneQuery = (doc, operationName) => {
  const newDoc = {
    kind: doc.kind,
    definitions: [findOperation(doc, operationName)]
  };
  if (doc.hasOwnProperty("loc")) {
    newDoc.loc = doc.loc;
  }
  const opRefs = definitionRefs[operationName] || /* @__PURE__ */ new Set();
  const allRefs = /* @__PURE__ */ new Set();
  let newRefs = /* @__PURE__ */ new Set();
  opRefs.forEach((refName) => {
    newRefs.add(refName);
  });
  while (newRefs.size > 0) {
    const prevRefs = newRefs;
    newRefs = /* @__PURE__ */ new Set();
    prevRefs.forEach((refName) => {
      if (!allRefs.has(refName)) {
        allRefs.add(refName);
        const childRefs = definitionRefs[refName] || /* @__PURE__ */ new Set();
        childRefs.forEach((childRef) => {
          newRefs.add(childRef);
        });
      }
    });
  }
  allRefs.forEach((refName) => {
    const op = findOperation(doc, refName);
    if (op) {
      newDoc.definitions.push(op);
    }
  });
  return newDoc;
};

export const _queries = {};
export const _fragments = {};

export default doc;

export const TestQuery = oneQuery(doc, "TestQuery");
_queries["TestQuery"] = TestQuery;
export const TestQuery2 = oneQuery(doc, "TestQuery2");
_queries["TestQuery2"] = TestQuery2;
