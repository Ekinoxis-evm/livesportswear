import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { EmployeeWizard } from "@/components/employee/employee-wizard";

export default async function NewEmployeePage() {
  const supabase = await createServerClient();
  const { data: locations } = await supabase
    .from("locations")
    .select("id, name")
    .eq("active", true)
    .order("name");
  const active = locations ?? [];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <Link
          href="/admin/employees"
          className="text-muted-foreground text-sm hover:underline"
        >
          ← Employees
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          New employee
        </h1>
      </div>

      {active.length === 0 ? (
        <Alert>
          <AlertTitle>Add a location first</AlertTitle>
          <AlertDescription>
            Create an active location before adding employees.
          </AlertDescription>
        </Alert>
      ) : (
        <EmployeeWizard locations={active} />
      )}
    </div>
  );
}
