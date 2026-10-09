import { expect, describe, it } from "bun:test";
import { Kind, type DocumentNode } from "graphql";

// What happens when definitions from several files meet at runtime. These
// need real relative imports, so they run under the Bun loader rather than
// through data: URLs like the vitest suite.

import ShadowDocument, { _queries as shadowQueries } from "./merge/shadow.gql";
import SameDocument from "./merge/same.gql";
import KeepsOpsDocument, { _queries as keepsOpsQueries } from "./merge/keeps-ops.gql";
import AnonImportDocument from "./merge/anon-import.gql";

const describeDefinitions = (doc: DocumentNode) =>
    doc.definitions.map((def) =>
        "name" in def && def.name
            ? `${def.kind === Kind.FRAGMENT_DEFINITION ? "fragment" : "query"} ${def.name.value}`
            : def.kind,
    );

describe("merging #imported files", () => {
    it("resolves a spread to the imported fragment even when a local operation has the same name", () => {
        // References used to be keyed by name alone, so the operation's
        // (empty) spread list overwrote the fragment's and the lookup then
        // found the operation again. The export lost its fragment.
        expect(describeDefinitions(shadowQueries.User!)).toEqual(["query User", "fragment User"]);
        expect(describeDefinitions(ShadowDocument)).toEqual([
            "query User",
            "query Other",
            "fragment User",
        ]);
    });

    it("rebuilds the body of a file with an anonymous operation and an #import", () => {
        // No named export means no extraction helper, but the merged default
        // export still needs the helper that rebuilds its loc.
        expect(describeDefinitions(AnonImportDocument)).toEqual([
            "OperationDefinition",
            "fragment User",
        ]);
        expect(AnonImportDocument.loc?.source.body).toContain("fragment User on User");
    });

    it("keeps one copy of a fragment that two imported files define identically", () => {
        expect(describeDefinitions(SameDocument)).toEqual(["query Q", "fragment F"]);
    });

    it("rejects two imported files that define the same fragment differently", async () => {
        // The same clash inside one file fails at build time. Across files it
        // used to pick whichever came first, silently.
        await expect(import("./merge/conflict.gql")).rejects.toThrow(
            /fragment "F" is defined differently in two files merged by #import/,
        );
    });

    it("keeps operations that arrive through #import in the merged document", () => {
        // They execute fine by name, so dropping them would be a silent change.
        expect(describeDefinitions(KeepsOpsDocument)).toEqual([
            "query Q",
            "fragment F",
            "query ListB",
        ]);
        expect(Object.keys(keepsOpsQueries)).toEqual(["Q"]);
        expect(describeDefinitions(keepsOpsQueries.Q!)).toEqual(["query Q", "fragment F"]);
    });
});
