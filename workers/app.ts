import { createRequestHandler } from "react-router";
import { sendInviteEmail } from "../app/lib/invite-email.server";
import { createOrUpdateInvitedUser } from "../app/lib/hrms.server";

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname === "/api/send-invite" && request.method === "POST") {
      try {
        const body = await request.json() as {
          name?: string;
          email?: string;
          role?: string;
          department?: string;
          dept?: string;
        };

        const payload = {
          name: body.name?.trim() || "",
          email: body.email?.trim() || "",
          role: body.role?.trim() || "Employee",
          department: body.department?.trim() || body.dept?.trim() || "Engineering",
        };

        if (!payload.name || !payload.email) {
          return Response.json(
            { success: false, error: "Name and email are required." },
            { status: 400, headers: corsHeaders },
          );
        }

        const user = await createOrUpdateInvitedUser(env.HRMS, payload);
        const mailResult = await sendInviteEmail(env, env.HRMS, user.id, payload, request.url);

        return Response.json(
          {
            success: mailResult.delivered,
            message: mailResult.message,
            user,
          },
          { headers: corsHeaders },
        );
      } catch (error) {
        return Response.json(
          { success: false, error: error instanceof Error ? error.message : "Unknown error" },
          { status: 500, headers: corsHeaders },
        );
      }
    }

    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
  },
} satisfies ExportedHandler<Env>;
