// MCP RAG Server - Focused on context sharing, not agent coordination
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MilvusClient } from "@zilliz/milvus2-sdk-node";
import dotenv from "dotenv";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Initialize Milvus Lite for vector storage
const milvusClient = new MilvusClient({
  address: "localhost:19530",
  // Using Milvus Lite for local development
});

// Collection schema for project memory
const COLLECTION_NAME = "project_memory";
const EMBEDDING_DIM = 1536; // OpenAI embedding dimension

async function initializeMilvus() {
  try {
    // Check if collection exists
    const hasCollection = await milvusClient.hasCollection({
      collection_name: COLLECTION_NAME,
    });

    if (!hasCollection) {
      // Create collection for project memory
      await milvusClient.createCollection({
        collection_name: COLLECTION_NAME,
        fields: [
          {
            name: "id",
            data_type: "VarChar",
            is_primary_key: true,
            max_length: 128,
          },
          {
            name: "content",
            data_type: "VarChar",
            max_length: 65535,
          },
          {
            name: "type",
            data_type: "VarChar",
            max_length: 64,
          },
          {
            name: "metadata",
            data_type: "JSON",
          },
          {
            name: "embedding",
            data_type: "FloatVector",
            dim: EMBEDDING_DIM,
          },
          {
            name: "timestamp",
            data_type: "Int64",
          },
        ],
      });

      // Create index for vector search
      await milvusClient.createIndex({
        collection_name: COLLECTION_NAME,
        field_name: "embedding",
        index_type: "IVF_FLAT",
        metric_type: "L2",
        params: { nlist: 128 },
      });

      // Load collection
      await milvusClient.loadCollection({
        collection_name: COLLECTION_NAME,
      });
    }
  } catch (error) {
    console.error("Failed to initialize Milvus:", error);
    // Fallback to file-based storage if Milvus fails
  }
}

// Simplified embedding function (in production, use actual embeddings)
async function generateEmbedding(text: string): Promise<number[]> {
  // This is a placeholder - in production, use OpenAI embeddings or similar
  const hash = text.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const embedding = new Array(EMBEDDING_DIM).fill(0).map((_, i) => 
    Math.sin((hash + i) * 0.1) * 0.1
  );
  return embedding;
}

// Initialize MCP server
const server = new Server({
  name: "ragStore",
  version: "1.0.0",
});

// Tool: Search project memory for patterns/solutions
server.setRequestHandler({
  method: "tools/call",
  handler: async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "mcp__ragStore__search": {
        const { query, context } = args as { query: string; context?: string };
        
        try {
          const embedding = await generateEmbedding(query);
          
          // Search in Milvus
          const searchResults = await milvusClient.search({
            collection_name: COLLECTION_NAME,
            vectors: [embedding],
            filter: context ? `type == "${context}"` : undefined,
            limit: 5,
            output_fields: ["content", "type", "metadata", "timestamp"],
          });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(searchResults.results, null, 2),
              },
            ],
          };
        } catch (error) {
          // Fallback to file-based search
          const storePath = path.join(__dirname, "rag-store", "memory.json");
          if (existsSync(storePath)) {
            const data = JSON.parse(await readFile(storePath, "utf-8"));
            const filtered = data.filter((item: any) => 
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
          return {
            content: [
              {
                type: "text",
                text: "[]",
              },
            ],
          };
        }
      }

      case "mcp__ragStore__upsert": {
        const { content, type, metadata } = args as {
          content: string;
          type: string;
          metadata?: Record<string, any>;
        };

        try {
          const id = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const embedding = await generateEmbedding(content);
          const timestamp = Date.now();

          // Insert into Milvus
          await milvusClient.insert({
            collection_name: COLLECTION_NAME,
            data: [{
              id,
              content,
              type,
              metadata: metadata || {},
              embedding,
              timestamp,
            }],
          });

          // Also save to file as backup
          const storePath = path.join(__dirname, "rag-store");
          if (!existsSync(storePath)) {
            await mkdir(storePath, { recursive: true });
          }
          
          const filePath = path.join(storePath, "memory.json");
          let data = [];
          if (existsSync(filePath)) {
            data = JSON.parse(await readFile(filePath, "utf-8"));
          }
          
          data.push({ id, content, type, metadata, timestamp });
          await writeFile(filePath, JSON.stringify(data, null, 2));

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ success: true, id }),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ success: false, error: String(error) }),
              },
            ],
          };
        }
      }

      case "mcp__ragStore__get_context": {
        const { scope } = args as { scope: string };
        
        try {
          const filter = scope === "current" 
            ? `timestamp >= ${Date.now() - 24 * 60 * 60 * 1000}`
            : scope === "decisions"
            ? `type == "decision"`
            : undefined;

          const results = await milvusClient.query({
            collection_name: COLLECTION_NAME,
            filter,
            limit: 20,
            output_fields: ["content", "type", "metadata", "timestamp"],
          });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(results, null, 2),
              },
            ],
          };
        } catch (error) {
          // Fallback to file-based retrieval
          const storePath = path.join(__dirname, "rag-store", "memory.json");
          if (existsSync(storePath)) {
            const data = JSON.parse(await readFile(storePath, "utf-8"));
            const filtered = scope === "current"
              ? data.filter((item: any) => item.timestamp >= Date.now() - 24 * 60 * 60 * 1000)
              : scope === "decisions"
              ? data.filter((item: any) => item.type === "decision")
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
          return {
            content: [
              {
                type: "text",
                text: "[]",
              },
            ],
          };
        }
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
  await initializeMilvus();
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error("MCP RAG Server started successfully");
}

main().catch((error) => {
  console.error("Failed to start MCP RAG Server:", error);
  process.exit(1);
});