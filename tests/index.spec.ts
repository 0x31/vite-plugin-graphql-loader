import { beforeAll, beforeEach, expect, describe, it } from "vitest";

import vitePluginGraphqlLoader from "../src/index";
import { readFileSync, writeFileSync } from "fs";
import { PluginOption } from "vite";

const plugin: PluginOption = vitePluginGraphqlLoader();

describe(`# vite-plugin-graphql-loader`, function () {
    it(`abides by the PluginOption interface`, () => {
        expect(plugin).toBeDefined(); // "plugin should not be null"
    });

    it.each([
        ["test1.gql"],
        ["test2.graphql"],
        ["test3.graphql"],
        ["test4.graphql"],
    ])(`Testcase %s is generated to a module as expected.`, (tcase) => {
        const fileContent = readFileSync(`tests/testcases/${tcase}`, "utf-8");

        const expected = readFileSync(
            `tests/testcases/${tcase.replace(
                /\.(gql|graphql)$/,
                "-expected.js",
            )}`,
            "utf-8",
        );

        // @ts-ignore
        const transformed = plugin.transform(
            fileContent,
            `tests/testcases/${tcase}`,
        );

        // just to allow manual comparison
        if (expected !== transformed) {
            console.error(`Testcase ${tcase} failed`);
            writeFileSync(
                `tests/testcases/${tcase.replace(
                    /\.(gql|graphql)$/,
                    "-actual.js",
                )}`,
                transformed,
            );
        }

        expect(transformed).toBe(expected);
    });
});
