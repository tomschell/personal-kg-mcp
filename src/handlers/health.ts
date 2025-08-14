import type { ServerResult } from "../types/types.js";
import type { ServerStatus } from "../types/enums.js";

export function getHealth(): ServerResult<{
  status: ServerStatus;
  name: string;
}> {
  return {
    status: 200,
    result: { status: "ok", name: "personal-kg-mcp" },
  };
}
