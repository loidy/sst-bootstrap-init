import { buildApiDocument } from "@/app/api/v1/_spec";
import { apiHandler, jsonResponse } from "@/shared/api/handler";

const DEFAULT_SERVER_URL = "http://localhost:3000";

/**
 * The API's own OpenAPI 3.1 document, built per request so it can never be
 * stale. `docs/openapi.json` is the committed copy of the same build.
 */
export const GET = apiHandler(async () => {
  return jsonResponse(buildApiDocument(process.env["NEXT_PUBLIC_APP_URL"] ?? DEFAULT_SERVER_URL));
});
