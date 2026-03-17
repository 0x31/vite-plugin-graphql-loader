import { print, type DocumentNode } from "graphql";

// 1. Basic unnamed query
import basicDoc from "./graphql/basic.gql";
// 2. Standalone fragment
import fragmentDoc, { _fragments as fragFragments } from "./graphql/fragment.gql";
// 3. Multiple named queries + inline fragment (.graphql extension)
import multiDoc, {
    _queries as multiQueries,
    _fragments as multiFragments,
} from "./graphql/multi-query.graphql";
// 4. #import with quoted path
import importDoc from "./graphql/with-import.gql";
// 5. #import without quotes
import importUnquotedDoc from "./graphql/import-unquoted.gql";
// 6. #import with named syntax
import importNamedDoc from "./graphql/import-named.gql";
// 7. Backtick escaping in query strings
import backtickDoc from "./graphql/backtick.graphql";

function assert(condition: boolean, message: string): asserts condition {
    if (!condition) throw new Error("FAIL: " + message);
}

function assertDocument(doc: DocumentNode, label: string): void {
    assert(doc.kind === "Document", `${label}: expected Document kind`);
    assert(Array.isArray(doc.definitions), `${label}: expected definitions array`);
}

// Verify TypeScript types are correct at compile time
const _typeCheck1: DocumentNode = basicDoc;
const _typeCheck2: Record<string, DocumentNode> = multiQueries;
const _typeCheck3: Record<string, unknown> = multiFragments;
void _typeCheck1;
void _typeCheck2;
void _typeCheck3;

// --- 1. Basic unnamed query ---
assertDocument(basicDoc, "basic");
assert(basicDoc.definitions.length === 1, "basic: should have 1 definition");
assert(
    basicDoc.definitions[0].kind === "OperationDefinition",
    "basic: should be OperationDefinition",
);

// --- 2. Standalone fragment ---
assertDocument(fragmentDoc, "fragment");
assert(
    fragmentDoc.definitions[0].kind === "FragmentDefinition",
    "fragment: should be FragmentDefinition",
);
assert(!!fragFragments.UserFields, "_fragments should contain UserFields");

// --- 3. Multiple queries + fragment ---
assertDocument(multiDoc, "multi");
assert(multiDoc.definitions.length === 3, "multi: should have 3 definitions");
// Verify _queries and _fragments typed access
assertDocument(multiQueries.GetPosts, "GetPosts via _queries");
assertDocument(multiQueries.GetPost, "GetPost via _queries");
assert(!!multiFragments.PostFields, "_fragments should contain PostFields");
assert(!multiFragments.GetPosts, "GetPosts should not be in _fragments");
// Verify operation extraction — GetPosts should only include its own op + PostFields
const getPostsDefs = multiQueries.GetPosts.definitions.map(
    (d) => ("name" in d && d.name?.value) || null,
);
assert(getPostsDefs.includes("GetPosts"), "GetPosts: missing own operation");
assert(getPostsDefs.includes("PostFields"), "GetPosts: missing PostFields fragment");
assert(!getPostsDefs.includes("GetPost"), "GetPosts: should not include GetPost");

// --- 4. #import with quoted path ---
assertDocument(importDoc, "import-quoted");
assert(importDoc.definitions.length >= 1, "import-quoted: should have definitions");

// --- 5. #import without quotes ---
assertDocument(importUnquotedDoc, "import-unquoted");

// --- 6. #import with named syntax ---
assertDocument(importNamedDoc, "import-named");

// --- 7. Backtick escaping ---
assertDocument(backtickDoc, "backtick");
assert(
    backtickDoc.loc!.source.body.includes("`template`"),
    "backtick: source body should preserve backticks",
);

// --- 8. Round-trip through graphql's print() to verify spec-compliant DocumentNodes ---
const printedBasic = print(basicDoc);
assert(printedBasic.includes("users"), "print(basic): should contain 'users' field");

const printedGetPosts = print(multiQueries.GetPosts);
assert(printedGetPosts.includes("GetPosts"), "print(GetPosts): should contain operation name");
assert(printedGetPosts.includes("PostFields"), "print(GetPosts): should contain fragment ref");

const printedFragment = print(fragmentDoc);
assert(printedFragment.includes("UserFields"), "print(fragment): should contain fragment name");

const printedImport = print(importDoc);
assert(printedImport.includes("GetUser"), "print(import): should contain operation name");

const printedBacktick = print(backtickDoc);
assert(printedBacktick.includes("SearchUsers"), "print(backtick): should contain operation name");

console.log("All integration checks passed.");
export default "ok";
