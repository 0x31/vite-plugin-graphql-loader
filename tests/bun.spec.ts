import { expect, describe, it } from "bun:test";
import { readFile } from "fs/promises";
import { join } from "path";
import { Kind, parse, print, type DocumentNode } from "graphql";
import bunGraphqlLoader from "../packages/bun/src/index.js";
import { transformGraphQL } from "../packages/core/src/index.js";

// The Vite suite already golden-tests the shared transform. These tests cover
// what only Bun can exercise: the plugin wiring, `bun test` resolution of
// `.graphql` imports, and `Bun.build`.

import MultiQuery, { _queries, _fragments } from "./testcases/basic/test5.graphql";
import WithImport from "./testcases/imports/test18.gql";

const TESTCASE_DIR = "tests/testcases";
const MULTI_QUERY_FIXTURE = "basic/test5.graphql";

const definitionNames = (doc: DocumentNode): string[] =>
    doc.definitions
        .map((def) => ("name" in def && def.name ? def.name.value : null))
        .filter((name): name is string => name !== null);

describe("bun-graphql-loader", () => {
    it("implements the BunPlugin interface", () => {
        const loaded = bunGraphqlLoader();
        expect(loaded.name).toBe("graphql-loader");
        expect(typeof loaded.setup).toBe("function");
    });

    it("resolves .graphql imports to a DocumentNode at runtime", () => {
        expect(MultiQuery.kind).toBe(Kind.DOCUMENT);
        expect(Object.keys(_queries).sort()).toEqual(["TestQuery", "TestQuery2"]);
        expect(Object.keys(_fragments)).toEqual(["TestFragment"]);
    });

    it("exports each operation under its own name", async () => {
        // The ambient `*.graphql` declaration can't know the operation names in
        // a given file, so reach the named exports through a cast.
        const mod = (await import(`./testcases/${MULTI_QUERY_FIXTURE}`)) as unknown as Record<
            string,
            DocumentNode
        >;
        expect(mod.TestQuery?.kind).toBe(Kind.DOCUMENT);
        expect(mod.TestQuery2?.kind).toBe(Kind.DOCUMENT);
    });

    it("splits a multi-operation document into one document per operation", () => {
        const testQuery = _queries.TestQuery!;
        const testQuery2 = _queries.TestQuery2!;

        expect(definitionNames(testQuery)).toContain("TestQuery");
        expect(definitionNames(testQuery)).not.toContain("TestQuery2");
        expect(definitionNames(testQuery2)).toContain("TestQuery2");

        // The fragment each operation spreads travels with it.
        expect(definitionNames(testQuery)).toContain("TestFragment");
    });

    it("inlines #imported fragments into the document, deduped", () => {
        const names = definitionNames(WithImport);

        // Frag1 comes from the two #imported files, which both declare it.
        expect(names).toContain("Frag1");
        expect(names.filter((name) => name === "Frag1")).toHaveLength(1);
    });

    it("emits loc.source.body identical to the file on disk", async () => {
        const source = await readFile(join(TESTCASE_DIR, MULTI_QUERY_FIXTURE), "utf-8");
        // This fixture contains escaped backticks and backslashes, so it also
        // covers the escaping of the emitted `_gql_source` template literal.
        expect(MultiQuery.loc?.source.body).toBe(source);
        expect(MultiQuery.loc?.end).toBe(source.length);
    });

    it("round-trips through print() to the same document", async () => {
        const source = await readFile(join(TESTCASE_DIR, MULTI_QUERY_FIXTURE), "utf-8");
        expect(print(MultiQuery)).toBe(print(parse(source)));
    });

    it("generates a source map unless noSourceMap is set", () => {
        const source = "query Q { field }";
        const withMap = transformGraphQL(source, "x.graphql");
        const withoutMap = transformGraphQL(source, "x.graphql", { noSourceMap: true });

        expect(withMap.map).not.toBeNull();
        expect(withoutMap.map).toBeNull();
    });

    // Runs the plugin's onLoad hook directly. Bun's loader API has no map
    // channel, so the adapter inlines the map into the returned code; going
    // through Bun.build wouldn't show this, since the bundler consumes the
    // inline map rather than re-emitting it.
    const runOnLoad = async (path: string, options?: { noSourceMap?: boolean }) => {
        let callback: ((args: { path: string }) => Promise<{ contents: string }>) | undefined;
        const builder = {
            onLoad: (_constraints: unknown, cb: typeof callback) => {
                callback = cb;
            },
        };
        void bunGraphqlLoader(options).setup(builder as never);
        if (!callback) throw new Error("plugin did not register an onLoad hook");
        return callback({ path });
    };

    it("inlines the source map into the loaded module", async () => {
        const path = join(TESTCASE_DIR, MULTI_QUERY_FIXTURE);
        const { contents } = await runOnLoad(path);
        expect(contents).toContain("sourceMappingURL=data:application/json");
    });

    it("omits the inline source map when noSourceMap is set", async () => {
        const path = join(TESTCASE_DIR, MULTI_QUERY_FIXTURE);
        const { contents } = await runOnLoad(path, { noSourceMap: true });
        expect(contents).not.toContain("sourceMappingURL");
    });

    it("builds a working bundle through Bun.build", async () => {
        const result = await Bun.build({
            entrypoints: ["tests/bun-entry.ts"],
            plugins: [bunGraphqlLoader()],
            target: "bun",
        });

        expect(result.success).toBe(true);
        const [output] = result.outputs;
        expect(output).toBeDefined();

        const built = await output!.text();
        expect(built).toContain("TestQuery");
    });
});
