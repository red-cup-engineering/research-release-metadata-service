#!/usr/bin/env node
import { careStatements, compact, disclosureText, jsonText, orderedAuthors, resolvePaper } from "./paper.mjs";
import { paperRequestSchema, projectionOutputSchema, runCommand } from "./face.mjs";

export const operationDefinition = {
  name: "projectZenodoMetadata",
  description: "Projects a paper.yaml into .zenodo.json (Zenodo legacy deposit metadata): human creators only, any AI system a contributor of type Other with the disclosure in notes, byte-reproducible.",
  inputSchema: paperRequestSchema(),
  outputSchema: projectionOutputSchema,
};
export const operation = operationDefinition;

const PUBLICATION_TYPE = Object.freeze({ preprint: "preprint", article: "article", report: "report", book: "book", thesis: "thesis", conferencepaper: "conferencepaper", other: "other" });
const LANGUAGE_3 = Object.freeze({
  en: "eng", fr: "fra", es: "spa", de: "deu", pt: "por", it: "ita", nl: "nld", ru: "rus", zh: "zho", ja: "jpn", ko: "kor", ar: "ara", hi: "hin", la: "lat",
  mi: "mri", oj: "oji", cr: "cre", nv: "nav", iu: "iku", ik: "ipk", sv: "swe", pl: "pol", tr: "tur",
});
export const AI_AFFILIATION = "disclosed AI research collaborator (credited contributor; carries no accountability)";

const escapeHtml = (text) => text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
const paragraph = (text) => `<p>${escapeHtml(text.trim())}</p>`;

function zenodoName(entry) {
  if (entry.ai === true) return entry.name;
  return entry.family === undefined ? entry.name : `${entry.family}, ${entry.given}`;
}

function languageCode(language) {
  if (language === undefined) return undefined;
  const primary = language.split("-")[0];
  return primary.length === 3 ? primary : LANGUAGE_3[primary];
}

/** The .zenodo.json record, as a JSON value in the file's key order. */
export function zenodoRecord(paper) {
  const creators = orderedAuthors(paper).filter((author) => author.ai === false).map((author) => compact({
    name: zenodoName(author),
    affiliation: author.affiliation,
    orcid: author.orcid === undefined ? undefined : author.orcid.replace(/^https:\/\/orcid\.org\//u, ""),
  }));
  const credited = [
    ...paper.authors.filter((author) => author.ai === true).map((entry) => ({ entry, type: "Other" })),
    ...(paper.contributors ?? []).map((entry) => ({ entry, type: entry["zenodo-type"] ?? "Other" })),
  ];
  const contributors = credited.map(({ entry, type }) => compact({
    name: zenodoName(entry),
    type,
    affiliation: entry.ai === true ? AI_AFFILIATION : entry.affiliation,
    orcid: entry.orcid === undefined ? undefined : entry.orcid.replace(/^https:\/\/orcid\.org\//u, ""),
  }));
  for (const acknowledged of paper.acknowledgements ?? []) {
    contributors.push({ name: acknowledged.name, type: "Other" });
  }
  const disclosure = disclosureText(paper);
  const description = [
    paper.subtitle === undefined ? undefined : paragraph(paper.subtitle),
    paragraph(paper.abstract),
    ...(paper.limitations ?? []).length === 0 ? [] : [paragraph(`Evidence limits: ${paper.limitations.join("; ")}`)],
  ].filter(Boolean).join("\n");
  const notes = [
    paper["peer-reviewed"] === true ? undefined : paragraph("Not peer reviewed."),
    paper.notes === undefined ? undefined : paragraph(paper.notes),
    disclosure === undefined ? undefined : paragraph(`AI disclosure: ${disclosure}`),
    ...(paper.license.scope === undefined ? [] : [paragraph(`Licence scope: ${paper.license.scope}`)]),
    ...careStatements(paper).map(([key, text]) => paragraph(`CARE ${key}: ${text}`)),
  ].filter(Boolean).join("\n");
  const related = (paper["related-identifiers"] ?? []).map((entry) => compact({
    identifier: entry.identifier,
    relation: entry.relation,
    resource_type: entry["resource-type"],
    scheme: entry.scheme,
  }));
  if (paper["repository-code"] !== undefined && !related.some((entry) => entry.identifier === paper["repository-code"])) {
    related.push({ identifier: paper["repository-code"], relation: "isSupplementedBy", scheme: "url" });
  }
  const grants = (paper.funding ?? []).filter((entry) => entry["zenodo-grant-id"] !== undefined).map((entry) => ({ id: entry["zenodo-grant-id"] }));
  return compact({
    upload_type: "publication",
    publication_type: PUBLICATION_TYPE[paper["publication-type"] ?? "preprint"],
    title: paper.title,
    publication_date: paper["date-released"],
    description,
    creators,
    contributors,
    keywords: paper.keywords,
    subjects: (paper.subjects ?? []).map((subject) => compact({ term: subject.term, identifier: subject.identifier, scheme: subject.scheme })),
    license: paper.license.text.toLowerCase(),
    access_right: paper["access-right"] ?? "open",
    version: paper.version,
    doi: paper.doi,
    language: languageCode(paper.language),
    imprint_publisher: paper.publisher?.name,
    related_identifiers: related,
    grants,
    notes: notes === "" ? undefined : notes,
  });
}

/**
 * Projects a paper.yaml into .zenodo.json text.
 * @param {{paper?: object, paperYaml?: string}} body exactly one of the two.
 * @returns {{text: string, value: object}} the file's bytes and its JSON value.
 * @throws {TypeError} on a malformed request or inadmissible paper; {RangeError} when the accountability law is broken.
 */
export function projectZenodoMetadata(body) {
  const record = zenodoRecord(resolvePaper(body));
  return { text: jsonText(record), value: record };
}

if (import.meta.main) await runCommand(operationDefinition, projectZenodoMetadata);
