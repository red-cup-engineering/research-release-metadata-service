import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { projectCitationCff } from "../scripts/project-citation-cff.mjs";

const contract = JSON.parse(readFileSync(new URL("../data/hoare-service-contracts/project-citation-cff.json", import.meta.url), "utf8"));

test("the service reproduces the contract's own example, twice", async () => {
  const first = await projectCitationCff(structuredClone(contract.pre.input.example));
  const second = await projectCitationCff(structuredClone(contract.pre.input.example));
  assert.deepEqual(first, contract.post.output.example);
  assert.deepEqual(second, first);
});

test("the contract states the refusals the service actually has", () => {
  assert.throws(() => projectCitationCff({ paper: { id: "incomplete" } }), TypeError);
  assert.ok(contract.refusals.some((refusal) => refusal.when === "pre:request-shape" && refusal.http === 422));
  assert.equal(contract.saleStatus, "held");
});
