# @red-cup-engineering/research-release-metadata-service

<!-- 561-group-standards:badges:start -->
[![Red Cup Engineering](https://img.shields.io/badge/561%20Group-Red%20Cup%20Engineering-c0392b)](https://github.com/red-cup-engineering)
[![License: MIT](https://img.shields.io/badge/license-MIT-c0392b)](LICENSE)
[![Indigenous data: CARE](https://img.shields.io/badge/Indigenous%20data-CARE-4b6f44)](https://github.com/red-cup-engineering/.github/blob/main/GOVERNANCE.md)
[![Tips welcome](https://img.shields.io/badge/tips-welcome-d4a017)](https://github.com/561-group/.github/blob/main/TIPS.md)
<!-- 561-group-standards:badges:end -->

One `paper.yaml` is the single source of truth for a research release. This
service projects it, deterministically and byte-for-byte reproducibly, into

- `CITATION.cff` (Citation File Format 1.2.0, valid against the official schema; each `related-identifiers` entry is also an `identifiers` entry: scheme `swh`, `doi` and `url` keep their CFF type, every other scheme is `other`, the relation is the description, in the paper's order),
- `.zenodo.json` (Zenodo legacy deposit metadata),
- `codemeta.json` (codemeta 3.0 JSON-LD), and
- a schema.org `ScholarlyArticle` JSON-LD document,

and checks existing copies of those files for drift against it. Nothing here
reads a clock, a filesystem or a network; the release date is whatever
`paper.yaml` says, and absent until it says one.

Intended seat in the Group tree: `computer-documents-engineering-services-section/services/research-release-metadata-service`
(beside `research-paper-authoring-service` and `research-document-metadata-admission-service`).

## The AI-collaborator model

An AI system may be credited. It cannot hold accountability. `paper.yaml`
therefore refuses (`RangeError`) a record unless at least one author is a
human (`ai: false`) whose `role` names accountability (for example
`accountable-human-author`); refuses an AI entry whose role claims
accountability, that carries an ORCID or a personal name, or that lacks a
`disclosure`; and refuses any AI credit without the paper-level
`ai-disclosure.statement`. The projections then place the credit where each
format can say it honestly:

| File | Human accountable author | AI system |
| --- | --- | --- |
| `CITATION.cff` | first in `authors` (humans first, accountable human leading) | after the humans, as a `name:` entity labelled "(disclosed AI research collaborator)"; the disclosure and the accountable author are in `message` |
| `.zenodo.json` | `creators` (humans only) | `contributors`, type `Other`, affiliation stating it carries no accountability; disclosure in `notes` |
| `codemeta.json` | `author` | `contributor`, a `SoftwareApplication` (never a `Person`) whose `description` states it cannot accept accountability |
| ScholarlyArticle | `author` | `contributor` as above; `creditText` carries the disclosure |

`checkReleaseMetadataConsistency` additionally reports any existing file in
which an AI system leads the CFF authors or appears as a Zenodo creator or
JSON-LD author.

## paper.yaml

Defined by `schemas/paper.schema.json` (JSON Schema 2020-12, exported as
`@red-cup-engineering/research-release-metadata-service/paper.schema.json`).
Fields: `id`, `title`, `subtitle`, `version`, `date-released`, `year`,
`status` (`draft | release-candidate | released | withdrawn`),
`publication-type`, `peer-reviewed`, `abstract`, `keywords`, `subjects`,
`language`, `license {text, code, data, scope}`, `access-right`, `publisher`,
`authors [{given, family, orcid, affiliation, role, ai, disclosure, name}]`,
`contributors`, `acknowledgements`, `funding`, `repository-code`, `url`,
`doi`, `related-identifiers`, `artifacts` (path, sha256, bytes),
`limitations`, `message`, `notes`, `citation-count`, `care
{authority-to-control, responsibility, ethics, collective-benefit}` and
`ai-disclosure`. See `test/fixtures/white-repopulation.paper.yaml` for a full
example.

`admitPaper(paper)` (also the package root export) applies the schema, the
accountability law above, and
[`research-document-metadata-admission-service`](https://github.com/red-cup-engineering/research-document-metadata-admission-service)'s
`admitResearchDocumentMetadata` on the derived `{id, title, status, authors,
keywords, doi, license}` projection. Reused: that service's identifier rule
and status vocabulary (paper statuses map `draft->draft`,
`release-candidate->working`, `released->canonical`, `withdrawn->deprecated`).
Not reused: its relation, definition and citation fields, which `paper.yaml`
does not carry.

## Operations

Every operation takes `{ "paper": <object> }` or `{ "paperYaml": "<text>" }`
(exactly one; any other key is refused, except `files` for the consistency
check). Every operation is a pure function with effect class **pure**: no
filesystem, clock, network or randomness. Its refusals are thrown
`TypeError` (malformed request or paper) or `RangeError` (breaks the
accountability law); the command face renders them as
`{"ok":false,"refusal":{"reason":"<error name>","message":"..."}}` and exits 2.
Projections return `{ text, value }`: the file's exact bytes and the same
content as JSON. Preserved frame for all: the input `paper` is not mutated
(it is deep-cloned and frozen); nothing outside the return value changes.
Witness for all: same input, same bytes, checked by the byte-reproducibility
tests and the schema validation tests.

### projectCitationCff

~~~js
export function projectCitationCff({ paper, paperYaml }) // -> { text, value }
~~~

- Refusals: `TypeError` on a malformed request or inadmissible paper; `RangeError` when no human holds the accountable role, an AI entry claims accountability, or an AI credit lacks its disclosure.
- Precondition: the paper admits under `admitPaper`.
- Postcondition: `text` is CITATION.cff 1.2.0 that validates against the vendored official schema (`test/fixtures/cff-1.2.0.schema.json`); humans precede AI entities; `date-released` appears only if `paper.yaml` has one (dates are quoted); keys appear in fixed order; ends with one newline.
- Preserved frame: the paper; the declared licences, version and keywords are copied unchanged.
- Effect class: pure. Witness: official-schema validation and byte-identical double projection.

Command: `project-citation-cff` reads one JSON value per input line and writes one JSON value per output line.

### projectZenodoMetadata

~~~js
export function projectZenodoMetadata({ paper, paperYaml }) // -> { text, value }
~~~

- Refusals: as above.
- Precondition: the paper admits.
- Postcondition: `upload_type: publication`; `publication_type` from `publication-type` (default `preprint`); `creators` are the humans only ("Family, Given", ORCID without URL prefix); the AI system and `contributors` and acknowledged people are `contributors` with a Zenodo contributor type (`Other` by default); `license` is the lower-cased text SPDX id; `description` and `notes` are escaped HTML paragraphs; `related_identifiers`, `subjects`, `grants` (only for a declared `zenodo-grant-id`), `language` (ISO 639-3) and `doi` appear when declared; `repository-code` becomes an `isSupplementedBy` related identifier.
- Preserved frame / effect class / witness: as above.

Command: `project-zenodo-metadata` reads one JSON value per input line and writes one JSON value per output line.

### projectCodemeta

~~~js
export function projectCodemeta({ paper, paperYaml }) // -> { text, value }
~~~

- Refusals: as above.
- Precondition: the paper admits.
- Postcondition: `@context` is `https://w3id.org/codemeta/3.0`; `@type: SoftwareSourceCode` describes the release repository; SPDX licences become `https://spdx.org/licenses/<id>` URLs (all of text, code, data); `developmentStatus` is a repostatus URL; disclosure, CARE statements, evidence limits and licence scope are `additionalProperty` `PropertyValue`s.
- Preserved frame / effect class / witness: as above.

Command: `project-codemeta` reads one JSON value per input line and writes one JSON value per output line.

### projectScholarlyArticleJsonLd

~~~js
export function projectScholarlyArticleJsonLd({ paper, paperYaml }) // -> { text, value }
~~~

- Refusals: as above.
- Precondition: the paper admits.
- Postcondition: `@type: ScholarlyArticle`; `author` humans, `contributor` AI and acknowledged people; `creditText` disclosure plus licence scope; `license` URLs; `isBasedOn` from `isDerivedFrom`/`isSupplementTo`-type relations and the repository; `citation` from `cites`/`references` relations; `hasPart` `MediaObject`s with `sha256` for each artifact; `citation-count` (only if declared in `paper.yaml`, never fetched) and `peer-reviewed` as `additionalProperty` hooks.
- Preserved frame / effect class / witness: as above.

Command: `project-scholarly-article-json-ld` reads one JSON value per input line and writes one JSON value per output line.

### checkReleaseMetadataConsistency

~~~js
export function checkReleaseMetadataConsistency({ paper, paperYaml, files }) // -> { consistent, files, drift }
~~~

- `files` maps `CITATION.cff`, `.zenodo.json`, `codemeta.json`, `scholarly-article.jsonld` to their text, or to `null` for "absent".
- Refusals: `TypeError` for an unknown file name, empty `files`, a non-string value, or an inadmissible paper; `RangeError` for the accountability law.
- Precondition: the paper admits; each supplied text is a string.
- Postcondition: `drift` lists every leaf (JSON Pointer path) that is `missing` from, `different` in, or `unexpected` in an existing file relative to its projection, plus `file-missing`, `unparseable`, and the accountability findings `ai-leads-authors`, `ai-credited-as-creator`, `ai-credited-as-author`. `files[name].status` is `consistent | drift | missing | unparseable`, with `byteIdentical`. `consistent` is true iff `drift` is empty. Formatting-only differences are not drift.
- Preserved frame: nothing is written or repaired; the check only reads its input. Effect class: pure. Witness: freshly generated files are consistent; mutated files report exactly the mutated paths.

Command: `check-release-metadata-consistency` reads one JSON value per input line and writes one JSON value per output line.

~~~sh
echo '{"paperYaml":"...paper.yaml text..."}' | npx project-citation-cff
~~~

## Held market offers

`data/records/offers/<operation>.json` declares one x402 offer per operation
for the House markets (`x402-bazaar`, `402index`, `house-capability-market`,
`house-seller-catalog`), all `saleStatus: "held"` and sold by the
`engineering` enterprise. Prices: the four projections $0.005 each,
`check-release-metadata-consistency` $0.01. `test/fixtures/offer.schema.json`
is a vendored copy of the x402 package's `schemas/offer.schema.json` (source:
red-cup-engineering/x402-services-section, last changed at commit
`e9067ecc61616e86800ce40a190d3875fcc1b0b7`, checkout HEAD `34703ed`). Set
`X402_OFFER_MODULE=/path/to/x402-services-section/src/offer.mjs` to also run
the package's own `declareOffer` over each offer.

## Limitations

- CFF has no subtitle, funding, contributor or acknowledgement field; those appear in `preferred-citation.notes`. AI disclosure and CARE statements live in CFF `message` and `notes`, which are free text, not structured fields.
- Zenodo's legacy metadata has no AI-contributor concept: an AI system is a `contributor` of type `Other` with the caveat in the affiliation and `notes`. A prior hand-written file crediting an AI system as a Zenodo creator will therefore drift, by design.
- A credited AI system is a `SoftwareApplication` in JSON-LD, which is the most honest schema.org type available, not a purpose-built "AI collaborator" class.
- `language` maps to ISO 639-3 for Zenodo from a built-in table of common codes; unmapped two-letter codes are omitted from Zenodo.
- CARE statements are restated, never verified; they are neither a licence nor evidence of community authority.
- The consistency check compares arrays by position, so one inserted list item reports the following items as different.
- No file is written and no DOI is minted or fetched; `citation-count` is only echoed.

Tests validate the generated CITATION.cff against the vendored official CFF schema with the house `@red-cup-engineering/json-schema-services-section/validation` (no ajv). YAML is read and written by `@red-cup-engineering/yaml-frontmatter-codec-service` (`decodeYaml`, `encodeYaml`).
