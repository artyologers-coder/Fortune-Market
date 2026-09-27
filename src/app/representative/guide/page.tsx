import { isFeatureEnabled } from "@/lib/feature-flags";
import { listVisibleGuide } from "@/lib/representative-guide";

/**
 * The programme's own explanation of itself, readable by anyone.
 *
 * Read per request on purpose. The content is edited in the admin, not in the
 * code, so a static build would freeze whatever the guide happened to say at
 * deploy time — and this is the page that quotes commission terms.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Representative Guide | Fortune Market",
  description:
    "How the Fortune Market representative programme works: acquiring producers, commission rules, and how you get paid.",
};

export default async function RepresentativeGuidePage() {
  if (!isFeatureEnabled("REPRESENTATIVE_APPLICATIONS")) {
    return (
      <main className="page-container max-w-3xl">
        <div className="card p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-3">The guide is not available</h1>
          <p className="text-gray-600">
            The representative programme is not currently accepting applications.
          </p>
        </div>
      </main>
    );
  }

  const sections = await listVisibleGuide();

  return (
    <main className="page-container max-w-3xl">
      <a href="/representative/apply" className="text-sm text-primary hover:underline">
        ← Back to the application
      </a>
      <h1 className="section-title mt-2 !mb-1">Representative guide</h1>
      <p className="text-gray-600 mb-8">
        How the programme works. If anything here is unclear, ask before you sign up.
      </p>

      {sections.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-gray-600">
            The guide has not been written yet. Please check back soon.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {sections.map((s) => (
            <section key={s.slug} id={s.slug} className="card p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">{s.title}</h2>
              <div className="text-gray-700 leading-relaxed whitespace-pre-wrap">{s.body}</div>
            </section>
          ))}
        </div>
      )}

      <div className="card p-6 mt-8 bg-primary/5">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Ready to join?</h2>
        <p className="text-gray-600 mb-4">
          Applying takes a few minutes. You will need your NIC, your district, and the bank
          account you want to be paid into.
        </p>
        <a href="/representative/apply" className="btn-primary inline-block">
          Start an application
        </a>
      </div>
    </main>
  );
}
