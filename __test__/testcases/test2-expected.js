
var doc = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"TestQuery"},"variableDefinitions":[],"directives":[],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"test"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"name"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"StringValue","value":"test","block":false}}]}}]}}],"directives":[],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"fragment"},"directives":[]}]}}]}}],"loc":{"start":0,"end":144}};
doc.loc.source = {"body":"\n                #import \"./test1.gql\"\n\nquery TestQuery {\n    test(where: { name: { _eq: \"test\" } }) {\n        ...fragment\n    }\n}\n\n            ","name":"GraphQL request","locationOffset":{"line":1,"column":1}};
          

var names = {};
function unique(defs) {
  return defs.filter(
    function(def) {
      if (def.kind !== 'FragmentDefinition') return true;
      var name = def.name.value
      if (names[name]) {
        return false;
      } else {
        names[name] = true;
        return true;
      }
    }
  )
}
doc.definitions = doc.definitions.concat(unique((await import("./test1.gql")).default.definitions));


// Collect any fragment/type references from a node, adding them to the refs Set
function collectFragmentReferences(node, refs) {
  if (node.kind === "FragmentSpread") {
    refs.add(node.name.value);
  } else if (node.kind === "VariableDefinition") {
    var type = node.type;
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
var definitionRefs = {};
(function extractReferences() {
  doc.definitions.forEach(function(def) {
    if (def.name) {
      var refs = new Set();
      collectFragmentReferences(def, refs);
      definitionRefs[def.name.value] = refs;
    }
  });
})();
function findOperation(doc, name) {
  for (var i = 0; i < doc.definitions.length; i++) {
    var element = doc.definitions[i];
    if (element.name && element.name.value == name) {
      return element;
    }
  }
}
function oneQuery(doc, operationName) {
  // Copy the DocumentNode, but clear out the definitions
  var newDoc = {
    kind: doc.kind,
    definitions: [findOperation(doc, operationName)]
  };
  if (doc.hasOwnProperty("loc")) {
    newDoc.loc = doc.loc;
  }
  // Now, for the operation we're running, find any fragments referenced by
  // it or the fragments it references
  var opRefs = definitionRefs[operationName] || new Set();
  var allRefs = new Set();
  var newRefs = new Set();
  // IE 11 doesn't support "new Set(iterable)", so we add the members of opRefs to newRefs one by one
  opRefs.forEach(function(refName) {
    newRefs.add(refName);
  });
  while (newRefs.size > 0) {
    var prevRefs = newRefs;
    newRefs = new Set();
    prevRefs.forEach(function(refName) {
      if (!allRefs.has(refName)) {
        allRefs.add(refName);
        var childRefs = definitionRefs[refName] || new Set();
        childRefs.forEach(function(childRef) {
          newRefs.add(childRef);
        });
      }
    });
  }
  allRefs.forEach(function(refName) {
    var op = findOperation(doc, refName);
    if (op) {
      newDoc.definitions.push(op);
    }
  });
  return newDoc;
}

module.exports = doc;

module.exports["TestQuery"] = oneQuery(doc, "TestQuery");
                
