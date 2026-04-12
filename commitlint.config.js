/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Allow longer subjects (default is 72; we use 100)
    "header-max-length": [1, "always", 100],
    // Scope is optional
    "scope-empty": [0],
    // Body line length
    "body-max-line-length": [1, "always", 200],
  },
  ignores: [
    // Allow Claude Co-Authored-By trailers
    (commit) => commit.includes("Co-Authored-By: Claude"),
  ],
};
