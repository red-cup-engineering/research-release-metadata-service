import test from "node:test";
import assert from "node:assert/strict";
import { admitPaper, parsePaperYaml, resolvePaper, orderedAuthors, PAPER_SCHEMA } from "../scripts/paper.mjs";
import { minimalPaper, schema2020, whitePaperYaml, withAi } from "./helpers.mjs";

test("paper.schema.json is a valid JSON Schema 2020-12 document and admits the minimal paper", () => {
  const validate = schema2020(PAPER_SCHEMA);
  assert.equal(validate(minimalPaper()), true, JSON.stringify(validate.errors));
  assert.equal(validate(withAi()), true, JSON.stringify(validate.errors));
  assert.equal(PAPER_SCHEMA.$schema, "https://json-schema.org/draft/2020-12/schema");
});

test("admitPaper admits the white-repopulation fixture, frozen", () => {
  const paper = admitPaper(parsePaperYaml(whitePaperYaml));
  assert.equal(paper.id, "white-repopulation");
  assert.equal(Object.isFrozen(paper), true);
});

test("an AI system alone cannot be the accountable author", () => {
  const paper = withAi(minimalPaper());
  paper.authors = [paper.authors[1]];
  assert.throws(() => admitPaper(paper), RangeError);
});

test("a human author whose role does not name accountability is not enough", () => {
  const paper = withAi(minimalPaper());
  paper.authors[0].role = "writer";
  assert.throws(() => admitPaper(paper), /accountable/u);
});

test("an AI system claiming accountability is refused", () => {
  const paper = withAi(minimalPaper());
  paper.authors[1].role = "accountable-author";
  assert.throws(() => admitPaper(paper), /cannot hold accountability/u);
});

test("an AI author without a disclosure, with an ORCID, or with a personal name is refused by the schema", () => {
  for (const mutate of [(a) => delete a.disclosure, (a) => { a.orcid = "0000-0002-1825-0097"; }, (a) => { a.given = "Assistant"; }]) {
    const paper = withAi(minimalPaper());
    mutate(paper.authors[1]);
    assert.throws(() => admitPaper(paper), TypeError);
  }
});

test("crediting an AI system requires the paper-level ai-disclosure", () => {
  const paper = withAi(minimalPaper());
  delete paper["ai-disclosure"];
  assert.throws(() => admitPaper(paper), /ai-disclosure/u);
});

test("unknown keys, missing required keys and duplicate authors are refused", () => {
  assert.throws(() => admitPaper({ ...minimalPaper(), surprise: 1 }), TypeError);
  const missing = minimalPaper();
  delete missing.abstract;
  assert.throws(() => admitPaper(missing), TypeError);
  const twice = minimalPaper();
  twice.authors.push({ ...twice.authors[0] });
  assert.throws(() => admitPaper(twice), RangeError);
  assert.throws(() => admitPaper(null), TypeError);
});

test("resolvePaper requires exactly one of paper and paperYaml and refuses other keys", () => {
  assert.throws(() => resolvePaper({}), /exactly one/u);
  assert.throws(() => resolvePaper({ paper: minimalPaper(), paperYaml: whitePaperYaml }), /exactly one/u);
  assert.throws(() => resolvePaper({ paper: minimalPaper(), extra: 1 }), /does not admit extra/u);
  assert.equal(resolvePaper({ paperYaml: whitePaperYaml }).id, "white-repopulation");
});

test("orderedAuthors puts the accountable human first and AI systems last", () => {
  const paper = withAi(minimalPaper());
  paper.authors.unshift({ given: "Charles", family: "Babbage", role: "co-author", ai: false });
  paper.authors.unshift(paper.authors.pop());
  const order = orderedAuthors(admitPaper(paper)).map((a) => a.name ?? a.family);
  assert.deepEqual(order, ["Lovelace", "Babbage", "Assistant 1"]);
});
