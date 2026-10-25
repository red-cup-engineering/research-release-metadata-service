import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validateJsonSchema, validateJsonSchemaDocument } from "@red-cup-engineering/json-schema-services-section/validation";

export const here = dirname(fileURLToPath(import.meta.url));
export const root = join(here, "..");
export const fixture = (name) => readFileSync(join(here, "fixtures", name), "utf8");
export const json = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));

export const whitePaperYaml = fixture("white-repopulation.paper.yaml");

/** A validator over a schema, from the house json-schema-services-section: `validate(value)` is a boolean, `validate.errors` the issues. */
function validatorOf(published) {
  // The official CFF schema names its dialect `http://json-schema.org/draft-07/schema` (no empty fragment); the house validator names it with the `#`.
  const schema = published.$schema === "http://json-schema.org/draft-07/schema" ? { ...published, $schema: "http://json-schema.org/draft-07/schema#" } : published;
  const document = validateJsonSchemaDocument(schema);
  if (document.issues?.length > 0) throw new TypeError(`not a valid schema: ${JSON.stringify(document.issues)}`);
  const validate = (value) => {
    const { issues } = validateJsonSchema(value, schema);
    validate.errors = issues.length === 0 ? null : issues;
    return issues.length === 0;
  };
  validate.errors = null;
  return validate;
}

/** An official-schema validator for CITATION.cff (draft-07). */
export const cffValidator = () => validatorOf(JSON.parse(fixture("cff-1.2.0.schema.json")));

/** A validator for a 2020-12 schema; building it proves the schema is itself a valid document. */
export const schema2020 = (schema) => validatorOf(schema);

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
