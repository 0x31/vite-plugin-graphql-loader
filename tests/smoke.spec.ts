import { expect, describe, it } from "bun:test";
import {
    NoUnusedFragmentsRule,
    execute,
    specifiedRules,
    validate,
    type DocumentNode,
} from "graphql";
import { rootValue, schema } from "./smoke/schema.js";

// End-to-end smoke test: take the modules the loader actually emits and put
// them through the same path a GraphQL client or server would. `validate`
// against a real schema is the check the rest of the suite can't make — it
// catches a document that parses and prints fine but is missing a fragment
// it spreads, or references a field that doesn't exist.

import PostDocument, { _queries, _fragments } from "./smoke/post.graphql";
import AuthorDocument from "./smoke/author.graphql";

const expectValid = (doc: DocumentNode, label: string) => {
    const errors = validate(schema, doc);
    expect(
        errors.map((e) => e.message),
        `${label} failed validation`,
    ).toEqual([]);
};

describe("smoke: emitted documents against a real schema", () => {
    it("validates the whole document", () => {
        expectValid(PostDocument, "post.graphql default export");
    });

    it("validates each operation extracted from a multi-operation file", () => {
        // This is where a broken extractQuery shows up: GetPost spreads
        // PostSummary, which spreads AuthorFields from an #imported file. If
        // that transitive fragment doesn't travel with the operation,
        // validation fails with "Unknown fragment AuthorFields".
        expect(Object.keys(_queries).sort()).toEqual(["GetPost", "ListPosts"]);

        for (const [name, doc] of Object.entries(_queries)) {
            expectValid(doc, `operation ${name}`);
        }
    });

    it("carries the transitively #imported fragment into each operation", () => {
        const names = (doc: DocumentNode) =>
            doc.definitions
                .map((def) => ("name" in def && def.name ? def.name.value : null))
                .filter((n): n is string => n !== null);

        for (const [name, doc] of Object.entries(_queries)) {
            expect(names(doc), `operation ${name}`).toEqual(
                expect.arrayContaining(["PostSummary", "AuthorFields"]),
            );
        }
    });

    it("executes a query with variables and returns real data", async () => {
        const result = await execute({
            schema,
            document: _queries.GetPost!,
            rootValue,
            variableValues: { id: "p1" },
        });

        expect(result.errors).toBeUndefined();
        expect(result.data).toEqual({
            post: {
                id: "p1",
                title: "First",
                body: "first body",
                author: { id: "a1", name: "Ada" },
            },
        });
    });

    it("executes a list query, resolving fragments on every element", async () => {
        const result = await execute({
            schema,
            document: _queries.ListPosts!,
            rootValue,
            variableValues: { limit: 2 },
        });

        expect(result.errors).toBeUndefined();
        expect(result.data).toEqual({
            posts: [
                { id: "p1", title: "First", author: { id: "a1", name: "Ada" } },
                { id: "p2", title: "Second", author: { id: "a2", name: "Grace" } },
            ],
        });
    });

    it("exposes the fragments, and a fragment-only file stays valid", () => {
        // AuthorFields is not listed: it comes from the #imported file, so it
        // is not a definition of post.graphql itself.
        expect(Object.keys(_fragments).sort()).toEqual(["PostSummary"]);

        // A fragment-only file has no operation to use its fragments, so
        // NoUnusedFragments always fires on one. Every other rule should pass,
        // which is what a client does when it loads a fragment to compose later.
        const rules = specifiedRules.filter((rule) => rule !== NoUnusedFragmentsRule);
        const errors = validate(schema, AuthorDocument, rules);
        expect(errors.map((e) => e.message)).toEqual([]);
    });
});
