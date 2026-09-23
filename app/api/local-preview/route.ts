import { readFile } from "node:fs/promises";
export async function GET() {
  if (process.env.NODE_ENV !== "development")
    return new Response(null, { status: 404 });
  return Response.json(
    JSON.parse(await readFile(process.cwd() + "/local-data/seed.json", "utf8")),
  );
}
