import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildOpenApiSpec, validateOpenApiSpec } from "./openapi.js";

describe("buildOpenApiSpec", () => {
  it("injects openapi 3.0.3 version", () => {
    const spec = buildOpenApiSpec({
      info: { title: "x", version: "1.0.0" },
      servers: [{ url: "http://localhost" }],
      paths: { "/health": { get: { responses: { "200": { description: "ok" } } } } },
    });
    assert.equal(spec.openapi, "3.0.3");
    assert.equal(spec.info.title, "x");
  });
});

describe("validateOpenApiSpec", () => {
  it("returns errors for non-objects", () => {
    assert.deepEqual(validateOpenApiSpec(null), ["spec must be an object"]);
    assert.deepEqual(validateOpenApiSpec("nope"), ["spec must be an object"]);
  });

  it("requires openapi version", () => {
    const errs = validateOpenApiSpec({
      info: { title: "x", version: "1" },
      servers: [{ url: "/" }],
      paths: {},
    });
    assert.ok(errs.includes(`openapi must be "3.0.3"`));
  });

  it("requires info.title and info.version", () => {
    const errs = validateOpenApiSpec({
      openapi: "3.0.3",
      info: {},
      servers: [{ url: "/" }],
      paths: {},
    });
    assert.ok(errs.some((e) => e.includes("info.title")));
  });

  it("requires non-empty servers", () => {
    const errs = validateOpenApiSpec({
      openapi: "3.0.3",
      info: { title: "x", version: "1" },
      servers: [],
      paths: {},
    });
    assert.ok(errs.some((e) => e.includes("servers")));
  });

  it("requires paths object", () => {
    const errs = validateOpenApiSpec({
      openapi: "3.0.3",
      info: { title: "x", version: "1" },
      servers: [{ url: "/" }],
    });
    assert.ok(errs.some((e) => e.includes("paths")));
  });

  it("rejects paths without leading slash", () => {
    const errs = validateOpenApiSpec({
      openapi: "3.0.3",
      info: { title: "x", version: "1" },
      servers: [{ url: "/" }],
      paths: { health: { get: { responses: { "200": { description: "ok" } } } } },
    });
    assert.ok(errs.some((e) => e.includes(`must start with /`)));
  });

  it("accepts a minimal valid spec", () => {
    const spec = buildOpenApiSpec({
      info: { title: "x", version: "1" },
      servers: [{ url: "/" }],
      paths: { "/health": { get: { responses: { "200": { description: "ok" } } } } },
    });
    assert.deepEqual(validateOpenApiSpec(spec), []);
  });
});
