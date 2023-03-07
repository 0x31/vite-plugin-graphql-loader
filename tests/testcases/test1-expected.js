
const doc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TestFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"test"}},"directives":[],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"},"arguments":[],"directives":[]}]}}],"loc":{"start":0,"end":73}};
doc.loc.source = {"body":"\n                fragment TestFragment on test {\n    name\n}\n\n            ","name":"GraphQL request","locationOffset":{"line":1,"column":1}};
          

const names = {};
function unique(defs) {
  return defs.filter(
    function(def) {
      if (def.kind !== 'FragmentDefinition') return true;
      const name = def.name.value
      if (names[name]) {
        return false;
      } else {
        names[name] = true;
        return true;
      }
    }
  )
}


// Collect any fragment/type references from a node, adding them to the refs Set
function collectFragmentReferences(node, refs) {
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
}
const definitionRefs = {};
(function extractReferences() {
  doc.definitions.forEach(function(def) {
    if (def.name) {
      const refs = new Set();
      collectFragmentReferences(def, refs);
      definitionRefs[def.name.value] = refs;
    }
  });
})();
function findOperation(doc, name) {
  for (let i = 0; i < doc.definitions.length; i++) {
    const element = doc.definitions[i];
    if (element.name && element.name.value == name) {
      return element;
    }
  }
}
function oneQuery(doc, operationName) {
  // Copy the DocumentNode, but clear out the definitions
  const newDoc = {
    kind: doc.kind,
    definitions: [findOperation(doc, operationName)]
  };
  if (doc.hasOwnProperty("loc")) {
    newDoc.loc = doc.loc;
  }
  // Now, for the operation we're running, find any fragments referenced by
  // it or the fragments it references
  const opRefs = definitionRefs[operationName] || new Set();
  const allRefs = new Set();
  let newRefs = new Set();
  // IE 11 doesn't support "new Set(iterable)", so we add the members of opRefs to newRefs one by one
  opRefs.forEach(function(refName) {
    newRefs.add(refName);
  });
  while (newRefs.size > 0) {
    const prevRefs = newRefs;
    newRefs = new Set();
    prevRefs.forEach(function(refName) {
      if (!allRefs.has(refName)) {
        allRefs.add(refName);
        const childRefs = definitionRefs[refName] || new Set();
        childRefs.forEach(function(childRef) {
          newRefs.add(childRef);
        });
      }
    });
  }
  allRefs.forEach(function(refName) {
    const op = findOperation(doc, refName);
    if (op) {
      newDoc.definitions.push(op);
    }
  });
  return newDoc;
}

export default doc;

export const TestFragment = oneQuery(doc, "TestFragment");
                
