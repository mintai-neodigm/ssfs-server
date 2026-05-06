const assert = require("node:assert/strict");
const test = require("node:test");

const { computeCompositeScore, serviceDefinition } = require("../src/server");

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
