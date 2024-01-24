
const doc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TestFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"test"}},"directives":[],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"},"arguments":[],"directives":[]}]}}],"loc":{"start":0,"end":73}};
doc.loc.source = {"body":"\n                fragment TestFragment on test {\n    name\n}\n\n            ","name":"GraphQL request","locationOffset":{"line":1,"column":1}};
          


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

export const TestFragment = oneQuery(doc, "TestFragment");
_fragments["TestFragment"] = TestFragment;
