#!/usr/bin/env node
// MCP RAG Server - Simple file-based implementation
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

// Initialize MCP server
const server = new Server({
  name: "ragStore",
  version: "1.0.0",
}, {
  capabilities: {
    tools: {},
  },
});

// Handle tool calls
server.setRequestHandler({
  method: "tools/call",
  handler: async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "mcp__ragStore__search": {
        const { query, context } = args;
        
        await ensureStorageExists();
        const data = JSON.parse(await readFile(STORAGE_PATH, "utf-8"));
        const filtered = data.filter((item) => 
          item.content.toLowerCase().includes(query.toLowerCase()) &&
          (!context || item.type === context)
        );
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(filtered.slice(0, 5), null, 2),
            },
          ],
        };
      }

      case "mcp__ragStore__upsert": {
        const { content, type, metadata } = args;
        
        await ensureStorageExists();
        const id = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const timestamp = Date.now();
        
        const data = JSON.parse(await readFile(STORAGE_PATH, "utf-8"));
        data.push({ id, content, type, metadata: metadata || {}, timestamp });
        await writeFile(STORAGE_PATH, JSON.stringify(data, null, 2));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, id }),
            },
          ],
        };
      }

      case "mcp__ragStore__get_context": {
        const { scope } = args;
        
        await ensureStorageExists();
        const data = JSON.parse(await readFile(STORAGE_PATH, "utf-8"));
        const filtered = scope === "current"
          ? data.filter((item) => item.timestamp >= Date.now() - 24 * 60 * 60 * 1000)
          : scope === "decisions"
          ? data.filter((item) => item.type === "decision")
          : data;
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(filtered.slice(-20), null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  },
});

// List available tools
server.setRequestHandler({
  method: "tools/list",
  handler: async () => {
    return {
      tools: [
        {
          name: "mcp__ragStore__search",
          description: "Search project memory for patterns/solutions",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", description: "Search query" },
              context: { 
                type: "string", 
                enum: ["architecture", "implementation", "testing"],
                description: "Optional context filter"
              },
            },
            required: ["query"],
          },
        },
        {
          name: "mcp__ragStore__upsert",
          description: "Store learning or decision in project memory",
          inputSchema: {
            type: "object",
            properties: {
              content: { type: "string", description: "Content to store" },
              type: { type: "string", description: "Type of content" },
              metadata: { type: "object", description: "Additional metadata" },
            },
            required: ["content", "type"],
          },
        },
        {
          name: "mcp__ragStore__get_context",
          description: "Get full project context",
          inputSchema: {
            type: "object",
            properties: {
              scope: { 
                type: "string", 
                enum: ["current", "historical", "decisions"],
                description: "Scope of context to retrieve"
              },
            },
            required: ["scope"],
          },
        },
      ],
    };
  },
});

// Start server
async function main() {
  await ensureStorageExists();
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error("MCP RAG Server started successfully (file-based storage)");
}

main().catch((error) => {
  console.error("Failed to start MCP RAG Server:", error);
  process.exit(1);
});