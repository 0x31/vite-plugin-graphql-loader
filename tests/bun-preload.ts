import { plugin } from "bun";
import bunGraphqlLoader from "../packages/bun/src/index.js";

// Registers the loader for `bun test`, so `.gql` / `.graphql` imports resolve
// the same way they would in a Bun.build.
void plugin(bunGraphqlLoader());
