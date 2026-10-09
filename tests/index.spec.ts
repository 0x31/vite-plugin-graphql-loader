import { expect, describe, it } from "vitest";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import { gql } from "graphql-tag";

import vitePluginGraphqlLoader from "../packages/vite/src/index.js";
import { readFile, readdir, rm, writeFile } from "fs/promises";
import { PluginOption } from "vite";
import { basename, extname, join } from "path";
import { existsSync } from "fs";
import { parse as parseGraphql } from "graphql";
import {
    graphqlLoaderExtractQuery,
    graphqlLoaderUniqueChecker,
} from "../packages/core/src/snippets.js";
import type { DefinitionNode, DocumentNode } from "graphql";

const plugin = vitePluginGraphqlLoader();

const callTransform = async (source: string, id: string) => {
    const transform = plugin.transform;
    if (typeof transform !== "function") {
        throw new Error("plugin.transform is not a function");
    }
    return transform.call(
        {} as Parameters<typeof transform>[0] extends never ? unknown : never,
        source,
        id,
    );
};

const transformedCode = async (source: string, id: string): Promise<string> => {
    const result = await callTransform(source, id);
    if (!result || typeof result === "string") {
        throw new Error(`plugin returned no result for ${id}`);
    }
    if (typeof result.code !== "string") {
        throw new Error(`plugin returned non-string code for ${id}`);
    }
    return result.code;
};

// Check that the plugin implements the PluginOption interface.
const _: PluginOption = plugin;

// GraphQL 16 fills in empty `directives`/`arguments`/`variableDefinitions`
// arrays that GraphQL 17 leaves out entirely. Both shapes are valid documents,
// so strip them from the emitted `_gql_doc` before comparing against the
// golden files, letting one fixture set cover both majors.
const OPTIONAL_EMPTY_KEYS = new Set(["directives", "arguments", "variableDefinitions"]);

const stripEmptyAstArrays = (value: unknown): unknown => {
    if (Array.isArray(value)) {
        return value.map(stripEmptyAstArrays);
    }
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value)
                .filter(
                    ([key, child]) =>
                        !(
                            OPTIONAL_EMPTY_KEYS.has(key) &&
                            Array.isArray(child) &&
                            child.length === 0
                        ),
                )
                .map(([key, child]) => [key, stripEmptyAstArrays(child)]),
        );
    }
    return value;
};

const normalizeDocument = (code: string): string =>
    code.replace(
        /^const _gql_doc = (\{.*\});$/m,
        (_match, json: string) =>
            `const _gql_doc = ${JSON.stringify(stripEmptyAstArrays(JSON.parse(json)))};`,
    );

// Any .gql or .graphql files in the testcase directory are tested.
const TESTCASE_DIR = "tests/testcases";

describe(`vite-plugin-graphql-loader`, async () => {
    // Find .gql and .graphql files in `tests/testcases`:
    const testcases = (await readdir(TESTCASE_DIR, { recursive: true }))
        .filter((f: string) => f.endsWith(".gql") || f.endsWith(".graphql"))
        .filter((testcase) => !basename(testcase).startsWith("_"));

    it.each(testcases)(
        `Testcase %s is generated to a module as expected.`,
        async (testcase: string) => {
            const fileContent = await readFile(join(TESTCASE_DIR, testcase), "utf-8");

            const expectedFilepath = join(
                TESTCASE_DIR,
                testcase.replace(extname(testcase), "-expected.js"),
            );
            const expected = existsSync(expectedFilepath)
                ? await readFile(expectedFilepath, "utf-8")
                : undefined;

            // `Plugin['transform']` is `ObjectHook<...>` — either a function
            // or `{ handler, ... }`. We know the loader uses the function form.
            const transform = plugin.transform;
            if (typeof transform !== "function") {
                throw new Error(`plugin.transform is not a function`);
            }
            const result = await transform.call(
                {} as Parameters<typeof transform>[0] extends never ? unknown : never,
                fileContent,
                `tests/testcases/${testcase}`,
            );
            if (!result || typeof result === "string") {
                throw new Error(`plugin returned no result for ${testcase}`);
            }
            const { code, map } = result;
            if (typeof code !== "string") {
                throw new Error(`plugin returned non-string code for ${testcase}`);
            }
            const transformed: string = code;

            if (!expected) {
                await writeFile(expectedFilepath, transformed);
                // Continue test, which will fail. The tests should be run a
                // second time.
            }

            const actualFilepath = join(
                TESTCASE_DIR,
                testcase.replace(extname(testcase), "-actual.js"),
            );

            const normalized = normalizeDocument(transformed);
            const normalizedExpected = expected ? normalizeDocument(expected) : undefined;

            // Just to allow manual comparison.
            if (normalizedExpected !== normalized) {
                await writeFile(actualFilepath, transformed);
            } else {
                if (existsSync(actualFilepath)) {
                    await rm(actualFilepath);
                }
            }

            expect(normalized).toBe(normalizedExpected);
            expect(map).toBeDefined();

            // Validate that the generated code is valid ESM JavaScript.
            const ast = parse(transformed, { sourceType: "module" });
            expect(ast).toBeDefined();

            // Validate that the exports match the queries and fragments in the
            // GraphQL file.
            const exports = getExports(ast);
            const { definitions } = parseGraphql(fileContent);
            const expectedExports = [
                "_queries",
                "_fragments",
                "default",
                ...definitions
                    .map((definition) =>
                        "name" in definition ? definition.name?.value : undefined,
                    )
                    .filter((name) => name !== undefined),
            ];

            expect(exports.sort()).toEqual(expectedExports.sort());
        },
    );
});

