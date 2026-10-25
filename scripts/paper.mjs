// The paper.yaml record: its schema, its admission, and the small shared algebra
// every projection reads it through. Pure and edge-safe: no filesystem, no
// clock, no network, no Node built-ins.
import { jsonLdText, pruneEmpty } from "@red-cup-engineering/json-ld-services-section/json-ld";
import { decodeYaml } from "@red-cup-engineering/yaml-frontmatter-codec-service";
import { validateJsonSchema } from "@red-cup-engineering/json-schema-services-section/validation";
import { admitResearchDocumentMetadata } from "@red-cup-engineering/research-document-metadata-admission-service";
import PAPER_SCHEMA from "../schemas/paper.schema.json" with { type: "json" };

export { PAPER_SCHEMA };

const ACCOUNTABLE = /accountab/iu;
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/** paper.yaml status words, mapped to the status vocabulary research-document-metadata-admission-service admits. */
const ADMISSION_STATUS = Object.freeze({ draft: "draft", "release-candidate": "working", released: "canonical", withdrawn: "deprecated" });

/** The label a generated file appends to an AI system's name, so no file can read it as a person. */
export const AI_ENTITY_SUFFIX = "(disclosed AI research collaborator)";

/**
 * Decode paper.yaml text to a JSON object.
 * @param {string} text paper.yaml source.
 * @returns {object} the decoded mapping.
 * @throws {TypeError} when text is not a YAML mapping.
 */
export function parsePaperYaml(text) {
  if (typeof text !== "string") throw new TypeError("paperYaml must be a string");
  return decodeYaml(text);
}

/**
 * Resolve the shared request shape `{paper}` xor `{paperYaml}` (plus allowed extra keys) to an admitted paper.
 * @param {object} body the request.
 * @param {string[]} [extra] further keys the calling operation accepts.
 * @returns {object} the admitted, frozen paper.
 * @throws {TypeError} on a malformed request or a paper that does not admit.
 */
export function resolvePaper(body, extra = []) {
  if (!isObject(body)) throw new TypeError("request must be an object with paper or paperYaml");
  const allowed = new Set(["paper", "paperYaml", ...extra]);
  for (const key of Object.keys(body)) if (!allowed.has(key)) throw new TypeError(`request does not admit ${key}`);
  const given = ["paper", "paperYaml"].filter((key) => body[key] !== undefined);
  if (given.length !== 1) throw new TypeError("request requires exactly one of paper or paperYaml");
  return admitPaper(given[0] === "paper" ? body.paper : parsePaperYaml(body.paperYaml));
}

function personLabel(entry) {
  return entry.ai ? entry.name : `${entry.given} ${entry.family}`;
}

/**
 * Admit a decoded paper.yaml: schema first, then the accountability law.
 *
 * Law: an AI system may be credited but cannot hold accountability. So at least one
 * author is a human (ai: false) whose role names accountability, no AI entry claims
 * accountability or carries a personal identifier, and every AI entry is covered by
 * a disclosure plus the paper-level ai-disclosure statement.
 *
 * @param {object} paper decoded paper.yaml.
 * @returns {object} the frozen paper.
 * @throws {TypeError} when the record is malformed or breaks the schema.
 * @throws {RangeError} when it breaks the accountability law.
 */
