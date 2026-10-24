#!/usr/bin/env node
import { encodeYaml } from "@red-cup-engineering/yaml-frontmatter-codec-service";
import { aiEntityName, careStatements, disclosureText, distinctLicenses, compact, orderedAuthors, orcidUrl, resolvePaper } from "./paper.mjs";
import { paperRequestSchema, projectionOutputSchema, runCommand } from "./face.mjs";

export const operationDefinition = {
  name: "projectCitationCff",
  description: "Projects a paper.yaml into a CITATION.cff 1.2.0 file: humans first with the accountable author leading, an AI system credited as a name: entity, the disclosure carried in message, byte-reproducible.",
  inputSchema: paperRequestSchema(),
  outputSchema: projectionOutputSchema,
};

const PREFERRED_TYPE = Object.freeze({ preprint: "report", article: "article", report: "report", book: "book", thesis: "thesis", conferencepaper: "conference-paper", other: "generic" });
const DEFAULT_MESSAGE = "If you use this work, please cite it using the metadata from this file.";

function cffPerson(entry) {
  if (entry.ai === true) return { name: aiEntityName(entry) };
  return compact({
    "family-names": entry.family,
    "given-names": entry.given,
    orcid: entry.orcid === undefined ? undefined : orcidUrl(entry.orcid),
    affiliation: entry.affiliation,
    email: entry.email,
  });
}

/** The CFF record, as a JSON value in the file's key order. */
export function cffRecord(paper) {
  const disclosure = disclosureText(paper);
  const message = [paper.message ?? DEFAULT_MESSAGE, disclosure === undefined ? undefined : `AI disclosure: ${disclosure}`].filter(Boolean).join(" ");
  const authors = orderedAuthors(paper).map(cffPerson);
  const licenses = distinctLicenses(paper);
  const care = careStatements(paper).map(([key, text]) => `CARE ${key}: ${text}`);
  const acknowledged = (paper.acknowledgements ?? []).map((entry) => `${entry.name} acknowledged${entry.role === undefined ? "" : ` for ${entry.role}`}.`);
  const notes = [
    paper.subtitle === undefined ? undefined : `Subtitle: ${paper.subtitle}.`,
    paper["peer-reviewed"] === true ? undefined : "Not peer reviewed.",
    paper.notes,
    ...acknowledged,
    paper.doi === undefined ? "No DOI assigned." : undefined,
    ...care,
  ].filter(Boolean).join(" ");
  const year = paper["date-released"] === undefined ? paper.year : Number(paper["date-released"].slice(0, 4));
  return compact({
    "cff-version": "1.2.0",
    message,
    title: paper.title,
    version: paper.version,
    "date-released": paper["date-released"],
    doi: paper.doi,
    abstract: paper.abstract.trim(),
    authors,
    keywords: paper.keywords,
    license: licenses.length === 1 ? licenses[0] : licenses,
    url: paper.url,
    "repository-code": paper["repository-code"],
    "preferred-citation": compact({
      type: PREFERRED_TYPE[paper["publication-type"] ?? "preprint"],
      authors,
      title: paper.title,
      year,
      institution: paper.publisher === undefined ? undefined : compact({ name: paper.publisher.name, website: paper.publisher.url }),
      version: paper.version,
      doi: paper.doi,
      notes: notes === "" ? undefined : notes,
    }),
  });
}

/**
 * Projects a paper.yaml into CITATION.cff 1.2.0 text.
 * @param {{paper?: object, paperYaml?: string}} body exactly one of the two.
 * @returns {{text: string, value: object}} the file's bytes and its JSON value.
 * @throws {TypeError} on a malformed request or inadmissible paper; {RangeError} when the accountability law is broken.
 */
export function projectCitationCff(body) {
  const paper = resolvePaper(body);
  const record = cffRecord(paper);
  // Dates are quoted so YAML 1.1 readers keep them strings, as the CFF schema requires.
  const text = encodeYaml(record).replace(/^(\s*(?:- )?date-released:) (\d{4}-\d{2}-\d{2})$/gmu, '$1 "$2"');
  return { text, value: record };
}

if (import.meta.main) await runCommand(operationDefinition, projectCitationCff);
