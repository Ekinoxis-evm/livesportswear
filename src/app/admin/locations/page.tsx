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
import { LocationFormSheet } from "@/components/location/location-form-sheet";
import { LocationActiveToggle } from "@/components/location/location-actions";

export default async function LocationsPage() {
  const supabase = await createServerClient();
  const { data: locations, error } = await supabase
    .from("locations")
    .select("*")
    .order("name");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Locations</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Stores you build weekly schedules for.
          </p>
        </div>
        <LocationFormSheet>
          <Button>New location</Button>
        </LocationFormSheet>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load locations</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : !locations || locations.length === 0 ? (
        <Alert>
          <AlertTitle>No locations yet</AlertTitle>
          <AlertDescription>
            Create your first store to start scheduling.
          </AlertDescription>
        </Alert>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Timezone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {locations.map((loc) => (
              <TableRow key={loc.id} className={loc.active ? "" : "opacity-60"}>
                <TableCell className="font-medium">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="size-3 shrink-0 rounded-full border"
                      style={{
                        backgroundColor: loc.color ?? "transparent",
                      }}
                    />
                    {loc.name}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground font-mono text-xs">
                  {loc.slug}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {loc.timezone}
                </TableCell>
                <TableCell>
                  <Badge variant={loc.active ? "default" : "secondary"}>
                    {loc.active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <LocationFormSheet location={loc}>
                      <Button variant="ghost" size="sm">
                        Edit
                      </Button>
                    </LocationFormSheet>
                    <LocationActiveToggle id={loc.id} active={loc.active} />
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
