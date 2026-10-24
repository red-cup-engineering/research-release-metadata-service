// Shared JSON-LD building blocks for the codemeta and schema.org projections.
import { NO_ACCOUNTABILITY, compact, distinctLicenses, doiUrl, orcidUrl, spdxUrl } from "./paper.mjs";

/** A human as a schema.org Person. */
export function personNode(entry) {
  const name = entry.family === undefined ? entry.name : `${entry.given} ${entry.family}`;
  return compact({
    "@type": "Person",
    "@id": entry.orcid === undefined ? undefined : orcidUrl(entry.orcid),
    givenName: entry.given,
    familyName: entry.family,
    name,
    email: entry.email,
    affiliation: entry.affiliation === undefined ? undefined : { "@type": "Organization", name: entry.affiliation },
    jobTitle: entry.role,
  });
}

/** An AI system as a credited non-person: a SoftwareApplication whose description carries the disclosure and the absence of accountability. */
export function aiNode(entry) {
  return {
    "@type": "SoftwareApplication",
    name: entry.name,
    description: `AI system credited as a collaborator (${entry.role}). ${entry.disclosure.trim()} ${NO_ACCOUNTABILITY}`,
  };
}

export const creditNode = (entry) => (entry.ai === true ? aiNode(entry) : personNode(entry));

export const licenseUrls = (paper) => distinctLicenses(paper).map(spdxUrl);

export function fundingNodes(paper) {
  const funding = paper.funding ?? [];
  return {
    funding: funding.length === 0 ? undefined : funding.map((entry) => `${entry.funder}${entry.award === undefined ? "" : ` (${entry.award})`}`).join("; "),
    funder: funding.length === 0 ? undefined : funding.map((entry) => compact({ "@type": "Organization", name: entry.funder, url: entry.url })),
  };
}

export const identifierOf = (paper) => (paper.doi === undefined ? undefined : doiUrl(paper.doi));

export const publisherNode = (paper) => (paper.publisher === undefined ? undefined : compact({ "@type": "Organization", name: paper.publisher.name, url: paper.publisher.url }));

/** Acknowledged people as non-author contributors. */
export const acknowledgementNodes = (paper) => (paper.acknowledgements ?? []).map((entry) => compact({
  "@type": "Person",
  name: entry.name,
  description: entry.role === undefined ? "Acknowledged." : `Acknowledged for ${entry.role}.`,
}));
