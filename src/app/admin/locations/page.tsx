import { createServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LocationFormSheet } from "@/components/location/location-form-sheet";
import { StoreAccountPanel } from "@/components/location/store-account-panel";
import { LocationsTable } from "@/components/admin/locations-table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function LocationsPage() {
  const supabase = await createServerClient();
  const { data: locations, error } = await supabase
    .from("locations")
    .select("*")
    .order("name");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
        <LocationsTable rows={locations} appUrl={appUrl} />
      )}

      {locations && locations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Store screens</CardTitle>
            <CardDescription>
              One shared login per store for the floor kiosk (the queue, PIN
              check-ins, close day). Employees keep their own portal accounts.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {locations
              .filter((l) => l.active)
              .map((l) => (
                <div key={l.id} className="flex flex-col gap-2">
                  <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                    {l.name}
                  </span>
                  <StoreAccountPanel locationId={l.id} />
                </div>
              ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
