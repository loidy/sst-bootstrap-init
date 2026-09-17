// OpenAPI 3.1 document assembled from the very zod schemas that validate
// requests at runtime, so the spec cannot drift from the implementation.
//
// Zod 4 emits JSON Schema draft 2020-12 natively (`z.toJSONSchema`), which is
// the dialect OpenAPI 3.1 uses — no separate annotation library is involved.
// Features contribute a fragment (paths + named schemas); the
// /api/v1/openapi.json route composes them.
import { z } from "zod";

import { PROBLEM_CONTENT_TYPE, problemDetails } from "./problem";

/** Version of the REST surface. Bump on breaking changes; see docs/rest-api.md. */
export const API_VERSION = "1.0.0";

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

/** Reference to a schema contributed by some fragment. */
export type SchemaRef = { $ref: string };

export type ApiResponseSpec = {
  description: string;
  /** Omit for 204-style responses. */
  schema?: SchemaRef;
};

/** A path parameter (`{noteId}` in `/notes/{noteId}`) or a query parameter (`?page=`). */
export type ApiParameterSpec = {
  name: string;
  description?: string;
  /** Defaults to a path parameter, which is always required. */
  in?: "path" | "query";
  required?: boolean;
  schema: Record<string, unknown>;
};

export type ApiOperationSpec = {
  operationId: string;
  summary: string;
  description?: string;
  tags: string[];
  parameters?: ApiParameterSpec[];
  requestBody?: {
    schema: SchemaRef;
    description?: string;
  };
  responses: Partial<Record<number, ApiResponseSpec>>;
};

export type ApiSpecFragment = {
  /** Named schemas exposed under components/schemas. */
  schemas: Record<string, z.ZodType>;
  /** Path (including the /api/v1 prefix) to its operations. */
  paths: Record<string, Partial<Record<HttpMethod, ApiOperationSpec>>>;
  tag?: { name: string; description: string };
};

export function schemaRef(name: string): SchemaRef {
  return { $ref: `#/components/schemas/${name}` };
}

/**
 * JSON Schema of one member of a query contract, so a `?page=` style parameter
 * is described by the very schema that validates it.
 */
export function queryParameterSchema(schema: z.ZodObject, name: string): Record<string, unknown> {
  const document = z.toJSONSchema(schema, { target: "draft-2020-12", io: "input" }) as {
    properties?: Record<string, Record<string, unknown>>;
  };
  const property = document.properties?.[name];
  if (!property) {
    throw new Error(`Query parameter "${name}" is not a member of the contract.`);
  }
  return stripSchemaBookkeeping(property);
}

export function queryParameters(schema: z.ZodObject): ApiParameterSpec[] {
  return Object.entries(schema.shape).map(([name, member]) => ({
    name,
    in: "query",
    // Optional or defaulted members accept an absent parameter.
    required: !member.safeParse(undefined).success,
    schema: queryParameterSchema(schema, name),
  }));
}

/**
 * Problem responses every endpoint can return. Once authentication exists, add
 * `401` here and a `securitySchemes` entry below — every guarded operation can
 * then answer it without repeating itself.
 */
const COMMON_PROBLEM_RESPONSES: Partial<Record<number, ApiResponseSpec>> = {
  403: { description: "The caller is not allowed (origin check).", schema: schemaRef("Problem") },
  500: { description: "Unexpected server error.", schema: schemaRef("Problem") },
};

export function buildOpenApiDocument(params: {
  serverUrl: string;
  fragments: ApiSpecFragment[];
  version?: string;
}): Record<string, unknown> {
  const registry = z.registry<{ id: string }>();
  registry.add(problemDetails, { id: "Problem" });

  for (const fragment of params.fragments) {
    for (const [name, schema] of Object.entries(fragment.schemas)) {
      registry.add(schema, { id: name });
    }
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Bootstrap App API",
      version: params.version ?? API_VERSION,
      description: [
        "Internal REST API. Every state change goes through this namespace;",
        "there are no server actions for mutations. Errors are returned as",
        `RFC 9457 problem documents (${PROBLEM_CONTENT_TYPE}).`,
      ].join(" "),
    },
    servers: [{ url: params.serverUrl }],
    tags: params.fragments.flatMap((fragment) => (fragment.tag ? [fragment.tag] : [])),
    paths: buildPaths(params.fragments),
    components: { schemas: buildSchemas(registry) },
  };
}

function buildPaths(fragments: ApiSpecFragment[]): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const fragment of fragments) {
    for (const [path, operations] of Object.entries(fragment.paths)) {
      const pathItem = (paths[path] ??= {});
      for (const [method, operation] of Object.entries(operations)) {
        pathItem[method] = buildOperation(operation);
      }
    }
  }

  return paths;
}

function buildOperation(operation: ApiOperationSpec): Record<string, unknown> {
  const responses: Record<string, unknown> = {};
  const merged: Partial<Record<number, ApiResponseSpec>> = {
    ...COMMON_PROBLEM_RESPONSES,
    ...operation.responses,
  };
  for (const [status, response] of Object.entries(merged)) {
    if (response) {
      responses[status] = buildResponse(response, Number(status));
    }
  }

  return {
    operationId: operation.operationId,
    summary: operation.summary,
    ...(operation.description ? { description: operation.description } : {}),
    tags: operation.tags,
    ...(operation.parameters
      ? {
          parameters: operation.parameters.map((parameter) => ({
            name: parameter.name,
            in: parameter.in ?? "path",
            required: parameter.required ?? true,
            ...(parameter.description ? { description: parameter.description } : {}),
            schema: stripSchemaBookkeeping(parameter.schema),
          })),
        }
      : {}),
    ...(operation.requestBody
      ? {
          requestBody: {
            required: true,
            ...(operation.requestBody.description
              ? { description: operation.requestBody.description }
              : {}),
            content: { "application/json": { schema: operation.requestBody.schema } },
          },
        }
      : {}),
    responses,
  };
}

function buildResponse(response: ApiResponseSpec, status: number): Record<string, unknown> {
  if (!response.schema) {
    return { description: response.description };
  }

  const contentType = status >= 400 ? PROBLEM_CONTENT_TYPE : "application/json";
  return {
    description: response.description,
    content: { [contentType]: { schema: response.schema } },
  };
}

function buildSchemas(registry: z.core.$ZodRegistry<{ id: string }>): Record<string, unknown> {
  // `io: "input"` keeps request schemas honest (no additionalProperties: false
  // synthesised for responses, which would forbid future members).
  const { schemas } = z.toJSONSchema(registry, {
    target: "draft-2020-12",
    io: "input",
    uri: (id) => `#/components/schemas/${id}`,
  });

  return Object.fromEntries(
    Object.entries(schemas).map(([name, schema]) => [
      name,
      stripSchemaBookkeeping(schema as Record<string, unknown>),
    ]),
  );
}

/** JSON Schema bookkeeping keys that OpenAPI schemas/parameters must not carry. */
function stripSchemaBookkeeping(schema: Record<string, unknown>): Record<string, unknown> {
  const cleaned = { ...schema };
  delete cleaned["$schema"];
  delete cleaned["$id"];
  return cleaned;
}
