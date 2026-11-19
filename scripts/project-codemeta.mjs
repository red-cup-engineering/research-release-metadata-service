#!/usr/bin/env node
import { aiEntries, careStatements, compact, disclosureText, jsonText, orderedAuthors, resolvePaper } from "./paper.mjs";
import { acknowledgementNodes, creditNode, fundingNodes, identifierOf, licenseUrls, personNode, publisherNode } from "./jsonld.mjs";
import { paperRequestSchema, projectionOutputSchema, runCommand } from "./face.mjs";

export const operationDefinition = {
  name: "projectCodemeta",
  description: "Projects a paper.yaml into codemeta.json (codemeta 3.0 JSON-LD) describing the release repository: human authors, AI systems as disclosed non-person contributors, byte-reproducible.",
  inputSchema: paperRequestSchema(),
  outputSchema: projectionOutputSchema,
};
export const operation = operationDefinition;

const DEVELOPMENT_STATUS = Object.freeze({
  draft: "https://www.repostatus.org/#wip",
  "release-candidate": "https://www.repostatus.org/#active",
  released: "https://www.repostatus.org/#active",
  withdrawn: "https://www.repostatus.org/#unsupported",
});

/** The codemeta record, as a JSON value in the file's key order. */
export function codemetaRecord(paper) {
  const authors = orderedAuthors(paper).filter((author) => author.ai === false);
  const contributors = [
    ...paper.authors.filter((author) => author.ai === true).map(creditNode),
    ...(paper.contributors ?? []).map(creditNode),
    ...acknowledgementNodes(paper),
  ];
  const disclosure = disclosureText(paper);
  const properties = [
    ...(disclosure === undefined ? [] : [{ "@type": "PropertyValue", name: "ai-disclosure", value: disclosure }]),
    ...careStatements(paper).map(([key, text]) => ({ "@type": "PropertyValue", name: `care-${key}`, value: text })),
    ...(paper.limitations ?? []).map((text) => ({ "@type": "PropertyValue", name: "evidence-limit", value: text })),
    ...(paper.license.scope === undefined ? [] : [{ "@type": "PropertyValue", name: "license-scope", value: paper.license.scope }]),
    ...(aiEntries(paper).length > 0 ? [{ "@type": "PropertyValue", name: "accountable-author", value: authors.filter((a) => /accountab/iu.test(a.role)).map((a) => `${a.given} ${a.family}`).join("; ") }] : []),
  ];
  const related = (paper["related-identifiers"] ?? []).map((entry) => entry.identifier);
  return compact({
    "@context": "https://w3id.org/codemeta/3.0",
    "@type": "SoftwareSourceCode",
    "@id": identifierOf(paper),
    name: paper.title,
    alternativeHeadline: paper.subtitle,
    description: paper.abstract.trim(),
    version: paper.version,
    datePublished: paper["date-released"],
    codeRepository: paper["repository-code"],
    url: paper.url,
    identifier: identifierOf(paper),
    license: licenseUrls(paper),
    author: authors.map(personNode),
    contributor: contributors,
    publisher: publisherNode(paper),
    keywords: paper.keywords,
    inLanguage: paper.language,
    developmentStatus: DEVELOPMENT_STATUS[paper.status],
    isAccessibleForFree: (paper["access-right"] ?? "open") === "open" ? true : undefined,
    ...fundingNodes(paper),
    relatedLink: related,
    additionalProperty: properties,
  });
}

/**
 * Projects a paper.yaml into codemeta.json text.
 * @param {{paper?: object, paperYaml?: string}} body exactly one of the two.
 * @returns {{text: string, value: object}} the file's bytes and its JSON value.
 * @throws {TypeError} on a malformed request or inadmissible paper; {RangeError} when the accountability law is broken.
 */
export function projectCodemeta(body) {
  const record = codemetaRecord(resolvePaper(body));
  return { text: jsonText(record), value: record };
}

if (import.meta.main) await runCommand(operationDefinition, projectCodemeta);
