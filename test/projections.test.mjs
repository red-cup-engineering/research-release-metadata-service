import test from "node:test";
import assert from "node:assert/strict";
import { decodeYaml } from "@red-cup-engineering/yaml-frontmatter-codec-service";
import { projectCitationCff } from "../scripts/project-citation-cff.mjs";
import { projectZenodoMetadata } from "../scripts/project-zenodo-metadata.mjs";
import { projectCodemeta } from "../scripts/project-codemeta.mjs";
import { projectScholarlyArticleJsonLd } from "../scripts/project-scholarly-article-json-ld.mjs";
import { cffValidator, minimalPaper, whitePaperYaml, withAi } from "./helpers.mjs";

const validateCff = cffValidator();
const projections = [projectCitationCff, projectZenodoMetadata, projectCodemeta, projectScholarlyArticleJsonLd];

function assertCffValid(text) {
  const document = decodeYaml(text);
  assert.equal(validateCff(document), true, JSON.stringify(validateCff.errors, null, 1));
  return document;
}

test("every projection is byte-reproducible, newline-terminated, and independent of paper vs paperYaml", () => {
  for (const project of projections) {
    const a = project({ paperYaml: whitePaperYaml });
    const b = project({ paperYaml: whitePaperYaml });
    assert.equal(a.text, b.text);
    assert.equal(a.text.endsWith("\n"), true);
    assert.equal(a.text.endsWith("\n\n"), false);
    const viaObject = project({ paper: decodeYaml(whitePaperYaml) });
    assert.equal(viaObject.text, a.text);
  }
});

test("CITATION.cff validates against the official CFF 1.2.0 schema for the fixture and for AI and non-AI papers", () => {
  for (const paper of [decodeYaml(whitePaperYaml), minimalPaper(), withAi(minimalPaper())]) {
    const { text, value } = projectCitationCff({ paper });
    const document = assertCffValid(text);
    assert.deepEqual(document, JSON.parse(JSON.stringify(value)));
  }
});

test("CFF credits the AI system as a name: entity after the accountable human, with the disclosure in message", () => {
  const { value } = projectCitationCff({ paper: withAi(minimalPaper()) });
  assert.deepEqual(value.authors[0], { "family-names": "Lovelace", "given-names": "Ada", orcid: "https://orcid.org/0000-0002-1825-0097", affiliation: "Analytical Engine Society" });
  assert.deepEqual(value.authors[1], { name: "Assistant 1 (disclosed AI research collaborator)" });
  assert.match(value.message, /AI disclosure:.*Assistant 1 is an AI system/u);
  assert.match(value.message, /Accountable author: Ada Lovelace\./u);
  assert.equal(value.license.length, 3);
  assert.equal(value["date-released"], "2026-01-02");
  assert.match(projectCitationCff({ paper: minimalPaper() }).text, /date-released: "2026-01-02"/u);
});

test("CFF without a release date emits none and cites the declared year", () => {
  const { value } = projectCitationCff({ paperYaml: whitePaperYaml });
  assert.equal("date-released" in value, false);
  assert.equal(value["preferred-citation"].year, 2026);
});

test("an AI system is never a Zenodo creator; it is a contributor of type Other with the disclosure in notes", () => {
  const { value } = projectZenodoMetadata({ paper: withAi(minimalPaper()) });
  assert.deepEqual(value.creators, [{ name: "Lovelace, Ada", affiliation: "Analytical Engine Society", orcid: "0000-0002-1825-0097" }]);
  assert.equal(value.contributors[0].name, "Assistant 1");
  assert.equal(value.contributors[0].type, "Other");
  assert.match(value.contributors[0].affiliation, /carries no accountability/u);
  assert.match(value.notes, /AI disclosure:/u);
  assert.equal(value.license, "cc-by-4.0");
  assert.equal(value.upload_type, "publication");
  assert.equal(value.publication_type, "preprint");
  assert.equal(value.publication_date, "2026-01-02");
  assert.match(value.description, /&amp;.*&lt;test&gt;/u);
});

test("Zenodo carries related identifiers, subjects, grants, language and doi when declared", () => {
  const paper = minimalPaper({
    doi: "10.5281/zenodo.1234567",
    language: "en",
    subjects: [{ term: "Sociology", identifier: "http://id.loc.gov/authorities/subjects/sh85123452", scheme: "url" }],
    funding: [{ funder: "A Funder", award: "X-1", "zenodo-grant-id": "10.13039/501100000780::283595" }],
    "related-identifiers": [{ identifier: "10.1234/abc", relation: "cites", scheme: "doi" }],
    "repository-code": "https://github.com/example/repo",
  });
  const { value } = projectZenodoMetadata({ paper });
  assert.equal(value.doi, "10.5281/zenodo.1234567");
  assert.equal(value.language, "eng");
  assert.equal(value.subjects.length, 1);
  assert.deepEqual(value.grants, [{ id: "10.13039/501100000780::283595" }]);
  assert.deepEqual(value.related_identifiers.map((r) => r.relation), ["cites", "isSupplementedBy"]);
});

