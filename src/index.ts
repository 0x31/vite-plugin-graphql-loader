import { EOL } from "os";
import { gql } from "graphql-tag";
import {
    ONE_QUERY_FUNCTION_TEMPLATE,
    UNIQUE_FUNCTION_TEMPLATE,
} from "./snippets.js";

// Resolves GraphQL #import statements into ESM import statements.
const expandImports = (source: string) => {
    const lines = source.split(/\r\n|\r|\n/);
    let outputCode: string;

    lines.some((line: string) => {
        const result = line.match(/^#\s?import (.+)$/);
        if (result) {
            const [_, importFile] = result;

            const importName =
                "Import_" + importFile.replace(/[^a-z0-9]/gi, "_");
            // Add the import statement and the code to append the definitions.
            const importStatement = `import ${importName} from ${importFile};`;
            const appendDefinition = `doc.definitions = doc.definitions.concat(unique(${importName}.definitions));`;
            outputCode =
                (outputCode ?? UNIQUE_FUNCTION_TEMPLATE) +
                importStatement +
                EOL +
                appendDefinition +
                EOL;
        }
        return line.length > 0 && line[0] !== "#";
    });

    return outputCode ?? "";
};

/** Vite GraphQL Loader. */
export const vitePluginGraphqlLoader = () => {
    const graphqlRegex = /\.(?:gql|graphql)$/;

    return {
        name: "graphql-loader",
        enforce: "pre" as const,

        transform(source: string, id: string) {
            if (!graphqlRegex.test(id)) {
                return;
            }

            const documentNode = gql`
                ${source}
            `;
            const headerCode = `
const doc = ${JSON.stringify(documentNode)};
doc.loc.source = ${JSON.stringify(documentNode.loc.source)};
          `;

            let outputCode = "";

            // Allow multiple query/mutation definitions in a file. This parses out dependencies
            // at compile time, and then uses those at load time to create minimal query documents
            // We cannot do the latter at compile time due to how the #import code works.
            const operationCount = documentNode.definitions.filter(
                (op) =>
                    (op.kind === "OperationDefinition" ||
                        op.kind === "FragmentDefinition") &&
                    op.name,
            ).length;

            if (operationCount < 1) {
                outputCode += `
export default doc;
            `;
            } else {
                outputCode += ONE_QUERY_FUNCTION_TEMPLATE;

                for (const op of documentNode.definitions) {
                    if (
                        op.kind === "OperationDefinition" ||
                        op.kind === "FragmentDefinition"
                    ) {
                        if (!op.name) {
                            if (operationCount > 1) {
                                throw new Error(
                                    "Query/mutation names are required for a document with multiple definitions",
                                );
                            } else {
                                continue;
                            }
                        }

                        const opName = op.name.value;
                        outputCode += `
export const ${opName} = oneQuery(doc, "${opName}");`;

                        if (op.kind === "OperationDefinition") {
                            outputCode += `
_queries["${opName}"] = ${opName};`;
                        } else {
                            outputCode += `
_fragments["${opName}"] = ${opName};`;
                        }
                    }
                }
            }

            const importOutputCode = expandImports(source);
            const allCode =
                headerCode + EOL + importOutputCode + EOL + outputCode + EOL;

            return allCode;
        },
    };
};

export default vitePluginGraphqlLoader;
