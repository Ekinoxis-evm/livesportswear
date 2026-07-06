import Link from "next/link";
import { requireEmployee } from "@/lib/auth";
import { QrScanner } from "@/components/portal/qr-scanner";

export default async function ScanPage() {
  await requireEmployee();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/portal/today" className="text-muted-foreground text-sm hover:underline">
          ← Today
        </Link>
        <h1 className="mt-1 text-xl font-bold">Validate a coworker</h1>
        <p className="text-muted-foreground text-sm">
          Scan the QR on their Today screen to confirm their entry or exit.
        </p>
      </div>
      <QrScanner />
    </div>
  );
}
