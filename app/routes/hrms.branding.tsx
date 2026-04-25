/**
 * Loader-only route for company branding data.
 * HRMSLayout fetches this via useFetcher to get companyName + companyLogoUrl
 * without duplicating the call across every route.
 */
import type { Route } from "./+types/hrms.branding";
import { requireSignedInUser } from "../lib/jwt-auth.server";
import { callCoreHrmsApi } from "../lib/core-hrms-api.server";

interface TenantSettingsPartial {
  companyName: string | null;
  companyLogoUrl: string | null;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  const res = await callCoreHrmsApi<{ settings: TenantSettingsPartial }>({
    request,
    env: context.cloudflare.env,
    currentUser,
    path: "/api/tenant/settings",
  });
  return {
    companyName: res?.settings?.companyName ?? null,
    companyLogoUrl: res?.settings?.companyLogoUrl ?? null,
  };
}