export function admitPaper(paper) {
  if (!isObject(paper)) throw new TypeError("paper must be an object");
  const result = validateJsonSchema(paper, PAPER_SCHEMA);
  if (!result.valid) {
    throw new TypeError(`paper.yaml is not admissible: ${result.issues.map((issue) => `${issue.path || "/"} ${issue.keyword}: ${issue.message}`).join("; ")}`);
  }
  const everyone = [...paper.authors, ...(paper.contributors ?? [])];
  for (const entry of everyone) {
    if (entry.ai === true && ACCOUNTABLE.test(entry.role)) {
      throw new RangeError(`${entry.name}: an AI system cannot hold accountability; role ${JSON.stringify(entry.role)} claims it`);
    }
  }
  const accountable = paper.authors.filter((author) => author.ai === false && ACCOUNTABLE.test(author.role));
  if (accountable.length === 0) {
    throw new RangeError("at least one human author (ai: false) must hold an accountable role (a role naming accountability, e.g. accountable-human-author); an AI system cannot be the accountable author");
  }
  if (everyone.some((entry) => entry.ai === true) && !isObject(paper["ai-disclosure"])) {
    throw new RangeError("a paper crediting an AI system requires ai-disclosure.statement");
  }
  const seen = new Set();
  for (const author of paper.authors) {
    const label = personLabel(author).toLowerCase();
    if (seen.has(label)) throw new RangeError(`author ${personLabel(author)} is listed twice`);
    seen.add(label);
  }
  const admission = admitResearchDocumentMetadata({
    id: paper.id,
    title: paper.title,
    status: ADMISSION_STATUS[paper.status],
    authors: paper.authors.map(personLabel),
    keywords: paper.keywords,
    ...(paper.doi === undefined ? {} : { doi: paper.doi }),
    license: paper.license.text,
  });
  if (!admission.ok) {
    throw new TypeError(`paper.yaml is not admissible as research-document metadata: ${admission.refusal.issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")}`);
  }
  return deepFreeze(structuredClone(paper));
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object") for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

/**
 * Authors in credited order: humans first in declared order (the accountable human leads),
 * then AI systems. The accountable author is moved to the front if declared later.
 */
export function orderedAuthors(paper) {
  const humans = paper.authors.filter((author) => author.ai === false);
  const lead = humans.findIndex((author) => ACCOUNTABLE.test(author.role));
  const ordered = [humans[lead], ...humans.filter((_, index) => index !== lead)];
  return [...ordered, ...paper.authors.filter((author) => author.ai === true)];
}

/** Every credited AI entry across authors and contributors. */
export function aiEntries(paper) {
  return [...paper.authors, ...(paper.contributors ?? [])].filter((entry) => entry.ai === true);
}

export const orcidUrl = (orcid) => (orcid.startsWith("https://") ? orcid : `https://orcid.org/${orcid}`);
export const spdxUrl = (id) => `https://spdx.org/licenses/${id}`;
export const doiUrl = (doi) => `https://doi.org/${doi}`;
export const aiEntityName = (entry) => `${entry.name} ${AI_ENTITY_SUFFIX}`;

/** The distinct licences of a release in text, code, data order. */
export function distinctLicenses(paper) {
  const ids = [paper.license.text, paper.license.code, paper.license.data].filter((id) => id !== undefined);
  return [...new Set(ids)];
}

/** The accountability sentence every disclosure carries. */
export const NO_ACCOUNTABILITY = "It is credited for its contribution and cannot accept scholarly, legal or ethical accountability, which rests with the accountable human author.";

/** The AI-disclosure paragraph shared by every projection, or undefined when no AI system is credited. */
export function disclosureText(paper) {
  const ai = aiEntries(paper);
  if (ai.length === 0) return undefined;
  const parts = [paper["ai-disclosure"].statement.trim()];
  for (const entry of ai) parts.push(`${entry.name}: ${entry.disclosure.trim()}`);
  const accountable = orderedAuthors(paper).filter((author) => author.ai === false && ACCOUNTABLE.test(author.role));
  parts.push(`Accountable author${accountable.length > 1 ? "s" : ""}: ${accountable.map(personLabel).join("; ")}.`);
  return parts.join(" ");
}

/** The CARE statements as ordered [label, text] pairs. */
export function careStatements(paper) {
  const care = paper.care ?? {};
  return ["authority-to-control", "responsibility", "ethics", "collective-benefit"].filter((key) => care[key] !== undefined).map((key) => [key, care[key]]);
}

/** Evidence limits and the licence scope, as plain sentences. */
export function limitationTexts(paper) {
  return [...(paper.limitations ?? []), ...(paper.license.scope === undefined ? [] : [`Licence scope: ${paper.license.scope}`])];
}

/** Serialize a JSON value with fixed two-space indent and a trailing newline: the one JSON layout (json-ld-services-section). */
export const jsonText = jsonLdText;

/** Drop undefined members and empty arrays from an object, preserving insertion order (json-ld-services-section). */
export const compact = pruneEmpty;
