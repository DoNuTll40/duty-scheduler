import { neon } from '@neondatabase/serverless';

let client;
/** Server-only. DATABASE_URL never reaches the browser (no NEXT_PUBLIC_ prefix, only imported from server code). */
export function sql() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  return (client ??= neon(process.env.DATABASE_URL));
}
