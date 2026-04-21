import { requireSignedInUser } from "../lib/jwt-auth.server";
import { callCoreHrmsApi } from "../lib/core-hrms-api.server";
import type { Route } from "./+types/hrms.notifications";

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  link: string | null;
  created_at: string;
}

// GET /hrms/notifications — returns notification list for the current user
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const currentUser = await requireSignedInUser(request, env);
  const data = await callCoreHrmsApi<{ notifications: NotificationRow[]; unreadCount: number }>({
    request, env, currentUser,
    path: "/api/notifications",
  });
  return data ?? { notifications: [], unreadCount: 0 };
}

// POST /hrms/notifications — mark-all-read | mark-one-read
export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const currentUser = await requireSignedInUser(request, env);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const id = formData.get("id") as string | null;

  if (intent === "mark-all-read") {
    await callCoreHrmsApi({
      request, env, currentUser,
      path: "/api/notifications/read-all",
      method: "PATCH",
    });
  } else if (intent === "mark-one-read" && id) {
    await callCoreHrmsApi({
      request, env, currentUser,
      path: `/api/notifications/${id}/read`,
      method: "PATCH",
    });
  }

  return { ok: true };
}
