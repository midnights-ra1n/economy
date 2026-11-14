import { ORIGIN } from "@/lib/auth";
import { serverMetadata } from "@/lib/oauth";

/** RFC 8414: endpoints of the authorization server. */
export const GET = () => Response.json(serverMetadata(ORIGIN));
