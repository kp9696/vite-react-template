import { redirect } from "react-router";
import type { Route } from "./+types/home";
import { requireSignedInUser } from "../lib/jwt-auth.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  try {
    await requireSignedInUser(request, context.cloudflare.env);
    // Valid session — send straight to the app
    return redirect("/hrms");
  } catch {
    // No session or expired — go to login
    return redirect("/login");
  }
}

export default function Home() {
  return null;
}

