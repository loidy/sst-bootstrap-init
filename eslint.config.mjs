import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      "node_modules/**",
      "bootstrap-app/**",
      "bootstrap-root-project/**",
      "bootstrap-vault/**",
    ],
  },
);
