// The command face shared by every operation script. Loaded only when a script is run
// as a command, so the pure operation modules stay free of the Node runtime.

export const paperRequestSchema = (extraProperties = {}) => ({
  type: "object",
  additionalProperties: false,
  properties: {
    paper: { type: "object", description: "paper.yaml decoded as a JSON object." },
    paperYaml: { type: "string", description: "paper.yaml source text." },
    ...extraProperties,
  },
});

export const projectionOutputSchema = {
  type: "object",
  required: ["text", "value"],
  additionalProperties: false,
  properties: {
    text: { type: "string", description: "The file's exact bytes as UTF-8 text." },
    value: { description: "The same content as a JSON value." },
  },
};

/** Run one operation as an NDJSON command: one JSON value per input line, one per output line. */
export async function runCommand(operationDefinition, operation) {
  const { runJavascriptNodeOperation } = await import("@red-cup-engineering/javascript-node-services-section/operation");
  process.exitCode = (await runJavascriptNodeOperation(
    { ...operationDefinition, operation },
    { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout },
  )).exitCode;
}
