import "server-only";

// Features must import the database through this module, never from
// @bootstrap/database directly — it is the seam where cross-cutting scoping and
// transaction helpers belong.
export { db } from "@bootstrap/database";
