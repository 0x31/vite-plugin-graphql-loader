import vitePluginGraphqlLoader from "../src";
import { readFileSync, writeFileSync } from "fs";
import { PluginOption } from "vite";

const testcases = ["test1.gql", "test2.graphql"];

// Check that the plugin abide by the PluginOption interface
const plugin: PluginOption = vitePluginGraphqlLoader();
console.assert(plugin !== undefined, "plugin should not be null");

for (const testcase of testcases) {
    const fileContent = readFileSync(`__test__/testcases/${testcase}`, "utf-8");

    const expected = readFileSync(
        `__test__/testcases/${testcase.replace(
            /\.(gql|graphql)$/,
            "-expected.js"
        )}`,
        "utf-8"
    );

    const transformed = vitePluginGraphqlLoader().transform(
        fileContent,
        `__test__/testcases/${testcase}`
    );

    if (expected !== transformed) {
        console.error(`Testcase ${testcase} failed`);
        writeFileSync(
            `__test__/testcases/${testcase.replace(
                /\.(gql|graphql)$/,
                "-actual.js"
            )}`,
            transformed
        );
    }
}
