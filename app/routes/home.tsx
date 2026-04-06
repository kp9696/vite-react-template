import { redirect } from "react-router";
import type { Route } from "./+types/home";

export function loader(_: Route.LoaderArgs) {
  return redirect("/hrms");
}

export default function Home() {
  return null;
}
