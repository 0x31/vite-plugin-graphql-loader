import { buildSchema } from "graphql";

// A small but realistic schema for the smoke test: nested objects, a list,
// arguments and variables, so the emitted documents are validated against
// something with actual shape rather than a single scalar field.
export const schema = buildSchema(`
    type Author {
        id: ID!
        name: String!
    }

    type Post {
        id: ID!
        title: String!
        body: String!
        author: Author!
    }

    type Query {
        post(id: ID!): Post
        posts(limit: Int): [Post!]!
    }
`);

const authors = {
    a1: { id: "a1", name: "Ada" },
    a2: { id: "a2", name: "Grace" },
};

const posts = [
    { id: "p1", title: "First", body: "first body", author: authors.a1 },
    { id: "p2", title: "Second", body: "second body", author: authors.a2 },
];

export const rootValue = {
    post: ({ id }: { id: string }) => posts.find((p) => p.id === id) ?? null,
    posts: ({ limit }: { limit?: number }) => (limit ? posts.slice(0, limit) : posts),
};
