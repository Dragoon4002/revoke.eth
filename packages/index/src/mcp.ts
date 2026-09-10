import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { checkCapabilityTool, getProvenanceTool, queryDelegation } from "./index.js";

const server = new McpServer({
  name: "revoke-index",
  version: "0.1.0",
});

server.tool(
  "check_capability",
  "Check whether a named agent has a valid capability for a given service.",
  {
    agentName: z.string().describe("Agent ENS name, e.g. myagent.eth"),
    capability: z.string().describe("Capability identifier (serviceId pre-image)"),
  },
  async ({ agentName, capability }) => {
    const result = await checkCapabilityTool(agentName, capability);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "get_delegation_tree",
  "Fetch delegation lineage for a parent agent.",
  {
    parentName: z.string().describe("Root agent name"),
  },
  async ({ parentName }) => {
    const result = await queryDelegation(parentName);
    const tree = { root: result, children: [], capabilities: result.capabilities };
    return { content: [{ type: "text", text: JSON.stringify(tree, null, 2) }] };
  },
);

server.tool(
  "get_provenance",
  "Check health and sync status of the indexing layer.",
  {},
  async () => {
    const health = await getProvenanceTool();
    return { content: [{ type: "text", text: JSON.stringify(health, null, 2) }] };
  },
);

// Run as stdio MCP server
const transport = new StdioServerTransport();
await server.connect(transport);
