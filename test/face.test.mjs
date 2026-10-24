import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { root, whitePaperYaml } from "./helpers.mjs";

function run(script, lines) {
  return spawnSync(process.execPath, [join(root, "scripts", `${script}.mjs`)], { input: lines.map((line) => JSON.stringify(line)).join("\n") + "\n", encoding: "utf8" });
}

for (const script of ["project-citation-cff", "project-zenodo-metadata", "project-codemeta", "project-scholarly-article-json-ld"]) {
  test(`${script}: reads one JSON value per line, writes one per line, refuses with {ok:false, refusal} and exit 2`, () => {
    const result = run(script, [{ paperYaml: whitePaperYaml }, { paperYaml: whitePaperYaml }, { nope: true }]);
    const lines = result.stdout.trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(lines.length, 3);
    assert.equal(typeof lines[0].text, "string");
    assert.deepEqual(lines[0], lines[1]);
    assert.equal(lines[2].ok, false);
    assert.equal(typeof lines[2].refusal.reason, "string");
    assert.equal(typeof lines[2].refusal.message, "string");
    assert.equal(result.status, 2);
  });
}

test("check-release-metadata-consistency: NDJSON face reports drift", () => {
  const result = run("check-release-metadata-consistency", [{ paperYaml: whitePaperYaml, files: { "CITATION.cff": null } }]);
  const [line] = result.stdout.trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(line.consistent, false);
  assert.equal(line.drift[0].rule, "file-missing");
  assert.equal(result.status, 0);
});

test("--help names the operation", () => {
  const result = spawnSync(process.execPath, [join(root, "scripts", "project-codemeta.mjs"), "--help"], { encoding: "utf8" });
  assert.match(result.stdout, /^projectCodemeta/u);
});
