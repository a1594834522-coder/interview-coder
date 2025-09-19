import js from "@eslint/js";
import globals from "globals";
import tseslintPlugin from "@typescript-eslint/eslint-plugin";
import tseslintParser from "@typescript-eslint/parser";
export default [
  {
    ignores: [
      "dist/**",
      "dist-electron/**",
      "renderer/dist/**",
      "renderer/.next/**",
      "renderer/**",
      "node_modules/**",
      ".claude/**",
      "electron/**",
      "src/types/**",
      "src/env.d.ts",
      "src/_pages/Debug.tsx",
      "src/_pages/Solutions.tsx",
      "**/*.json",
      "**/*.jsonc",
      "**/*.json5",
      "**/*.md",
      "**/*.css",
    ],
  },

  js.configs.recommended,

  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    languageOptions: {
      parser: tseslintParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      "@typescript-eslint": tseslintPlugin,
    },
    rules: {
      ...tseslintPlugin.configs.recommended.rules, 
    },
  },

];
