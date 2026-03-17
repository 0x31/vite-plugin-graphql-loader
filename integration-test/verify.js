import { readFile } from "fs/promises";

// Print some of the built output so we can inspect what the plugin generated
const built = await readFile("./dist/out.js", "utf-8");
const lines = built.split("\n");
console.log(`Built output: ${lines.length} lines, ${built.length} bytes\n`);

// Show a snippet of the output to verify the generated code looks right
const preview = lines.slice(0, 30).join("\n");
console.log("--- First 30 lines of built output ---");
console.log(preview);
console.log("--- End preview ---\n");

// Run the built output to verify it executes without errors
const mod = await import("./dist/out.js");
if (mod.default !== "ok") {
    console.error("Integration test failed: unexpected default export");
    process.exit(1);
}
console.log("\nIntegration test passed!");
