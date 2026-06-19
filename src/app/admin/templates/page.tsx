import { createServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
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
import { TemplateFormSheet } from "@/components/template/template-form-sheet";
import { TemplateActiveToggle } from "@/components/template/template-actions";

const hhmm = (t: string) => t.slice(0, 5);

export default async function TemplatesPage() {
  const supabase = await createServerClient();

  const { data: locationRows } = await supabase
    .from("locations")
    .select("id, name, active")
    .order("name");
  const activeLocations = (locationRows ?? [])
    .filter((l) => l.active)
    .map((l) => ({ id: l.id, name: l.name }));

  const { data: templates, error } = await supabase
    .from("shift_templates")
    .select("*, location:locations(name)")
    .order("name");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Shift templates
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Recurring shifts you assign on the schedule grid.
          </p>
        </div>
        {activeLocations.length > 0 && (
          <TemplateFormSheet locations={activeLocations}>
            <Button>New template</Button>
          </TemplateFormSheet>
        )}
      </div>

      {activeLocations.length === 0 ? (
        <Alert>
          <AlertTitle>Add a location first</AlertTitle>
          <AlertDescription>
            Templates belong to a store. Create an active location to start.
          </AlertDescription>
        </Alert>
      ) : error ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load templates</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : !templates || templates.length === 0 ? (
        <Alert>
          <AlertTitle>No templates yet</AlertTitle>
          <AlertDescription>
            Create shifts like &quot;Morning&quot; and &quot;Evening&quot;.
          </AlertDescription>
        </Alert>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Hours</TableHead>
              <TableHead>Headcount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map((tpl) => (
              <TableRow key={tpl.id} className={tpl.active ? "" : "opacity-60"}>
                <TableCell className="font-medium">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="size-3 shrink-0 rounded-full border"
                      style={{ backgroundColor: tpl.color ?? "transparent" }}
                    />
                    {tpl.name}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {tpl.location?.name ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums">
                  {hhmm(tpl.start_time)} – {hhmm(tpl.end_time)}
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums">
                  {tpl.default_headcount}
                </TableCell>
                <TableCell>
                  <Badge variant={tpl.active ? "default" : "secondary"}>
                    {tpl.active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <TemplateFormSheet
                      template={tpl}
                      locations={activeLocations}
                    >
                      <Button variant="ghost" size="sm">
                        Edit
                      </Button>
                    </TemplateFormSheet>
                    <TemplateActiveToggle id={tpl.id} active={tpl.active} />
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
