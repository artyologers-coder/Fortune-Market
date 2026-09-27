import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { LeadsManager } from "@/components/representative/leads-manager";

export default async function RepresentativeLeadsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/login?callbackUrl=/representative/leads");

  const rep = await prisma.representative.findUnique({
    where: { userId: session.user.id },
    select: { id: true, status: true },
  });
  if (!rep) redirect("/representative");

  return (
    <main className="page-container">
      <div className="mb-6">
        <Link href="/representative" className="text-sm text-primary hover:underline">
          ← Back to dashboard
        </Link>
        <h1 className="section-title mt-2 !mb-1">My leads</h1>
        <p className="text-gray-600">
          Record the producers you have spoken to so you can keep track of who is still to
          convert. When one of them registers, this record is matched to them automatically.
        </p>
        {rep.status !== "ACTIVE" && (
          <p className="mt-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
            Your account is {rep.status.toLowerCase()}, so you cannot add or change leads.
          </p>
        )}
      </div>
      <LeadsManager />
    </main>
  );
}
