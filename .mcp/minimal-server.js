#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// File-based storage
const STORAGE_PATH = path.join(__dirname, "rag-store", "memory.json");

async function ensureStorageExists() {
  const dir = path.dirname(STORAGE_PATH);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  if (!existsSync(STORAGE_PATH)) {
    await writeFile(STORAGE_PATH, "[]");
  }
}

// Create server
const server = new Server(
  {
    name: "ragStore",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define tools
const tools = [
  {
    name: "mcp__ragStore__search",
    description: "Search project memory",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        context: { type: "string" },
      },
      required: ["query"],
    },
  },
  {
    name: "mcp__ragStore__upsert",
    description: "Store in project memory",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string" },
        type: { type: "string" },
        metadata: { type: "object" },
      },
      required: ["content", "type"],
    },
  },
  {
    name: "mcp__ragStore__get_context",
    description: "Get project context",
    inputSchema: {
      type: "object",
      properties: {
        scope: { type: "string" },
      },
      required: ["scope"],
    },
  },
];

// Handle list tools
server.setRequestHandler("tools/list", async () => ({
  tools,
}));

// Handle tool calls
server.setRequestHandler("tools/call", async (request) => {
  const { name, arguments: args } = request.params;

  await ensureStorageExists();

  if (name === "mcp__ragStore__search") {
    const data = JSON.parse(await readFile(STORAGE_PATH, "utf-8"));
    const filtered = data.filter((item) =>
      item.content.toLowerCase().includes(args.query.toLowerCase())
    );
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify(filtered.slice(0, 5), null, 2),
      }],
    };
  }

  if (name === "mcp__ragStore__upsert") {
    const data = JSON.parse(await readFile(STORAGE_PATH, "utf-8"));
    const item = {
      id: `${args.type}_${Date.now()}`,
      content: args.content,
      type: args.type,
      metadata: args.metadata || {},
      timestamp: Date.now(),
    };
    data.push(item);
    await writeFile(STORAGE_PATH, JSON.stringify(data, null, 2));
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ success: true, id: item.id }),
      }],
    };
  }

  if (name === "mcp__ragStore__get_context") {
    const data = JSON.parse(await readFile(STORAGE_PATH, "utf-8"));
    const filtered = args.scope === "current"
      ? data.filter((item) => item.timestamp >= Date.now() - 86400000)
      : data;
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify(filtered.slice(-20), null, 2),
      }],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP RAG Server running (file-based)");
}

main().catch(console.error);