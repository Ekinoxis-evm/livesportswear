import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Refreshes the Supabase session and gates routes by role. Roles come from the
 * JWT claim app_metadata.role, so no DB call is needed here.
 * (Next 16 renamed the `middleware` convention to `proxy`.)
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const role = (user?.app_metadata as { role?: string } | undefined)?.role;
  const { pathname } = request.nextUrl;
  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    return NextResponse.redirect(url);
  };

  const isAdminPath = pathname.startsWith("/admin");
  const isPortalPath = pathname.startsWith("/portal");
  const isStorePath = pathname.startsWith("/store");

  if (!user && (isAdminPath || isPortalPath || isStorePath)) {
    return redirectTo("/login");
  }
  if (isAdminPath && role !== "admin") return redirectTo("/");
  if (isStorePath && role !== "store") return redirectTo("/");
  if (isPortalPath && role === "store") return redirectTo("/store");
  // "/" and "/login" route by role (see app/page.tsx); send signed-in users there.
  if (user && pathname === "/login") return redirectTo("/");

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
