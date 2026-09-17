import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import eslintConfigPrettier from "eslint-config-prettier";
import boundaries from "eslint-plugin-boundaries";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "database/generated/**",
    "next-env.d.ts",
    "out/**",
    "build/**",
    "scripts/**",
    ".sst/**",
    "sst.config.ts",
  ]),
  ...nextCoreWebVitals,
  ...nextTypescript,
  eslintConfigPrettier,
  // Architecture boundaries — see docs/architecture.md.
  {
    files: ["app/**/*.{ts,tsx}", "features/**/*.{ts,tsx}", "shared/**/*.{ts,tsx}"],
    plugins: { boundaries },
    settings: {
      "import/resolver": {
        typescript: { alwaysTryTypes: true },
      },
      "boundaries/include": ["app/**/*", "features/**/*", "shared/**/*"],
      "boundaries/elements": [
        // Feature-root files: index.ts (public barrel) and contracts.ts.
        // `mode: "file"` is what gives these a type of their own instead of
        // folding them into the feature folder. The plugin prints a deprecation
        // warning for `mode`, but its replacement (`partialMatch: false`) forces
        // folder matching and would never match a file — keep this until the
        // plugin's file-descriptor API can express the same policies.
        {
          type: "feature-root-file",
          pattern: "features/*/*.ts",
          mode: "file",
          capture: ["feature", "fileName"],
        },
        { type: "feature-domain", pattern: "features/*/domain", capture: ["feature"] },
        { type: "feature-data", pattern: "features/*/data", capture: ["feature"] },
        { type: "feature-use-cases", pattern: "features/*/use-cases", capture: ["feature"] },
        { type: "feature-api", pattern: "features/*/api", capture: ["feature"] },
        { type: "feature-client", pattern: "features/*/client", capture: ["feature"] },
        { type: "feature-ui", pattern: "features/*/ui", capture: ["feature"] },
        { type: "shared-db", pattern: "shared/db" },
        // `module` names the shared module (shared/pagination -> "pagination") so
        // the dependency-free ones can be allowed into contracts individually.
        { type: "shared", pattern: "shared/*", capture: ["module"] },
        { type: "app", pattern: "app" },
      ],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          message:
            "{{ from.element.types }} may not import {{ to.element.types }} (architecture boundaries)",
          policies: [
            // app/ may not reach into data/ or domain/ — only public feature surfaces.
            {
              from: { element: { type: "app" } },
              allow: {
                to: [
                  {
                    element: {
                      type: ["app", "shared", "feature-api", "feature-use-cases", "feature-ui"],
                    },
                  },
                  { element: { type: "feature-root-file", captured: { fileName: "index" } } },
                ],
              },
            },
            // Domain stays pure: same-feature domain code and nothing else.
            {
              from: { element: { type: "feature-domain" } },
              allow: {
                to: [
                  {
                    element: {
                      type: "feature-domain",
                      captured: { feature: "{{ from.element.captured.feature }}" },
                    },
                  },
                ],
              },
            },
            // Contracts are isomorphic: zod (external) + same-feature domain +
            // pure shared modules (the page/limit query schema list contracts extend).
            {
              from: { element: { type: "feature-root-file", captured: { fileName: "contracts" } } },
              allow: {
                to: [
                  {
                    element: {
                      type: "feature-domain",
                      captured: { feature: "{{ from.element.captured.feature }}" },
                    },
                  },
                  { element: { type: "shared", captured: { module: "pagination" } } },
                ],
              },
            },
            // Colocated tests for a root file may import their own feature.
            {
              from: {
                element: { type: "feature-root-file", captured: { fileName: "*.test" } },
              },
              allow: {
                to: [
                  { element: { type: "shared" } },
                  {
                    element: {
                      type: ["feature-root-file", "feature-domain"],
                      captured: { feature: "{{ from.element.captured.feature }}" },
                    },
                  },
                ],
              },
            },
            // data/ is the only feature layer allowed to touch shared/db.
            {
              from: { element: { type: "feature-data" } },
              allow: {
                to: [
                  { element: { type: ["shared-db", "shared"] } },
                  {
                    element: {
                      type: "feature-domain",
                      captured: { feature: "{{ from.element.captured.feature }}" },
                    },
                  },
                  {
                    element: {
                      type: "feature-root-file",
                      captured: {
                        feature: "{{ from.element.captured.feature }}",
                        fileName: "contracts",
                      },
                    },
                  },
                ],
              },
            },
            {
              from: { element: { type: "feature-use-cases" } },
              allow: {
                to: [
                  { element: { type: "shared" } },
                  {
                    element: {
                      type: ["feature-domain", "feature-data"],
                      captured: { feature: "{{ from.element.captured.feature }}" },
                    },
                  },
                  {
                    element: {
                      type: "feature-root-file",
                      captured: {
                        feature: "{{ from.element.captured.feature }}",
                        fileName: "contracts",
                      },
                    },
                  },
                  // Cross-feature access goes through the public barrel only.
                  { element: { type: "feature-root-file", captured: { fileName: "index" } } },
                ],
              },
            },
            {
              from: { element: { type: "feature-api" } },
              allow: {
                to: [
                  { element: { type: "shared" } },
                  {
                    element: {
                      type: ["feature-domain", "feature-data", "feature-use-cases"],
                      captured: { feature: "{{ from.element.captured.feature }}" },
                    },
                  },
                  {
                    element: {
                      type: "feature-root-file",
                      captured: {
                        feature: "{{ from.element.captured.feature }}",
                        fileName: "contracts",
                      },
                    },
                  },
                  { element: { type: "feature-root-file", captured: { fileName: "index" } } },
                ],
              },
            },
            {
              from: { element: { type: "feature-client" } },
              allow: {
                to: [
                  { element: { type: "shared" } },
                  {
                    element: {
                      type: "feature-root-file",
                      captured: {
                        feature: "{{ from.element.captured.feature }}",
                        fileName: "contracts",
                      },
                    },
                  },
                ],
              },
            },
            {
              from: { element: { type: "feature-ui" } },
              allow: {
                to: [
                  { element: { type: "shared" } },
                  {
                    element: {
                      type: ["feature-domain", "feature-client", "feature-ui"],
                      captured: { feature: "{{ from.element.captured.feature }}" },
                    },
                  },
                  {
                    element: {
                      type: "feature-root-file",
                      captured: {
                        feature: "{{ from.element.captured.feature }}",
                        fileName: "contracts",
                      },
                    },
                  },
                  { element: { type: "feature-root-file", captured: { fileName: "index" } } },
                ],
              },
            },
            // index.ts may reach anything within its own feature.
            {
              from: {
                element: { type: "feature-root-file", captured: { fileName: "index" } },
              },
              allow: {
                to: [
                  {
                    element: {
                      type: [
                        "feature-domain",
                        "feature-data",
                        "feature-use-cases",
                        "feature-api",
                        "feature-client",
                        "feature-ui",
                      ],
                      captured: { feature: "{{ from.element.captured.feature }}" },
                    },
                  },
                  {
                    element: {
                      type: "feature-root-file",
                      captured: { feature: "{{ from.element.captured.feature }}" },
                    },
                  },
                ],
              },
            },
            {
              from: { element: { type: "shared" } },
              allow: { to: { element: { type: ["shared", "shared-db"] } } },
            },
            {
              from: { element: { type: "shared-db" } },
              allow: { to: { element: { type: "shared-db" } } },
            },
          ],
        },
      ],
    },
  },
  // Domain purity against external packages (boundaries only sees internal files).
  {
    files: ["features/*/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "react",
                "react-*",
                "next",
                "next/*",
                "@prisma/*",
                "@bootstrap/*",
                "server-only",
              ],
              message:
                "Domain code must stay pure — no framework, database, or auth-library imports.",
            },
          ],
        },
      ],
    },
  },
]);
