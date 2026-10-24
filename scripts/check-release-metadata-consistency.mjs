#!/usr/bin/env node
import { decodeYaml } from "@red-cup-engineering/yaml-frontmatter-codec-service";
import { aiEntries, resolvePaper } from "./paper.mjs";
import { projectCitationCff } from "./project-citation-cff.mjs";
import { projectZenodoMetadata } from "./project-zenodo-metadata.mjs";
import { projectCodemeta } from "./project-codemeta.mjs";
import { projectScholarlyArticleJsonLd } from "./project-scholarly-article-json-ld.mjs";
import { paperRequestSchema, runCommand } from "./face.mjs";

export const operationDefinition = {
  name: "checkReleaseMetadataConsistency",
  description: "Checks existing CITATION.cff, .zenodo.json, codemeta.json and scholarly-article.jsonld texts against what a paper.yaml projects, reporting every drift (missing, unexpected and different values) and every place an AI system is credited as accountable or leading.",
  inputSchema: paperRequestSchema({
    files: {
      type: "object",
      description: "File name to its text. A null value declares the file absent. Names: CITATION.cff, .zenodo.json, codemeta.json, scholarly-article.jsonld.",
      additionalProperties: { type: ["string", "null"] },
    },
  }),
  outputSchema: {
    type: "object",
    required: ["consistent", "files", "drift"],
    additionalProperties: false,
    properties: {
      consistent: { type: "boolean" },
      files: { type: "object" },
      drift: { type: "array" },
    },
  },
};

const PROJECTIONS = Object.freeze({
  "CITATION.cff": { project: projectCitationCff, parse: (text) => decodeYaml(text) },
  ".zenodo.json": { project: projectZenodoMetadata, parse: (text) => JSON.parse(text) },
  "codemeta.json": { project: projectCodemeta, parse: (text) => JSON.parse(text) },
  "scholarly-article.jsonld": { project: projectScholarlyArticleJsonLd, parse: (text) => JSON.parse(text) },
});

const pointer = (path, key) => `${path}/${String(key).replace(/~/gu, "~0").replace(/\//gu, "~1")}`;

/** Every leaf of a JSON value as [JSON Pointer, leaf] pairs; empty containers are leaves. */
export function leaves(value, path = "", out = new Map()) {
  if (Array.isArray(value) && value.length > 0) value.forEach((item, index) => leaves(item, pointer(path, index), out));
  else if (value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0) {
    for (const [key, child] of Object.entries(value)) leaves(child, pointer(path, key), out);
  } else out.set(path === "" ? "/" : path, value);
  return out;
}

function diff(file, expected, actual) {
  const want = leaves(expected);
  const have = leaves(actual);
  const drift = [];
  for (const [path, value] of want) {
    if (!have.has(path)) drift.push({ file, rule: "missing", path, expected: value });
    else if (JSON.stringify(have.get(path)) !== JSON.stringify(value)) drift.push({ file, rule: "different", path, expected: value, actual: have.get(path) });
  }
  for (const [path, value] of have) if (!want.has(path)) drift.push({ file, rule: "unexpected", path, actual: value });
  return drift;
}

/** Accountability drift visible in the files themselves, independent of the field diff. */
function accountabilityDrift(paper, name, actual) {
  const drift = [];
  const ai = aiEntries(paper).map((entry) => entry.name);
  const mentions = (text) => typeof text === "string" && ai.some((who) => text.startsWith(who));
  if (name === "CITATION.cff" && Array.isArray(actual.authors) && mentions(actual.authors[0]?.name)) {
    drift.push({ file: name, rule: "ai-leads-authors", path: "/authors/0", actual: actual.authors[0].name });
  }
  if (name === ".zenodo.json" && Array.isArray(actual.creators)) {
    actual.creators.forEach((creator, index) => {
      if (mentions(creator?.name)) drift.push({ file: name, rule: "ai-credited-as-creator", path: `/creators/${index}`, actual: creator.name });
    });
  }
  if ((name === "codemeta.json" || name === "scholarly-article.jsonld") && Array.isArray(actual.author)) {
    actual.author.forEach((author, index) => {
      if (mentions(author?.name)) drift.push({ file: name, rule: "ai-credited-as-author", path: `/author/${index}`, actual: author.name });
    });
  }
  return drift;
}

/**
 * Reports every drift between existing release-metadata files and the projections of a paper.yaml.
 * @param {{paper?: object, paperYaml?: string, files: Record<string, (string|null)>}} body exactly one of paper/paperYaml, and the files to check.
 * @returns {{consistent: boolean, files: object, drift: object[]}} per-file status (consistent, drift, missing, unparseable) with byteIdentical, and the drift list.
 * @throws {TypeError} on a malformed request or inadmissible paper; {RangeError} when the accountability law is broken.
 */
export function checkReleaseMetadataConsistency(body) {
  const paper = resolvePaper(body, ["files"]);
  if (body.files === null || typeof body.files !== "object" || Array.isArray(body.files) || Object.keys(body.files).length === 0) {
    throw new TypeError("files must be a nonempty object of file name to text");
  }
  const drift = [];
  const files = {};
  for (const name of Object.keys(body.files).sort()) {
    const projection = PROJECTIONS[name];
    if (projection === undefined) throw new TypeError(`files does not admit ${name}; admitted: ${Object.keys(PROJECTIONS).join(", ")}`);
    const text = body.files[name];
    if (text === null) {
      files[name] = { status: "missing" };
      drift.push({ file: name, rule: "file-missing", path: "/" });
      continue;
    }
    if (typeof text !== "string") throw new TypeError(`files[${name}] must be a string or null`);
    const generated = projection.project({ paper });
    let actual;
    try { actual = projection.parse(text); } catch (error) {
      files[name] = { status: "unparseable" };
      drift.push({ file: name, rule: "unparseable", path: "/", actual: String(error.message).slice(0, 300) });
      continue;
    }
    if (actual === null || typeof actual !== "object" || Array.isArray(actual)) {
      files[name] = { status: "unparseable" };
      drift.push({ file: name, rule: "unparseable", path: "/", actual: "document is not a mapping" });
      continue;
    }
    const found = [...diff(name, generated.value, actual), ...accountabilityDrift(paper, name, actual)];
    drift.push(...found);
    files[name] = { status: found.length === 0 ? "consistent" : "drift", byteIdentical: text === generated.text, drift: found.length };
  }
  return { consistent: drift.length === 0, files, drift };
}

if (import.meta.main) await runCommand(operationDefinition, checkReleaseMetadataConsistency);
