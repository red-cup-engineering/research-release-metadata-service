#!/usr/bin/env node
import { careStatements, compact, disclosureText, jsonText, orderedAuthors, resolvePaper } from "./paper.mjs";
import { acknowledgementNodes, creditNode, fundingNodes, identifierOf, licenseUrls, personNode, publisherNode } from "./jsonld.mjs";
import { paperRequestSchema, projectionOutputSchema, runCommand } from "./face.mjs";

export const operationDefinition = {
  name: "projectScholarlyArticleJsonLd",
  description: "Projects a paper.yaml into a schema.org ScholarlyArticle JSON-LD document: author, license, isBasedOn, citation and citation-count hooks, AI systems as disclosed non-person contributors with creditText, byte-reproducible.",
  inputSchema: paperRequestSchema(),
  outputSchema: projectionOutputSchema,
};
export const operation = operationDefinition;

const CREATIVE_WORK_STATUS = Object.freeze({ draft: "Draft", "release-candidate": "Draft", released: "Published", withdrawn: "Withdrawn" });
const ENCODING = Object.freeze({ pdf: "application/pdf", png: "image/png", md: "text/markdown", csv: "text/csv", json: "application/json", txt: "text/plain", html: "text/html", svg: "image/svg+xml", jpg: "image/jpeg", jpeg: "image/jpeg" });
const BY_RELATION = Object.freeze({
  isSupplementTo: "isBasedOn", isDerivedFrom: "isBasedOn", isCompiledBy: "isBasedOn", requires: "isBasedOn",
  cites: "citation", references: "citation",
  isPartOf: "isPartOf", hasPart: "hasPart",
  isIdenticalTo: "sameAs", isAlternateIdentifier: "sameAs", isVersionOf: "sameAs", isVariantFormOf: "sameAs",
  isNewVersionOf: "isBasedOn",
});

const asUrl = (identifier, scheme) => (/^https?:\/\//u.test(identifier) ? identifier : scheme === "doi" || /^10\./u.test(identifier) ? `https://doi.org/${identifier}` : identifier);

/** The ScholarlyArticle record, as a JSON value in the file's key order. */
export function scholarlyArticleRecord(paper) {
  const humans = orderedAuthors(paper).filter((author) => author.ai === false);
  const contributors = [
    ...paper.authors.filter((author) => author.ai === true).map(creditNode),
    ...(paper.contributors ?? []).map(creditNode),
    ...acknowledgementNodes(paper),
  ];
  const buckets = { isBasedOn: [], citation: [], isPartOf: [], hasPart: [], sameAs: [] };
  for (const entry of paper["related-identifiers"] ?? []) {
    const property = BY_RELATION[entry.relation];
    if (property !== undefined) buckets[property].push(asUrl(entry.identifier, entry.scheme));
  }
  const artifacts = (paper.artifacts ?? []).map((artifact) => compact({
    "@type": "MediaObject",
    name: artifact.path,
    contentUrl: artifact.path,
    contentSize: artifact.bytes === undefined ? undefined : String(artifact.bytes),
    encodingFormat: ENCODING[artifact.path.split(".").pop().toLowerCase()],
    sha256: artifact.sha256,
  }));
  const disclosure = disclosureText(paper);
  const credit = [disclosure, paper.license.scope === undefined ? undefined : `Licence scope: ${paper.license.scope}`].filter(Boolean).join(" ");
  const properties = [
    ...careStatements(paper).map(([key, text]) => ({ "@type": "PropertyValue", name: `care-${key}`, value: text })),
    ...(paper.limitations ?? []).map((text) => ({ "@type": "PropertyValue", name: "evidence-limit", value: text })),
    ...(paper["citation-count"] === undefined ? [] : [{
      "@type": "PropertyValue",
      name: "citation-count",
      value: paper["citation-count"].value,
      description: `Observed ${paper["citation-count"]["observed-on"]} from ${paper["citation-count"].source}`,
    }]),
    { "@type": "PropertyValue", name: "peer-reviewed", value: paper["peer-reviewed"] === true },
  ];
  return compact({
    "@context": "https://schema.org",
    "@type": "ScholarlyArticle",
    "@id": identifierOf(paper),
    headline: paper.title,
    name: paper.title,
    alternativeHeadline: paper.subtitle,
    description: paper.abstract.trim(),
    abstract: paper.abstract.trim(),
    version: paper.version,
    datePublished: paper["date-released"],
    creativeWorkStatus: CREATIVE_WORK_STATUS[paper.status],
    genre: paper["publication-type"] ?? "preprint",
    author: humans.map(personNode),
    contributor: contributors,
    creditText: credit === "" ? undefined : credit,
    publisher: publisherNode(paper),
    ...fundingNodes(paper),
    license: licenseUrls(paper),
    isAccessibleForFree: (paper["access-right"] ?? "open") === "open" ? true : undefined,
    inLanguage: paper.language,
    keywords: paper.keywords,
    about: (paper.subjects ?? []).map((subject) => compact({ "@type": "DefinedTerm", name: subject.term, termCode: subject.identifier, inDefinedTermSet: subject.scheme })),
    identifier: paper.doi === undefined ? undefined : { "@type": "PropertyValue", propertyID: "doi", value: paper.doi },
    url: paper.url,
    sameAs: buckets.sameAs,
    isBasedOn: [...buckets.isBasedOn, ...(paper["repository-code"] === undefined ? [] : [paper["repository-code"]])],
    isPartOf: buckets.isPartOf,
    hasPart: [...buckets.hasPart, ...artifacts],
    citation: buckets.citation,
    additionalProperty: properties,
  });
}

/**
 * Projects a paper.yaml into schema.org ScholarlyArticle JSON-LD text.
 * @param {{paper?: object, paperYaml?: string}} body exactly one of the two.
 * @returns {{text: string, value: object}} the file's bytes and its JSON value.
 * @throws {TypeError} on a malformed request or inadmissible paper; {RangeError} when the accountability law is broken.
 */
export function projectScholarlyArticleJsonLd(body) {
  const record = scholarlyArticleRecord(resolvePaper(body));
  return { text: jsonText(record), value: record };
}

if (import.meta.main) await runCommand(operationDefinition, projectScholarlyArticleJsonLd);
