import { redirect } from "next/navigation";
import { getSessionUser, roleOf } from "@/lib/auth";

export default async function Home() {
  const user = await getSessionUser();
  const role = roleOf(user);
  if (role === "admin") redirect("/admin/dashboard");
  if (role === "employee") redirect("/portal");
  if (role === "store") redirect("/store");
  redirect("/login");
}
