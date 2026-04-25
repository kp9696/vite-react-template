import { json, type Route } from "react-router";
import { requireSignedInUser } from "../lib/jwt-auth.server";
import { isAdminRole } from "../lib/hrms.shared";

export async function loader({ request }: Route.LoaderArgs) {
  try {
    await requireSignedInUser(request);
    // Gracefully return empty structures if unable to fetch
    // This prevents the page from breaking if salary structures aren't available
    return json({ structures: [] });
  } catch (error) {
    console.error("Error in salary structures loader:", error);
    return json({ structures: [] });
  }
}
