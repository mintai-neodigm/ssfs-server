const assert = require("node:assert/strict");
const test = require("node:test");
const packageJson = require("../package.json");

const {
  computeCompositeScore,
  openApiDocument,
  serviceDefinition,
} = require("../src/server");

test("service definition exposes expected inputs and outputs", () => {
  assert.equal(serviceDefinition.serviceName, "Lead Scoring Calculator");
  assert.deepEqual(
    serviceDefinition.inputs.map((input) => input.name),
    ["behavioralScore", "demographicScore"]
  );
  assert.deepEqual(
    serviceDefinition.outputs.map((output) => output.name),
    ["compositeScore"]
  );
});

test("openapi document exposes compute score endpoint", () => {
  assert.equal(openApiDocument.openapi, "3.0.3");
  assert.equal(
    openApiDocument["x-providerName"],
    "Marketo SSFS Lead Scoring Calculator",
  );
  assert.equal(
    openApiDocument.info["x-providerName"],
    "Marketo SSFS Lead Scoring Calculator",
  );
  assert.equal(openApiDocument.info["x-schemaVersion"], packageJson.version);
  assert.equal(openApiDocument.info["x-supportContact"], "support@example.com");
  assert.deepEqual(openApiDocument.servers, [{ url: "/" }]);
  assert.ok(openApiDocument.paths["/openapi.json"].get);
  assert.ok(openApiDocument.paths["/v1/computeScore"].post);
  assert.equal(
    openApiDocument.components.securitySchemes.apiKeyAuth.name,
    "x-api-key",
  );
});

test("computes weighted composite score", () => {
  const score = computeCompositeScore({
    behavioralScore: 3,
    demographicScore: 20
  });

  assert.equal(score, 20.9);
});

test("accepts numeric strings from form-like integrations", () => {
  const score = computeCompositeScore({
    behavioralScore: "10.5",
    demographicScore: "2"
  });

  assert.equal(score, 5.15);
});

test("rejects non-finite score values", () => {
  assert.throws(
    () => computeCompositeScore({ behavioralScore: "abc", demographicScore: 20 }),
    /behavioralScore must be a finite number/
  );
});
