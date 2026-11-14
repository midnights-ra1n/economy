import { ORIGIN } from "@/lib/auth";
import { resourceMetadata } from "@/lib/oauth";

/** RFC 9728: tells MCP clients which authorization server issues tokens for /mcp. */
export const GET = () => Response.json(resourceMetadata(ORIGIN));
