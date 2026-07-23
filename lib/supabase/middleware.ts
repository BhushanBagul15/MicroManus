import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Routes reachable without an unlocked account.
const PUBLIC_PATHS = ["/", "/paywall", "/auth"];

function isPublic(pathname: string) {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) return true;
  if (pathname.startsWith("/api/stripe/webhook")) return true;
  if (pathname.startsWith("/api/coupon")) return true;
  if (pathname.startsWith("/api/stripe/checkout")) return true;
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) return true;
  return false;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }: { name: string; value: string; options: CookieOptions }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options: CookieOptions }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Not signed in and hitting a protected route -> send to the login/marketing page.
  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Signed in but not unlocked -> force through /paywall for everything except public paths.
  if (user && !isPublic(pathname)) {
    const { data: profile } = await supabase
      .from("users")
      .select("is_unlocked")
      .eq("id", user.id)
      .single();

    if (!profile?.is_unlocked) {
      const url = request.nextUrl.clone();
      url.pathname = "/paywall";
      return NextResponse.redirect(url);
    }
  }

  // Signed in + unlocked, but sitting on the marketing page -> send into the app.
  if (user && pathname === "/") {
    const { data: profile } = await supabase
      .from("users")
      .select("is_unlocked")
      .eq("id", user.id)
      .single();

    const url = request.nextUrl.clone();
    url.pathname = profile?.is_unlocked ? "/chat" : "/paywall";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
