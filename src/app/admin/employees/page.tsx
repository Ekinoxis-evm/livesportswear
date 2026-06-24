import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmployeeFormSheet } from "@/components/employee/employee-form-sheet";
import { EmployeeRowActions } from "@/components/employee/employee-actions";

const ROLE_LABELS: Record<string, string> = {
  sales_rep: "Sales rep",
  shift_lead: "Shift lead",
  store_manager: "Store manager",
};

export default async function EmployeesPage() {
  const supabase = await createServerClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  const { data: locationRows } = await supabase
    .from("locations")
    .select("id, name, active")
    .order("name");
  const activeLocations = (locationRows ?? [])
    .filter((l) => l.active)
    .map((l) => ({ id: l.id, name: l.name }));

  const { data: employees, error } = await supabase
    .from("employees")
    .select("*, location:locations(name)")
    .order("name");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Employees</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Staff and the rules that govern their schedules.
          </p>
        </div>
        <Link href="/admin/employees/new" className={buttonVariants()}>
          New employee
        </Link>
      </div>

      {activeLocations.length === 0 ? (
        <Alert>
          <AlertTitle>Add a location first</AlertTitle>
          <AlertDescription>
            Every employee belongs to a store. Create an active location before
            adding staff.
          </AlertDescription>
        </Alert>
      ) : error ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load employees</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : !employees || employees.length === 0 ? (
        <Alert>
          <AlertTitle>No employees yet</AlertTitle>
          <AlertDescription>Add your first team member.</AlertDescription>
        </Alert>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Rules</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map((emp) => (
              <TableRow key={emp.id} className={emp.active ? "" : "opacity-60"}>
                <TableCell className="font-medium">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="size-3 shrink-0 rounded-full border"
                      style={{
                        backgroundColor: emp.avatar_color ?? "transparent",
                      }}
                    />
                    <span className="flex flex-col">
                      <Link
                        href={`/admin/employees/${emp.id}`}
                        className="hover:underline"
                      >
                        {emp.name}
                      </Link>
                      <span className="text-muted-foreground text-xs">
                        {emp.email}
                      </span>
                    </span>
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {ROLE_LABELS[emp.role] ?? emp.role}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {emp.location?.name ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums text-xs">
                  {emp.weekly_hour_target}h · ≤{emp.max_days_per_week}d · ≥
                  {emp.weekly_days_off} off
                </TableCell>
                <TableCell>
                  <Badge variant={emp.active ? "default" : "secondary"}>
                    {emp.active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <EmployeeFormSheet
                      employee={emp}
                      locations={activeLocations}
                    >
                      <Button variant="ghost" size="sm">
                        Edit
                      </Button>
                    </EmployeeFormSheet>
                    <EmployeeRowActions
                      id={emp.id}
                      active={emp.active}
                      token={emp.magic_token}
                      appUrl={appUrl}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
