import { createServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TemplateFormSheet } from "@/components/template/template-form-sheet";
import { TemplatesTable } from "@/components/admin/templates-table";

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
      <div className="flex flex-wrap items-center justify-between gap-3">
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
        <TemplatesTable rows={templates} locations={activeLocations} />
      )}
    </div>
  );
}
