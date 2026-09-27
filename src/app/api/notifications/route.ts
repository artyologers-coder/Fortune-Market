import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { listNotifications, markAllAsRead, markAsRead } from "@/lib/notifications";

/**
 * The signed-in user's own notifications.
 *
 * There is no user id anywhere in this route. The recipient is read from the
 * session, so a caller cannot read or dismiss anyone else's notifications by
 * editing the request. The payout, approval and registration flows all write
 * rows here; without this route those messages were written and never seen.
 *
 * Open to every signed-in role, not just representatives — application and
 * payment decisions notify producers and administrators too.
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const page = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
    const perPage = Number.parseInt(url.searchParams.get("perPage") ?? "20", 10);
    const unreadOnly = url.searchParams.get("unreadOnly") === "true";

    const result = await listNotifications(session.user.id, {
      page: Number.isFinite(page) ? page : 1,
      perPage: Number.isFinite(perPage) ? perPage : 20,
      unreadOnly,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Notifications list error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Mark notifications read.
 *
 * `all: true` marks everything for the session user. Otherwise `ids` is the list
 * to dismiss. Ownership is enforced in the library's where clause, not here, so
 * passing somebody else's id is a no-op rather than a leak.
 */
export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));

    if (body?.all === true) {
      const updated = await markAllAsRead(session.user.id);
      return NextResponse.json({ updated });
    }

    const ids = Array.isArray(body?.ids) ? body.ids.filter((v: unknown) => typeof v === "string") : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: "Provide ids or all: true" }, { status: 400 });
    }

    const updated = await markAsRead(session.user.id, ids);
    return NextResponse.json({ updated });
  } catch (error) {
    console.error("Notifications update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
