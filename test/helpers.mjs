import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Ajv from "ajv";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

export const here = dirname(fileURLToPath(import.meta.url));
export const root = join(here, "..");
export const fixture = (name) => readFileSync(join(here, "fixtures", name), "utf8");
export const json = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));

export const whitePaperYaml = fixture("white-repopulation.paper.yaml");

/** An official-schema validator for CITATION.cff (draft-07). */
export function cffValidator() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(JSON.parse(fixture("cff-1.2.0.schema.json")));
}

/** A 2020-12 validator, used to prove paper.schema.json is itself a valid 2020-12 schema. */
export function schema2020(schema) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(schema);
}

/** A small admissible paper, written fresh per call so tests may mutate it. */
export function minimalPaper(overrides = {}) {
  return structuredClone({
    id: "small-paper",
    title: "A Small Paper",
    version: "1.0.0",
    status: "released",
    "date-released": "2026-01-02",
    abstract: "A short abstract & a <test>.",
    keywords: ["testing", "metadata"],
    license: { text: "CC-BY-4.0", code: "MIT", data: "CC0-1.0" },
    authors: [
      { given: "Ada", family: "Lovelace", orcid: "0000-0002-1825-0097", affiliation: "Analytical Engine Society", role: "accountable-human-author", ai: false },
    ],
    ...overrides,
  });
}

export function withAi(paper = minimalPaper()) {
  paper.authors.push({ name: "Assistant 1", role: "drafting-collaborator", ai: true, disclosure: "Drafted section outlines." });
  paper["ai-disclosure"] = { statement: "Assistant 1 is an AI system credited for drafting help." };
  return paper;
}
