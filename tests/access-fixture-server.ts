/** Local UI verification only. No production credentials or network database.
 * Run: npx tsx tests/access-fixture-server.ts
 * Point the local dev server's public Supabase URL to http://127.0.0.1:54329.
 * Password for the fixture identities is always local-test-only.
 */
import { createServer } from "node:http";
import { accessDatabase, asUser, identities } from "./access-db";

async function main() {
  const db = await accessDatabase();
  let pending = Promise.resolve();
  createServer((request, response) => {
    pending = pending
      .then(async () => {
        response.setHeader(
          "Access-Control-Allow-Origin",
          "http://127.0.0.1:3017",
        );
        response.setHeader("Access-Control-Allow-Headers", "*");
        response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
        response.setHeader("Content-Type", "application/json");
        if (request.method === "OPTIONS") {
          response.end();
          return;
        }
        const url = new URL(request.url || "/", "http://127.0.0.1:54329");
        let raw = "";
        for await (const chunk of request) raw += chunk;
        const body = raw ? JSON.parse(raw) : {};
        let identity: (typeof identities)[keyof typeof identities] | undefined;
        const token = request.headers.authorization?.replace("Bearer ", "");
        if (token?.split(".").length === 3) {
          const payload = JSON.parse(
            Buffer.from(token.split(".")[1], "base64url").toString(),
          );
          identity = Object.values(identities).find(
            (item) => item.id === payload.sub,
          );
        }
        const authUser = (item: NonNullable<typeof identity>) => ({
          id: item.id,
          email: item.email,
          aud: "authenticated",
          role: "authenticated",
          app_metadata: { provider: "email" },
          user_metadata: {},
          created_at: new Date().toISOString(),
        });
        if (url.pathname === "/auth/v1/token") {
          identity = Object.values(identities).find(
            (item) => item.email === body.email,
          );
          if (!identity || body.password !== "local-test-only")
            throw new Error("Use a fixture email with local-test-only");
          const jwt = [
            Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),
            Buffer.from(
              JSON.stringify({
                sub: identity.id,
                email: identity.email,
                exp: Math.floor(Date.now() / 1000) + 3600,
              }),
            ).toString("base64url"),
            "local-fixture",
          ].join(".");
          response.end(
            JSON.stringify({
              access_token: jwt,
              refresh_token: "local-fixture",
              expires_in: 3600,
              token_type: "bearer",
              user: authUser(identity),
            }),
          );
          return;
        }
        if (url.pathname === "/auth/v1/logout") {
          response.end("{}");
          return;
        }
        if (!identity) {
          response.statusCode = 401;
          response.end('{"message":"Sign in to the fixture"}');
          return;
        }
        if (url.pathname === "/auth/v1/user") {
          response.end(JSON.stringify(authUser(identity)));
          return;
        }
        await asUser(db, identity);
        if (url.pathname === "/rest/v1/rpc/list_workspace_access") {
          const result = await db.query<{ list_workspace_access: unknown }>(
            "select public.list_workspace_access()",
          );
          response.end(JSON.stringify(result.rows[0].list_workspace_access));
          return;
        }
        if (url.pathname === "/rest/v1/rpc/save_workspace_access") {
          await db.query(
            "select public.save_workspace_access($1,$2,$3,$4,$5)",
            [
              body.p_email,
              body.p_display_name,
              body.p_role,
              body.p_active,
              body.p_expected_version,
            ],
          );
          response.end("null");
          return;
        }
        const table = url.pathname.replace("/rest/v1/", "");
        if (
          ![
            "workspace_members",
            "projects",
            "contractors",
            "catalogs",
            "vendors",
          ].includes(table)
        )
          throw new Error("Unsupported fixture endpoint");
        const result = await db.query(`select * from public.${table}`);
        response.setHeader(
          "Content-Range",
          `0-${Math.max(0, result.rows.length - 1)}/${result.rows.length}`,
        );
        response.end(JSON.stringify(result.rows));
      })
      .catch((error) => {
        response.statusCode = 400;
        response.end(JSON.stringify({ message: error.message }));
      });
  }).listen(54329, "127.0.0.1", () =>
    console.log("Isolated access fixture: http://127.0.0.1:54329"),
  );
}
void main();
