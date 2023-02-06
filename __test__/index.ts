import vitePluginGraphqlLoader from "../src";
import { readFileSync, writeFileSync } from "fs";

const testcases = ["test1.gql", "test2.graphql"];

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
