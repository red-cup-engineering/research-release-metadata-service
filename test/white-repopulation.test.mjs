// The generated files for the white-repopulation paper are valid and at least as rich as the
// hand-written ones they replace: every field of CITATION.cff, .zenodo.json and publication.json
// survives, or is superseded for a stated reason (the AI system moves from Zenodo creator to
// contributor, because an AI system cannot hold the accountability a creator carries).
import test from "node:test";
import assert from "node:assert/strict";
import { decodeYaml } from "@red-cup-engineering/yaml-frontmatter-codec-service";
import { projectCitationCff } from "../scripts/project-citation-cff.mjs";
import { projectZenodoMetadata } from "../scripts/project-zenodo-metadata.mjs";
import { projectCodemeta } from "../scripts/project-codemeta.mjs";
import { projectScholarlyArticleJsonLd } from "../scripts/project-scholarly-article-json-ld.mjs";
import { cffValidator, fixture, whitePaperYaml } from "./helpers.mjs";

const oldCff = decodeYaml(fixture("existing/CITATION.cff"));
const oldZenodo = JSON.parse(fixture("existing/.zenodo.json"));
const publication = JSON.parse(fixture("existing/publication.json"));
const cff = projectCitationCff({ paperYaml: whitePaperYaml });
const zenodo = projectZenodoMetadata({ paperYaml: whitePaperYaml });
const codemeta = projectCodemeta({ paperYaml: whitePaperYaml });
const article = projectScholarlyArticleJsonLd({ paperYaml: whitePaperYaml });
const everything = [cff.text, zenodo.text, codemeta.text, article.text].join("\n");

test("generated CITATION.cff is valid against the official schema", () => {
  const validate = cffValidator();
  assert.equal(validate(decodeYaml(cff.text)), true, JSON.stringify(validate.errors, null, 1));
});

test("CITATION.cff keeps every top-level field of the hand-written file, with the same values where they were data", () => {
  for (const key of Object.keys(oldCff)) assert.ok(key in cff.value, `CITATION.cff lost ${key}`);
  assert.equal(cff.value["cff-version"], oldCff["cff-version"]);
  assert.equal(cff.value.title, oldCff.title);
  assert.equal(cff.value.version, oldCff.version);
  assert.equal(cff.value.license, oldCff.license);
  // The human author gains an affiliation; the names, and the AI entity label, are unchanged.
  assert.deepEqual(cff.value.authors.map(({ affiliation, ...rest }) => rest), oldCff.authors);
  assert.ok(oldCff.keywords.every((keyword) => cff.value.keywords.includes(keyword)));
  assert.equal(cff.value.abstract, oldCff.abstract.trim());
  assert.match(cff.value.message, new RegExp(oldCff.message.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  const old = oldCff["preferred-citation"];
  const now = cff.value["preferred-citation"];
  for (const key of Object.keys(old)) assert.ok(key in now, `preferred-citation lost ${key}`);
  assert.equal(now.type, old.type);
  assert.deepEqual(now.institution, old.institution);
  assert.equal(now.year, old.year);
  for (const sentence of ["Research preprint candidate", "not peer reviewed", "An anonymous contributor acknowledged for research direction", "No DOI"]) {
    assert.match(now.notes.toLowerCase(), new RegExp(sentence.toLowerCase(), "u"));
  }
});

test("CITATION.cff is richer than the hand-written file", () => {
  assert.ok(Object.keys(cff.value).length > Object.keys(oldCff).length);
  assert.ok(cff.value["repository-code"]);
  assert.match(cff.value.message, /AI disclosure:/u);
});

test(".zenodo.json keeps every field of the hand-written file, except that the AI system moves from creator to contributor", () => {
  for (const key of Object.keys(oldZenodo)) assert.ok(key in zenodo.value, `.zenodo.json lost ${key}`);
  for (const key of ["title", "upload_type", "publication_type", "license", "access_right", "version"]) assert.equal(zenodo.value[key], oldZenodo[key], key);
  assert.ok(oldZenodo.keywords.every((keyword) => zenodo.value.keywords.includes(keyword)));
  const human = oldZenodo.creators[0];
  assert.deepEqual(zenodo.value.creators, [human]);
  const ai = oldZenodo.creators[1];
  assert.ok(zenodo.value.contributors.some((c) => c.name === ai.name && c.type === "Other" && c.affiliation.includes(ai.affiliation)), "AI system must be credited as a contributor");
  assert.ok(zenodo.value.contributors.some((c) => c.name === "Anonymous contributor" && c.type === "Other"));
  assert.ok(zenodo.value.description.length > oldZenodo.description.length / 2);
  assert.ok(zenodo.value.description.includes("Historical sociology of selective reproductive ideals"));
  assert.ok(Object.keys(zenodo.value).length > Object.keys(oldZenodo).length);
});

test("publication.json facts all appear in the generated files", () => {
  assert.ok(everything.includes(publication.title));
  assert.ok(everything.includes(publication.subtitle));
  assert.ok(everything.includes(publication.version));
  assert.ok(everything.includes(publication.publishing_organization));
  assert.equal(publication.doi, null);
  assert.equal("doi" in cff.value, false);
  assert.ok(zenodo.text.includes(publication.ai_disclosure.replace("Codex 6.1 is an AI system", "Codex 6.1 is an AI system")));
  assert.ok(cff.value.message.includes("cannot accept the human author's scholarly, legal or ethical accountability"));
  for (const person of publication.acknowledgements) assert.ok(zenodo.text.includes(person.name) && cff.value["preferred-citation"].notes.includes(person.role));
  const related = zenodo.value.related_identifiers.map((r) => r.identifier);
  for (const manuscript of publication.source_manuscripts) assert.ok(related.includes(manuscript), manuscript);
  for (const [path, file] of Object.entries(publication.files)) {
    const part = article.value.hasPart.find((p) => p.name === path);
    assert.ok(part, path);
    assert.equal(part.sha256, file.sha256);
    assert.equal(part.contentSize, String(file.bytes));
  }
  for (const [label, text] of Object.entries(publication.evidence)) assert.ok(zenodo.value.description.includes(`${label}: ${text}`), label);
  assert.ok(zenodo.value.notes.includes(publication.license_scope));
  assert.equal(article.value.creativeWorkStatus, "Draft");
  assert.deepEqual(article.value.author.map((a) => a.name), ["Morgan Sennhauser"]);
  assert.equal(article.value.contributor[0].name, "Codex 6.1");
  assert.equal(codemeta.value.author[0].name, "Morgan Sennhauser");
});
