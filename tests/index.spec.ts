import { expect, describe, it } from "vitest";
import { parse } from "@babel/parser";
import * as _traverseNs from "@babel/traverse";
// `@babel/traverse` ships a CJS module whose default export is the function;
// under NodeNext the namespace import is the safest way to reach it.
const traverseNs = _traverseNs as unknown as {
    default: typeof import("@babel/traverse").default;
};
const traverse = traverseNs.default ?? (_traverseNs as unknown as typeof traverseNs.default);

import vitePluginGraphqlLoader from "../src/index.js";
import { readFile, readdir, rm, writeFile } from "fs/promises";
import { PluginOption } from "vite";
import { basename, extname, join } from "path";
import { existsSync } from "fs";
import { gql } from "graphql-tag";

const plugin = vitePluginGraphqlLoader();

// Check that the plugin implements the PluginOption interface.
const _: PluginOption = plugin;

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

            // Just to allow manual comparison.
            if (expected !== transformed) {
                await writeFile(actualFilepath, transformed);
            } else {
                if (existsSync(actualFilepath)) {
                    await rm(actualFilepath);
                }
            }

            expect(transformed).toBe(expected);
            expect(map).toBeDefined();

            // Validate that the generated code is valid ESM JavaScript.
            const ast = parse(transformed, { sourceType: "module" });
            expect(ast).toBeDefined();

            // Validate that the exports match the queries and fragments in the
            // GraphQL file.
            const exports = getExports(ast);
            const { definitions } = gql(fileContent);
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
