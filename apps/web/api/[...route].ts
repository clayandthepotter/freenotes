import { chiefOfStaffFromEnv, createApi } from "@freenotes/api";

/**
 * Vercel Function serving every /api/* route (catch-all). Vercel's Node runtime calls the
 * named HTTP-method exports with a Web `Request` and expects a Web `Response` back.
 * The API key lives in Vercel project settings (ANTHROPIC_API_KEY); without it the
 * heuristic chief of staff answers.
 */
const app = createApi({ chiefOfStaff: chiefOfStaffFromEnv(process.env, (m) => console.warn(m)) });

const handler = (request: Request): Promise<Response> => Promise.resolve(app.fetch(request));

export const GET = handler;
export const POST = handler;
export const OPTIONS = handler;
