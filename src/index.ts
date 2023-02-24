import os from "os";
import gql from "graphql-tag";
import { ONE_QUERY, UNIQUE } from "./snippets";

// Takes `source` (the source GraphQL query string)
// and `doc` (the parsed GraphQL document) and tacks on
// the imported definitions.
const expandImports = (source: string) => {
    const lines = source.split(/\r\n|\r|\n/);
    let outputCode = UNIQUE;

    lines.some((line: string) => {
        const result = line.match(/^#\s?import (.+)$/);
        if (result) {
            const [_, importFile] = result;
            const parseDocument = `(await import(${importFile})).default`;
            const appendDefinition = `doc.definitions = doc.definitions.concat(unique(${parseDocument}.definitions));`;
            outputCode += appendDefinition + os.EOL;
        }
        return line.length > 0 && line[0] !== "#";
    });

    return outputCode;
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
            const operationCount = documentNode.definitions.reduce(
                (accum, op) => {
                    if (
                        op.kind === "OperationDefinition" ||
                        op.kind === "FragmentDefinition"
                    ) {
                        return accum + 1;
                    }

                    return accum;
                },
                0
            );

            if (operationCount < 1) {
                outputCode += `
              export default doc;
            `;
            } else {
                outputCode += ONE_QUERY;

                for (const op of documentNode.definitions) {
                    if (
                        op.kind === "OperationDefinition" ||
                        op.kind === "FragmentDefinition"
                    ) {
                        if (!op.name) {
                            if (operationCount > 1) {
                                throw new Error(
                                    "Query/mutation names are required for a document with multiple definitions"
                                );
                            } else {
                                continue;
                            }
                        }

                        const opName = op.name.value;
                        outputCode += `
export const ${opName} = oneQuery(doc, "${opName}");
                `;
                    }
                }
            }

            const importOutputCode = expandImports(source);
            const allCode =
                headerCode +
                os.EOL +
                importOutputCode +
                os.EOL +
                outputCode +
                os.EOL;

            return allCode;
        },
    };
};

export default vitePluginGraphqlLoader;
