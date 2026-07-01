import { createServerClient } from "@/lib/supabase/server";
import { getSessionUser, isMasterAdmin } from "@/lib/auth";
import { listAdmins } from "@/server/admins";
import { AdminsPanel } from "@/components/settings/admins-panel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isShopifyConfigured } from "@/lib/shopify-config";
import { isMetaConfigured } from "@/lib/meta-config";
import { CurrencyForm } from "@/components/settings/currency-form";
import { ShopifyPanel } from "@/components/settings/shopify-panel";
import { MetaPanel } from "@/components/settings/meta-panel";

export default async function SettingsPage() {
  const supabase = await createServerClient();

  const { data: config } = await supabase
    .from("commission_config")
    .select("currency")
    .eq("id", 1)
    .maybeSingle();
  const currency = config?.currency ?? "USD";

  const { data: employees } = await supabase
    .from("employees")
    .select("id, name, shopify_staff_id")
    .eq("active", true)
    .order("name");

  const { data: locationRows } = await supabase
    .from("locations")
    .select("id, name")
    .eq("active", true)
    .order("name");
  const locations = (locationRows ?? []).map((l) => ({ id: l.id, name: l.name }));

  const master = isMasterAdmin(await getSessionUser());
  const admins = master ? await listAdmins() : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Business currency, admins, and integrations. Pay & rates live under
          Employees; goals & tiers under Sales &amp; Commission.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Currency</CardTitle>
          <CardDescription>
            Used across commission, sales, and pay displays.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CurrencyForm currency={currency} />
        </CardContent>
      </Card>

      {master && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Admins</CardTitle>
            <CardDescription>
              Invite store admins scoped to their location(s). You are the master
              admin with access to every store.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AdminsPanel admins={admins} locations={locations} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Shopify</CardTitle>
          <CardDescription>
            Sync monthly sales by POS staff member (feeds commission &amp; ranking).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ShopifyPanel configured={isShopifyConfigured()} employees={employees ?? []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Meta Ads</CardTitle>
          <CardDescription>
            Sync ad spend &amp; ROAS (shown on the Marketing page).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MetaPanel configured={isMetaConfigured()} />
        </CardContent>
      </Card>
    </div>
  );
}
