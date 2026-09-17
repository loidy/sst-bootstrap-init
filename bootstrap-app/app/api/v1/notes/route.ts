// Route handlers live in the feature so they can reach its use cases; the route
// file only mounts them. Guards run inside the handlers — nothing matches
// /api/* ahead of them.
export { GET, POST } from "@/features/notes/api/notes-handlers";
