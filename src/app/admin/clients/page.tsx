import { redirect } from "next/navigation";

export default function ClientsIndex() {
  redirect("/admin/clients/database");
}
