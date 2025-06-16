#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";

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

// Create MCP server
const server = new McpServer({
  name: "ragStore",
  version: "1.0.0",
});

// Add search tool
server.tool(
  "mcp__ragStore__search",
  {
    query: z.string().describe("Search query"),
    context: z.enum(["architecture", "implementation", "testing"]).optional().describe("Optional context filter"),
  },
  async ({ query, context }) => {
    await ensureStorageExists();
    const data = JSON.parse(await readFile(STORAGE_PATH, "utf-8"));
    const filtered = data.filter((item) =>
      item.content.toLowerCase().includes(query.toLowerCase()) &&
      (!context || item.type === context)
    );
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify(filtered.slice(0, 5), null, 2),
      }],
    };
  }
);

// Add upsert tool
server.tool(
  "mcp__ragStore__upsert",
  {
    content: z.string().describe("Content to store"),
    type: z.string().describe("Type of content"),
    metadata: z.record(z.any()).optional().describe("Additional metadata"),
  },
  async ({ content, type, metadata }) => {
    await ensureStorageExists();
    const data = JSON.parse(await readFile(STORAGE_PATH, "utf-8"));
    const item = {
      id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content,
      type,
      metadata: metadata || {},
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
);

// Add get context tool
server.tool(
  "mcp__ragStore__get_context",
  {
    scope: z.enum(["current", "historical", "decisions"]).describe("Scope of context to retrieve"),
  },
  async ({ scope }) => {
    await ensureStorageExists();
    const data = JSON.parse(await readFile(STORAGE_PATH, "utf-8"));
    const filtered = scope === "current"
      ? data.filter((item) => item.timestamp >= Date.now() - 24 * 60 * 60 * 1000)
      : scope === "decisions"
      ? data.filter((item) => item.type === "decision")
      : data;
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify(filtered.slice(-20), null, 2),
      }],
    };
  }
);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP RAG Server started (file-based storage)");
}

main().catch((error) => {
  console.error("Failed to start:", error);
  process.exit(1);
});