describe("regression: v5.1.0 fixes", () => {
    it("transforms ids with a ?query suffix (Vite emits these)", async () => {
        const code = await transformedCode(
            `query Foo { field }`,
            "tests/testcases/regression.gql?used",
        );
        expect(code).toMatch(/export \{ _gql_doc as Foo \};/);
    });

    it("rejects #import paths containing backticks", async () => {
        await expect(
            callTransform('#import "a`b.graphql"\nquery Q { field }', "tests/x.graphql"),
        ).rejects.toThrow(/invalid #import path/);
    });

    it("rejects #import paths containing newlines", async () => {
        await expect(
            callTransform(
                '#import "a\\nb.graphql"\nquery Q { field }'.replace("\\n", "\n"),
                "tests/x.graphql",
            ),
        ).rejects.toThrow();
    });

    it("rejects #import paths containing backslashes", async () => {
        await expect(
            callTransform('#import "a\\b.graphql"\nquery Q { field }', "tests/x.graphql"),
        ).rejects.toThrow(/invalid #import path/);
    });

    it("escapes ${ inside the emitted _gql_source template literal", async () => {
        // Description string with a `${injected}` sequence. Inside the
        // backtick-delimited `_gql_source` literal, `${` must be escaped or
        // it would be evaluated as a template-literal expression at load
        // time. (Occurrences elsewhere — e.g. inside JSON.stringify'd
        // double-quoted JS strings — are harmless and not asserted here.)
        const code = await transformedCode(`"\${injected}"\nquery Q { field }`, "tests/x.graphql");
        const literal = code.match(/const _gql_source = `([\s\S]*?)`;/);
        expect(literal).not.toBeNull();
        expect(literal![1]).toContain("\\${injected}");
        expect(literal![1]).not.toMatch(/(?<!\\)\$\{injected\}/);
    });

    it("emits only LF newlines (no CRLF) so source maps stay valid on Windows", async () => {
        const code = await transformedCode(`query Q {\r\n    field\r\n}\r\n`, "tests/x.graphql");
        expect(code).not.toContain("\r");
    });

    it("extractQuery throws a clear error when the operation is not in the document", () => {
        const doc = parseGraphql(`
            query Foo {
                field
            }
        `);
        expect(() => graphqlLoaderExtractQuery(doc, "Missing")).toThrow(
            /operation "Missing" not found/,
        );
    });

    it("wraps gql parse errors with file id and a `cause`", async () => {
        let captured: Error | undefined;
        try {
            await callTransform(`{{{ this is not valid graphql`, "tests/broken.graphql");
        } catch (error) {
            captured = error as Error;
        }
        expect(captured).toBeDefined();
        expect(captured?.message).toMatch(/tests\/broken\.graphql/);
        expect(captured?.cause).toBeDefined();
    });
});

describe("regression: emitted source locations", () => {
    it("emits loc offsets that match the source body", async () => {
        const source = `query Q {\n    field\n}\n`;
        const code = await transformedCode(source, "tests/loc.graphql");
        // The document's own loc closes the `_gql_doc` literal. Each
        // definition carries one too, earlier on the line.
        const loc = code.match(/"loc":\{"start":(\d+),"end":(\d+)\}\};$/m);
        expect(loc).not.toBeNull();
        expect(Number(loc![1])).toBe(0);
        // `loc.source.body` is the raw source, so `loc.end` has to be its
        // length.
        expect(Number(loc![2])).toBe(source.length);
    });

    it("slices the operation out of loc.source.body using its own loc", async () => {
        const source = `fragment F on T {\n    a\n}\n\nquery Q {\n    ...F\n}\n`;
        const doc = parseGraphql(source);
        const operation = doc.definitions.find((def) => "name" in def && def.name?.value === "Q");
        expect(operation?.loc).toBeDefined();
        const sliced = source.slice(operation!.loc!.start, operation!.loc!.end);
        expect(sliced).toBe(`query Q {\n    ...F\n}`);
    });
});

describe("unit: #import parsing and file matching", () => {
    // `expandImports` and GRAPHQL_FILE_REGEX are internal, so they are covered
    // through the plugin rather than exported purely for tests. These are the
    // branches the golden fixtures never reach.

    it("accepts a single-quoted #import path", async () => {
        const code = await transformedCode(
            `#import './frag.gql'\nquery Q { ...Frag }`,
            "tests/x.graphql",
        );
        // Quotes are stripped and re-added by JSON.stringify, so the emitted
        // ESM import is double-quoted regardless of the source style.
        expect(code).toContain(`from "./frag.gql"`);
    });

    it("ignores an #import that appears after the first non-comment line", async () => {
        const code = await transformedCode(
            `query Q { field }\n#import "./late.gql"`,
            "tests/x.graphql",
        );
        // No ESM import is generated for it. The text still appears inside
        // `_gql_source`, which embeds the file verbatim by design.
        expect(code).not.toMatch(/^import /m);
        expect(code).toContain(`#import "./late.gql"`);
    });

    it("still reads #import lines that follow plain comments", async () => {
        const code = await transformedCode(
            `# a leading comment\n#import "./frag.gql"\nquery Q { ...Frag }`,
            "tests/x.graphql",
        );
        expect(code).toContain(`from "./frag.gql"`);
    });

    it("keeps scanning past a line that holds only whitespace", async () => {
        // Trailing spaces on a blank line used to count as the first
        // definition, silently dropping every import after it.
        const code = await transformedCode(
            `#import "./a.gql"\n   \n#import "./b.gql"\nquery Q { ...A ...B }`,
            "tests/x.graphql",
        );
        expect(code).toContain(`from "./a.gql"`);
        expect(code).toContain(`from "./b.gql"`);
    });

    it("reads an indented #import", async () => {
        const code = await transformedCode(
            `  #import "./a.gql"\nquery Q { ...A }`,
            "tests/x.graphql",
        );
        expect(code).toContain(`from "./a.gql"`);
    });

    it.each([
        "# import the user fragment before using it",
        "# import this from the shared file",
        "#import",
    ])("treats %s as a comment rather than an import", async (comment) => {
        const code = await transformedCode(`${comment}\nquery Q { a }`, "tests/x.graphql");
        expect(code).not.toMatch(/^import /m);
    });

    it("accepts a quoted path containing spaces", async () => {
        const code = await transformedCode(
            `#import "./my fragments.gql"\nquery Q { ...A }`,
            "tests/x.graphql",
        );
        expect(code).toContain(`from "./my fragments.gql"`);
    });

    it.each([`#import "./a.gql" # the user fragment`, `#import "./a.gql" "./b.gql"`])(
        "rejects %s, an import it cannot parse, instead of ignoring it",
        async (line) => {
            await expect(
                callTransform(`${line}\nquery Q { ...A }`, "tests/x.graphql"),
            ).rejects.toThrow(/cannot parse #import line/);
        },
    );

    it("strips a byte order mark before scanning and parsing", async () => {
        // The BOM used to hide the `#` of a first-line import, so every
        // import in the file was silently dropped. Bun strips it on read,
        // Vite does not.
        const source = `\uFEFF#import "./a.gql"\nquery Q { ...A }\n`;
        const code = await transformedCode(source, "tests/x.graphql");
        expect(code).toContain(`from "./a.gql"`);
        expect(code).not.toContain("\uFEFF");
        expect(code).toMatch(
            new RegExp(`"loc":\\{"start":0,"end":${source.length - 1}\\}\\};$`, "m"),
        );
    });

    it("gives each repeated #import path a distinct identifier", async () => {
        const code = await transformedCode(
            `#import "./frag.gql"\n#import "./frag.gql"\nquery Q { ...Frag }`,
            "tests/x.graphql",
        );
        const identifiers = [...code.matchAll(/^import (\w+) from/gm)].map((m) => m[1]);
        expect(identifiers).toHaveLength(2);
        expect(new Set(identifiers).size).toBe(2);
    });

    it("leaves files whose extension does not match untouched", async () => {
        const result = await callTransform(
            `const notGraphql = "data-testid";`,
            "tests/component.ts",
        );
        expect(result).toBeUndefined();
    });

    it("transforms both .gql and .graphql", async () => {
        for (const id of ["tests/a.gql", "tests/a.graphql"]) {
            const result = await callTransform(`query Q { field }`, id);
            expect(result, id).not.toBeUndefined();
        }
    });

    it.each([
        "tests/a.graphql?raw",
        "tests/a.gql?url",
        "tests/a.graphql?worker",
        "tests/a.graphql?raw&import",
    ])("leaves %s to Vite, which has already loaded it as JavaScript", async (id) => {
        // What the loader would otherwise try to parse as GraphQL.
        const result = await callTransform(`export default "query Q { field }"`, id);
        expect(result).toBeUndefined();
    });

    it.each(["tests/a.graphql?import", "tests/a.graphql?inline", "tests/a.graphql?v=1&foo=bar"])(
        "still transforms %s",
        async (id) => {
            const result = await callTransform(`query Q { field }`, id);
            expect(result).not.toBeUndefined();
        },
    );
});

describe("regression: issue #14 extracted documents describe only their own text", () => {
    // https://github.com/0x31/vite-plugin-graphql-loader/issues/14
    // Each named export holds only its own operation, but it used to inherit
    // the whole document's `loc`, whose `source.body` is the entire file.
    // Clients that send `loc.source.body` instead of printing (urql's
    // `stringifyDocument`) then sent every operation in the file, so one
    // invalid operation broke every import from it. Dropping `loc` instead
    // would break graphql-tag, whose `gql` reads `loc.source.body` of every
    // interpolated document with no fallback, so each export gets a `loc`
    // whose body is assembled from its own definitions.
    const MULTI_OP = `mutation createThing { createThing { id } }\nmutation deleteThing { deleteThing }\n`;

    type Doc = {
        loc?: { start: number; end: number; source: { body: string } };
        definitions: { name?: { value: string }; loc?: { source?: { body: string } } }[];
    };
    const loadModule = async (source: string, id: string) => {
        const code = await transformedCode(source, id);
        return (await import(
            `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
        )) as Record<string, Doc>;
    };

    it("gives a named operation export a loc holding only its own text", async () => {
        const mod = await loadModule(MULTI_OP, "tests/things.graphql");
        const doc = mod.createThing!;

        expect(doc.definitions.map((d) => d.name?.value)).toEqual(["createThing"]);
        expect(doc.loc?.source.body).toBe("mutation createThing { createThing { id } }");
        expect(doc.loc?.end).toBe(doc.loc?.source.body.length);
    });

    it("keeps the file's loc on the default export, where it matches the definitions", async () => {
        const mod = await loadModule(MULTI_OP, "tests/things.graphql");
        const doc = mod.default!;

        expect(doc.loc?.source.body).toBe(MULTI_OP);
        expect(doc.loc?.end).toBe(MULTI_OP.length);
    });

    it("includes the fragments an operation spreads in its body", async () => {
        const mod = await loadModule(
            `fragment F on T { a }\nquery Q { ...F }\nquery R { b }`,
            "tests/frag.graphql",
        );

        expect(mod.Q!.definitions.map((d) => d.name?.value)).toEqual(["Q", "F"]);
        expect(mod.Q!.loc?.source.body).toBe("query Q { ...F }\n\nfragment F on T { a }");
        expect(mod.F!.loc?.source.body).toBe("fragment F on T { a }");
    });

    it("composes an extracted fragment through graphql-tag's gql", async () => {
        const mod = await loadModule(
            `fragment F on T { a }\nfragment G on T { b }`,
            "tests/frags.graphql",
        );

        // The standard Apollo pattern. `gql` concatenates `loc.source.body`,
        // so this both needs a `loc` and needs its body to hold just F.
        const composed = gql`
            query R {
                t {
                    ...F
                }
            }
            ${mod.F}
        `;
        const names = composed.definitions.map((d) => ("name" in d ? d.name?.value : null));
        expect(names).toEqual(["R", "F"]);
    });

    it("points each definition at its source without making it enumerable", async () => {
        const mod = await loadModule(MULTI_OP, "tests/things.graphql");
        const doc = mod.default!;

        // Slicing works, and serializing the document still carries the file
        // text once rather than once per definition.
        expect(doc.definitions[0]!.loc?.source?.body).toBe(MULTI_OP);
        const serialized = JSON.stringify(doc);
        expect(serialized.split("mutation deleteThing { deleteThing }")).toHaveLength(2);
    });
});

describe("regression: anonymous operations", () => {
    // GraphQL's LoneAnonymousOperation rule: an anonymous operation is legal
    // only as a document's sole operation. Fragments are not operations, so
    // they don't affect it. The loader used to consult a count of named
    // *definitions*, which both let invalid documents through and rejected
    // valid ones.

    it("still transforms a lone anonymous operation", async () => {
        const code = await transformedCode(`{ a }`, "tests/anon.graphql");
        expect(code).toContain("export default _gql_doc");
        expect(code).toMatch(/export const _queries = \{\};/);
    });

    it("accepts an anonymous operation alongside fragments", async () => {
        // Valid GraphQL, and previously rejected once a second fragment was
        // present, because fragments were counted as operations.
        const code = await transformedCode(
            `fragment F on T { a }\nfragment G on T { b }\n{ t { ...F ...G } }`,
            "tests/anon.graphql",
        );
        expect(code).toMatch(/export \{ \$F as F \};/);
        expect(code).toMatch(/export \{ \$G as G \};/);
    });

    it("extracts a lone fragment on its own beside an anonymous operation", async () => {
        // Extraction used to be decided by the number of named definitions,
        // so a single fragment was exported as the whole document, anonymous
        // operation included, and composing it elsewhere failed validation.
        const code = await transformedCode(
            `fragment F on T { a }\n{ t { ...F } }`,
            "tests/anon.graphql",
        );
        const mod = await import(
            `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
        );
        expect(mod.F.definitions.map((d: { kind: string }) => d.kind)).toEqual([
            "FragmentDefinition",
        ]);
        expect(mod.F.loc.source.body).toBe("fragment F on T { a }");
        expect(mod.default.definitions).toHaveLength(2);
    });

    it("rejects two anonymous operations", async () => {
        // This was the content of the old continued/test13 fixture, which the
        // loader accepted even though no GraphQL server would.
        await expect(
            callTransform(`{\n    a\n}\n\n{\n    b\n}\n`, "tests/anon.graphql"),
        ).rejects.toThrow(/anonymous operation alongside other operations/);
    });

    it("rejects an anonymous operation alongside a named one", async () => {
        await expect(callTransform(`{ a }\nquery Q { b }`, "tests/anon.graphql")).rejects.toThrow(
            /anonymous operation alongside other operations/,
        );
    });
});

describe("regression: duplicate definition names", () => {
    // Each named definition emits one `export const`, so a repeated name
    // produced a module with duplicate declarations that threw at load time.
    // graphql-tag used to silently dedupe the fragment case; parsing with
    // `graphql` directly does not, so the loader has to catch it itself.

    it.each(["fragment Frag on T { a }", "fragment Frag on T {\n  # same selection\n  a,\n}"])(
        "deduplicates equivalent fragments: %s",
        async (fragment) => {
            const source = `fragment Frag on T { a }\n${fragment}\nquery Q { ...Frag }`;
            const code = await transformedCode(source, "tests/dup.graphql");
            const document = JSON.parse(code.match(/^const _gql_doc = (\{.*\});$/m)![1]!);

            expect(document.definitions).toHaveLength(2);
            expect(code.match(/export \{ \$Frag as Frag \};/g)).toHaveLength(1);
            expect(document.loc.end).toBe(source.length);
            expect(() => parse(code, { sourceType: "module" })).not.toThrow();
        },
    );

    it("rebuilds the default export's body without the dropped duplicate", async () => {
        // The file text still holds both copies, and a client sending it
        // would get "There can be only one fragment named Frag".
        const code = await transformedCode(
            `fragment Frag on T { a }\nfragment Frag on T { a }\nquery Q { ...Frag }`,
            "tests/dup.graphql",
        );
        const mod = await import(
            `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
        );
        expect(mod.default.loc.source.body).toBe("fragment Frag on T { a }\n\nquery Q { ...Frag }");
    });

    it("rejects different fragments sharing a name", async () => {
        await expect(
            callTransform(
                `fragment Frag on T { a }\nfragment Frag on T { b }\nquery Q { ...Frag }`,
                "tests/dup.graphql",
            ),
        ).rejects.toThrow(/"Frag" in tests\/dup\.graphql is declared more than once/);
    });

    it("does not normalize whitespace inside fragment string values", async () => {
        await expect(
            callTransform(
                `fragment Frag on T { a(value: "a b") }\nfragment Frag on T { a(value: "a  b") }`,
                "tests/dup.graphql",
            ),
        ).rejects.toThrow(/"Frag" .* declared more than once/);
    });

    it("rejects an operation name declared twice", async () => {
        await expect(
            callTransform(`query Q { a }\nquery Q { b }`, "tests/dup.graphql"),
        ).rejects.toThrow(/"Q" .* declared more than once/);
    });

    it("rejects a fragment and an operation sharing a name", async () => {
        await expect(
            callTransform(`fragment Same on T { a }\nquery Same { ...Same }`, "tests/dup.graphql"),
        ).rejects.toThrow(/"Same" .* declared more than once/);
    });

    it("allows distinct names, including an anonymous operation", async () => {
        const code = await transformedCode(
            `fragment Frag on T { a }\nquery Q { ...Frag }`,
            "tests/ok.graphql",
        );
        expect(code).toMatch(/export \{ \$Frag as Frag \};/);
        expect(code).toMatch(/export \{ \$Q as Q \};/);
    });

    it("emits no duplicate export names for any fixture", async () => {
        // Belt and braces: the golden fixtures should never export one name
        // twice, which is a SyntaxError at load time.
        const files = (await readdir(TESTCASE_DIR, { recursive: true })).filter((f: string) =>
            f.endsWith("-expected.js"),
        );
        for (const file of files) {
            const content = await readFile(join(TESTCASE_DIR, file), "utf-8");
            const names = getExports(parse(content, { sourceType: "module" }));
            expect(new Set(names).size, `${file} has a duplicate export`).toBe(names.length);
        }
    });
});

describe("regression: GraphQL names that are not valid JavaScript bindings", () => {
    // Exports are aliased from `$`-prefixed locals, so the GraphQL name never
    // has to be a legal `const` name, cannot shadow a global the helpers use,
    // and cannot collide with the module's own identifiers.
    const loadModule = async (source: string) => {
        const code = await transformedCode(source, "tests/names.graphql");
        return (await import(
            `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
        )) as Record<string, any>;
    };

    it.each(["delete", "new", "class", "let", "static", "await", "yield", "eval", "arguments"])(
        "exports an operation named %s, a reserved word",
        async (name) => {
            const mod = await loadModule(`query ${name} { a }\nquery Other { b }`);
            expect(mod[name].definitions.map((d: any) => d.name.value)).toEqual([name]);
            expect(mod._queries[name]).toBe(mod[name]);
        },
    );

    it.each(["Set", "Object", "Error"])(
        "exports a fragment named %s without shadowing the global inside the helpers",
        async (name) => {
            const mod = await loadModule(`fragment ${name} on T { a }\nquery Q { ...${name} }`);
            expect(mod.Q.definitions.map((d: any) => d.name.value)).toEqual(["Q", name]);
            expect(mod._fragments[name].definitions).toHaveLength(1);
        },
    );

    it.each(["graphqlLoaderExtractQuery", "graphqlLoaderUniqueChecker", "_gql_doc", "_gql_source"])(
        "exports a definition named %s, an identifier the module uses itself",
        async (name) => {
            const mod = await loadModule(`query ${name} { a }\nquery Other { b }`);
            expect(mod[name].definitions.map((d: any) => d.name.value)).toEqual([name]);
        },
    );

    it("exports a definition named like a generated import binding", async () => {
        // Can't be loaded from a data: URL because of the relative import, so
        // check the emitted module parses and declares both names.
        const code = await transformedCode(
            `#import "./frag.gql"\nquery Import___frag_gql { ...Frag }`,
            "tests/names.graphql",
        );
        expect(() => parse(code, { sourceType: "module" })).not.toThrow();
        expect(code).toContain(`import Import___frag_gql from "./frag.gql"`);
        expect(code).toContain("export { $Import___frag_gql as Import___frag_gql };");
    });

    it("keeps a definition named __proto__ as an own registry entry", async () => {
        // A literal `"__proto__": x` entry sets the prototype instead, so the
        // registries use computed keys.
        const mod = await loadModule(`query __proto__ { a }\nquery Other { b }`);
        expect(Object.keys(mod._queries)).toEqual(["__proto__", "Other"]);
        expect(Object.getPrototypeOf(mod._queries)).toBe(Object.prototype);
        expect(mod._queries["__proto__"].definitions[0].name.value).toBe("__proto__");
    });

    it("keeps a single definition aliased to the document itself", async () => {
        const mod = await loadModule(`query delete { a }`);
        expect(mod.delete).toBe(mod.default);
        expect(mod._queries).toEqual({ delete: mod.default });
    });
});

describe("regression: v5.1.1 fixes", () => {
    // Extract the runtime value of `_gql_source` from the emitted code by
    // writing it to a temp .mjs file and importing. Avoids in-process eval.
    const emittedGqlSource = async (code: string, id: string): Promise<string> => {
        // Strip the export default and other declarations down to just the
        // _gql_source assignment + an exported alias.
        const match = code.match(/const _gql_source = `[\s\S]*?`;/);
        if (!match) throw new Error("could not locate _gql_source declaration");
        const { mkdtemp, writeFile, rm } = await import("fs/promises");
        const { tmpdir } = await import("os");
        const { join } = await import("path");
        const dir = await mkdtemp(join(tmpdir(), "gql-loader-test-"));
        const file = join(dir, `${id}.mjs`);
        try {
            await writeFile(file, `${match[0]}\nexport default _gql_source;\n`);
            const mod = await import(file);
            return mod.default as string;
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    };

    it("preserves backslashes in _gql_source so loc.source.body equals input", async () => {
        // Input contains a literal backslash followed by 'n'. Without escaping
        // backslashes first, the emitted template literal interprets `\n` as a
        // newline at runtime, so _gql_source becomes shorter than the input.
        const source = `query Q($x: String = "a\\nb") { foo }`;
        const code = await transformedCode(source, "tests/x.graphql");
        const evaluated = await emittedGqlSource(code, "bs1");
        expect(evaluated).toBe(source);
        expect(evaluated.length).toBe(source.length);
    });

    it("preserves CRLF in _gql_source so loc offsets still index the body", async () => {
        // A template literal normalizes CRLF to LF, which used to leave
        // `loc.end` past the end of `loc.source.body` on Windows checkouts.
        const source = `query Q {\r\n    field\r\n}\r\n`;
        const code = await transformedCode(source, "tests/x.graphql");
        const evaluated = await emittedGqlSource(code, "crlf");
        expect(evaluated).toBe(source);
        expect(code).toMatch(new RegExp(`"loc":\\{"start":0,"end":${source.length}\\}\\};$`, "m"));
    });

    it("unique-checker keeps a fragment named 'constructor' (prototype-safe lookup)", () => {
        const defs = [
            { kind: "FragmentDefinition", name: { kind: "Name", value: "constructor" } },
            { kind: "FragmentDefinition", name: { kind: "Name", value: "other" } },
        ] as unknown as DefinitionNode[];
        const result = graphqlLoaderUniqueChecker(defs);
        const names = result.map((d) => ("name" in d ? d.name?.value : null));
        expect(names).toEqual(["constructor", "other"]);
    });

    it("unique-checker still dedupes duplicate fragment names", () => {
        const defs = [
            { kind: "FragmentDefinition", name: { kind: "Name", value: "Foo" } },
            { kind: "FragmentDefinition", name: { kind: "Name", value: "Foo" } },
            { kind: "FragmentDefinition", name: { kind: "Name", value: "Bar" } },
        ] as unknown as DefinitionNode[];
        const result = graphqlLoaderUniqueChecker(defs);
        const names = result.map((d) => ("name" in d ? d.name?.value : null));
        expect(names).toEqual(["Foo", "Bar"]);
    });

    it("extractQuery only treats fragment spreads as references, not variable types", () => {
        // Inherited from graphql-tag's loader, which also collected the named
        // type of each variable. A fragment or operation sharing a name with
        // an input type was then pulled into documents that never spread it.
        const doc = parseGraphql(`
            fragment Filter on T { a }
            query A($f: Filter) { b(f: $f) }
            query Filter($f: Filter) { c }
            query R { ...Filter }
        `);
        const names = (out: DocumentNode) =>
            out.definitions.map((d) => ("name" in d && d.name ? d.name.value : null));
        expect(names(graphqlLoaderExtractQuery(doc, "A"))).toEqual(["A"]);
        expect(names(graphqlLoaderExtractQuery(doc, "Filter"))).toEqual(["Filter"]);
        expect(names(graphqlLoaderExtractQuery(doc, "R"))).toEqual(["R", "Filter"]);
        expect(graphqlLoaderExtractQuery(doc, "R").definitions[1]!.kind).toBe("FragmentDefinition");
    });

    it("unique-checker throws for two different definitions with one name", () => {
        const defs = [
            { kind: "FragmentDefinition", name: { kind: "Name", value: "F" }, selection: "a" },
            { kind: "FragmentDefinition", name: { kind: "Name", value: "F" }, selection: "b" },
        ] as unknown as DefinitionNode[];
        expect(() => graphqlLoaderUniqueChecker(defs)).toThrow(/"F" is defined differently/);
    });

    it("unique-checker ignores loc, which only says which file a copy came from", () => {
        const defs = [
            { kind: "FragmentDefinition", name: { kind: "Name", value: "F" }, loc: { start: 0 } },
            { kind: "FragmentDefinition", name: { kind: "Name", value: "F" }, loc: { start: 9 } },
        ] as unknown as DefinitionNode[];
        expect(graphqlLoaderUniqueChecker(defs)).toHaveLength(1);
    });

    it("extractQuery handles operations/fragments named 'constructor'", () => {
        const doc = parseGraphql(`
            fragment constructor on T {
                a
            }
            query Q {
                ...constructor
            }
        `);
        const out = graphqlLoaderExtractQuery(doc, "Q");
        const names = out.definitions
            .map((d) => ("name" in d && d.name ? d.name.value : null))
            .filter((n): n is string => n !== null);
        expect(names).toEqual(expect.arrayContaining(["Q", "constructor"]));
    });

    it.each(["_queries", "_fragments", "default"])(
        "rejects definitions using the reserved name %s, which the module exports itself",
        async (reserved: string) => {
            const source = `fragment ${reserved} on T { a }\nquery Q { ...${reserved} }`;
            await expect(callTransform(source, "tests/reserved.graphql")).rejects.toThrow(
                /reserved/i,
            );
        },
    );

    it("does not reserve names for type system definitions, which are never exported", async () => {
        await expect(
            callTransform(`type _queries { a: Int }`, "tests/schema.graphql"),
        ).resolves.toBeDefined();
    });
});

// Traverse @babel/parser AST to find exports.
const getExports = (ast: any): string[] => {
    // Track found exports
    const foundExports: string[] = [];

    // Traverse the AST to find export declarations
    traverse(ast, {
        ExportNamedDeclaration(path) {
            const declaration = path.node.declaration;
            if (declaration && declaration.type === "VariableDeclaration") {
                declaration.declarations.forEach((decl) => {
                    if (decl.id.type === "Identifier") {
                        foundExports.push(decl.id.name);
                    }
                });
            }
            // `export { $local as name }`
            path.node.specifiers.forEach((specifier) => {
                if (specifier.type === "ExportSpecifier") {
                    const { exported } = specifier;
                    foundExports.push(
                        exported.type === "Identifier" ? exported.name : exported.value,
                    );
                }
            });
        },
        ExportDefaultDeclaration() {
            foundExports.push("default");
        },
    });

    return foundExports;
};
