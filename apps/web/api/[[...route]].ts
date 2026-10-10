import { handle } from "hono/vercel";
import { chiefOfStaffFromEnv, createApi } from "@freenotes/api";

/**
 * Vercel Function serving every /api/* route. The API key lives in Vercel project settings
 * (ANTHROPIC_API_KEY); without it the heuristic chief of staff answers.
 */
const app = createApi({ chiefOfStaff: chiefOfStaffFromEnv(process.env, (m) => console.warn(m)) });

export default handle(app);
