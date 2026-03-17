import { defineConfig } from "vite";
import graphqlLoader from "vite-plugin-graphql-loader";

export default defineConfig({
    plugins: [graphqlLoader()],
    build: {
        lib: {
            entry: "./entry.ts",
            formats: ["es"],
            fileName: "out",
        },
        outDir: "dist",
        rollupOptions: {
            external: ["graphql-tag"],
        },
    },
});
