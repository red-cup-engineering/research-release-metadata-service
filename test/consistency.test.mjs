import test from "node:test";
import assert from "node:assert/strict";
import { checkReleaseMetadataConsistency, leaves } from "../scripts/check-release-metadata-consistency.mjs";
import { projectCitationCff } from "../scripts/project-citation-cff.mjs";
import { projectZenodoMetadata } from "../scripts/project-zenodo-metadata.mjs";
import { projectCodemeta } from "../scripts/project-codemeta.mjs";
import { projectScholarlyArticleJsonLd } from "../scripts/project-scholarly-article-json-ld.mjs";
import { fixture, whitePaperYaml } from "./helpers.mjs";

const generated = () => ({
  "CITATION.cff": projectCitationCff({ paperYaml: whitePaperYaml }).text,
  ".zenodo.json": projectZenodoMetadata({ paperYaml: whitePaperYaml }).text,
  "codemeta.json": projectCodemeta({ paperYaml: whitePaperYaml }).text,
  "scholarly-article.jsonld": projectScholarlyArticleJsonLd({ paperYaml: whitePaperYaml }).text,
});

test("freshly generated files are consistent and byte-identical", () => {
  const report = checkReleaseMetadataConsistency({ paperYaml: whitePaperYaml, files: generated() });
  assert.equal(report.consistent, true);
  assert.deepEqual(report.drift, []);
  for (const status of Object.values(report.files)) assert.deepEqual([status.status, status.byteIdentical], ["consistent", true]);
});

test("a changed value, a removed field and an added field are each reported", () => {
  const files = generated();
  const zenodo = JSON.parse(files[".zenodo.json"]);
  zenodo.version = "9.9.9";
  delete zenodo.license;
  zenodo.extra = true;
  files[".zenodo.json"] = JSON.stringify(zenodo);
  const report = checkReleaseMetadataConsistency({ paperYaml: whitePaperYaml, files });
  assert.equal(report.consistent, false);
  const byRule = (rule) => report.drift.filter((d) => d.rule === rule).map((d) => d.path);
  assert.deepEqual(byRule("different"), ["/version"]);
  assert.deepEqual(byRule("missing"), ["/license"]);
  assert.deepEqual(byRule("unexpected"), ["/extra"]);
  assert.equal(report.files[".zenodo.json"].status, "drift");
  assert.equal(report.files["CITATION.cff"].status, "consistent");
});

test("whitespace-only differences are not drift but are not byte-identical", () => {
  const files = generated();
  files["codemeta.json"] = JSON.stringify(JSON.parse(files["codemeta.json"]));
  const report = checkReleaseMetadataConsistency({ paperYaml: whitePaperYaml, files });
  assert.equal(report.consistent, true);
  assert.equal(report.files["codemeta.json"].byteIdentical, false);
});

test("missing and unparseable files are reported", () => {
  const report = checkReleaseMetadataConsistency({ paperYaml: whitePaperYaml, files: { "CITATION.cff": null, ".zenodo.json": "{nope", "codemeta.json": "[]" } });
  assert.deepEqual(report.drift.map((d) => d.rule).sort(), ["file-missing", "unparseable", "unparseable"]);
});

test("the hand-written white-repopulation files drift, and an AI system credited as a Zenodo creator is named", () => {
  const report = checkReleaseMetadataConsistency({
    paperYaml: whitePaperYaml,
    files: { "CITATION.cff": fixture("existing/CITATION.cff"), ".zenodo.json": fixture("existing/.zenodo.json") },
  });
  assert.equal(report.consistent, false);
  assert.ok(report.drift.some((d) => d.rule === "ai-credited-as-creator" && d.path === "/creators/1"));
  assert.ok(report.drift.some((d) => d.file === "CITATION.cff" && d.rule === "missing" && d.path === "/repository-code"));
  assert.ok(report.drift.some((d) => d.file === ".zenodo.json" && d.rule === "missing" && d.path === "/language"));
});

test("an AI system leading CITATION.cff authors is reported", () => {
  const files = generated();
  files["CITATION.cff"] = files["CITATION.cff"].replace(/(authors:\n)(  - family-names[\s\S]*?)(  - name: .*\n)/u, "$1$3$2");
  const report = checkReleaseMetadataConsistency({ paperYaml: whitePaperYaml, files });
  assert.ok(report.drift.some((d) => d.rule === "ai-leads-authors"));
});

test("refusals: unknown file names, no files, bad paper", () => {
  assert.throws(() => checkReleaseMetadataConsistency({ paperYaml: whitePaperYaml, files: { "README.md": "x" } }), /does not admit README.md/u);
  assert.throws(() => checkReleaseMetadataConsistency({ paperYaml: whitePaperYaml }), TypeError);
  assert.throws(() => checkReleaseMetadataConsistency({ paperYaml: whitePaperYaml, files: {} }), TypeError);
  assert.throws(() => checkReleaseMetadataConsistency({ paper: {}, files: { "CITATION.cff": "" } }), TypeError);
});

test("leaves flattens to JSON Pointers", () => {
  assert.deepEqual([...leaves({ a: [1, { "b/c": 2 }], e: [] })], [["/a/0", 1], ["/a/1/b~1c", 2], ["/e", []]]);
});
