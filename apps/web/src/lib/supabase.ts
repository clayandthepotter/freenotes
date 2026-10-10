import { createBrowserClient } from "@freenotes/supabase";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** Undefined when the deployment has no Supabase project configured: the app then runs local-first only. */
export const supabase = url && publishableKey ? createBrowserClient({ url, publishableKey }) : undefined;

export const accountsAvailable = supabase !== undefined;
