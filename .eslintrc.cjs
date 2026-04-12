/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true,
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  rules: {
    // Catch unhandled promise rejections
    "@typescript-eslint/no-floating-promises": "warn",
    // Enforce consistent type-only imports
    "@typescript-eslint/consistent-type-imports": [
      "warn",
      { prefer: "type-imports", fixStyle: "inline-type-imports" },
    ],
    // Allow unused vars with underscore prefix
    "@typescript-eslint/no-unused-vars": [
      "warn",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
    // Allow explicit any in bot/service code (many external types)
    "@typescript-eslint/no-explicit-any": "warn",
  },
  ignorePatterns: ["node_modules/", "dist/", ".next/", "contracts/", "coverage/", "*.min.js"],
  overrides: [
    // Next.js app — extend with core-web-vitals
    {
      files: ["apps/web/**/*.{ts,tsx}"],
      extends: ["next/core-web-vitals"],
      rules: {
        "react/no-unescaped-entities": "off",
      },
    },
    // Test files — relax some rules
    {
      files: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/e2e/**"],
      rules: {
        "@typescript-eslint/no-explicit-any": "off",
      },
    },
  ],
};
