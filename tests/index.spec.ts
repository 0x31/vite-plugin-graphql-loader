import { expect, describe, it } from "vitest";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";

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
import type { DefinitionNode } from "graphql";

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
        expect(code).toMatch(/export const Foo/);
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
        const code = await transformedCode(`query Q { field }`, "tests/x.graphql");
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
        const loc = code.match(/"loc":\{"start":(\d+),"end":(\d+)\}/);
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
            expect(code.match(/export const Frag =/g)).toHaveLength(1);
            expect(document.loc.end).toBe(source.length);
            expect(() => parse(code, { sourceType: "module" })).not.toThrow();
        },
    );

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
        expect(code).toMatch(/export const Frag/);
        expect(code).toMatch(/export const Q/);
    });

    it("emits no duplicate export declarations for any fixture", async () => {
        // Belt and braces: the golden fixtures should never contain two
        // `export const X` for the same X.
        const files = (await readdir(TESTCASE_DIR, { recursive: true })).filter((f: string) =>
            f.endsWith("-expected.js"),
        );
        for (const file of files) {
            const content = await readFile(join(TESTCASE_DIR, file), "utf-8");
            const names = [...content.matchAll(/^export const (\w+)/gm)].map((m) => m[1]);
            expect(new Set(names).size, `${file} has a duplicate export`).toBe(names.length);
        }
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

    it.each(["_queries", "_fragments", "_gql_source", "_gql_doc"])(
        "rejects definitions using the reserved name %s",
        async (reserved: string) => {
            const source = `fragment ${reserved} on T { a }\nquery Q { ...${reserved} }`;
            await expect(callTransform(source, "tests/reserved.graphql")).rejects.toThrow(
                /reserved/i,
            );
        },
    );
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
        },
        ExportDefaultDeclaration() {
            foundExports.push("default");
        },
    });

    return foundExports;
};