test("codemeta is codemeta 3.0 JSON-LD with humans as authors and the AI system as a disclosed non-person contributor", () => {
  const { value } = projectCodemeta({ paper: withAi(minimalPaper()) });
  assert.equal(value["@context"], "https://w3id.org/codemeta/3.0");
  assert.equal(value["@type"], "SoftwareSourceCode");
  assert.equal(value.author.length, 1);
  assert.equal(value.author[0]["@type"], "Person");
  assert.equal(value.author[0]["@id"], "https://orcid.org/0000-0002-1825-0097");
  assert.equal(value.contributor[0]["@type"], "SoftwareApplication");
  assert.match(value.contributor[0].description, /cannot accept scholarly, legal or ethical accountability/u);
  assert.deepEqual(value.license, ["https://spdx.org/licenses/CC-BY-4.0", "https://spdx.org/licenses/MIT", "https://spdx.org/licenses/CC0-1.0"]);
  assert.equal(value.developmentStatus, "https://www.repostatus.org/#active");
});

test("ScholarlyArticle JSON-LD carries author, license, isBasedOn, citation, citation-count and creditText hooks", () => {
  const paper = withAi(minimalPaper({
    doi: "10.5281/zenodo.1234567",
    "repository-code": "https://github.com/example/repo",
    "related-identifiers": [
      { identifier: "10.1234/abc", relation: "cites", scheme: "doi" },
      { identifier: "https://example.org/source", relation: "isDerivedFrom", scheme: "url" },
    ],
    "citation-count": { value: 3, source: "OpenAlex", "observed-on": "2026-02-01" },
    artifacts: [{ path: "paper/p.pdf", sha256: "a".repeat(64), bytes: 10 }],
  }));
  const { value } = projectScholarlyArticleJsonLd({ paper });
  assert.equal(value["@type"], "ScholarlyArticle");
  assert.equal(value["@id"], "https://doi.org/10.5281/zenodo.1234567");
  assert.equal(value.author.length, 1);
  assert.match(value.creditText, /AI disclosure|AI system/u);
  assert.deepEqual(value.citation, ["https://doi.org/10.1234/abc"]);
  assert.deepEqual(value.isBasedOn, ["https://example.org/source", "https://github.com/example/repo"]);
  assert.equal(value.hasPart[0].encodingFormat, "application/pdf");
  assert.equal(value.hasPart[0].sha256, "a".repeat(64));
  assert.equal(value.additionalProperty.find((p) => p.name === "citation-count").value, 3);
  assert.equal(value.contributor[0]["@type"], "SoftwareApplication");
});

test("every projection refuses an inadmissible paper and a malformed request", () => {
  const bad = withAi(minimalPaper());
  bad.authors[0].ai = true;
  for (const project of projections) {
    assert.throws(() => project({ paper: bad }), (error) => error instanceof TypeError || error instanceof RangeError);
    assert.throws(() => project({}), TypeError);
    assert.throws(() => project(null), TypeError);
  }
});

test("CITATION.cff carries related identifiers as CFF identifiers: swh, doi and url keep their type, the rest are other, in order, the relation as description", () => {
  const paper = minimalPaper();
  paper["related-identifiers"] = [
    { identifier: "swh:1:rel:38fe7c944eb716249e88dbf8511acdd1ade7e809", relation: "isIdenticalTo", scheme: "swh" },
    { identifier: "https://doi.org/10.5281/zenodo.1234567", relation: "isSupplementTo", scheme: "doi" },
    { identifier: "10.5281/zenodo.7654321", relation: "isNewVersionOf", scheme: "doi" },
    { identifier: "https://example.org/data", relation: "isDerivedFrom", scheme: "url" },
    { identifier: "2601.00001", relation: "cites", scheme: "arxiv" },
  ];
  const { text, value } = projectCitationCff({ paper });
  assert.deepEqual(value.identifiers, [
    { type: "swh", value: "swh:1:rel:38fe7c944eb716249e88dbf8511acdd1ade7e809", description: "isIdenticalTo" },
    { type: "doi", value: "10.5281/zenodo.1234567", description: "isSupplementTo" },
    { type: "doi", value: "10.5281/zenodo.7654321", description: "isNewVersionOf" },
    { type: "url", value: "https://example.org/data", description: "isDerivedFrom" },
    { type: "other", value: "2601.00001", description: "cites" },
  ]);
  assert.deepEqual(assertCffValid(text).identifiers, value.identifiers);
  assert.ok(text.indexOf("identifiers:") < text.indexOf("preferred-citation:"));
  assert.equal(projectCitationCff({ paper: minimalPaper() }).value.identifiers, undefined);
});
