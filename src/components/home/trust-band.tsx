import type { Dictionary } from "@/lib/i18n";

interface TrustBandProps {
  home: Dictionary["home"];
}

export function TrustBand({ home }: TrustBandProps) {
  const items = [
    { icon: "🇱🇰", title: home.trustHandmade, sub: home.trustHandmadeSub },
    { icon: "🛡️", title: home.trustVerified, sub: home.trustVerifiedSub },
    { icon: "🤝", title: home.trustDirect, sub: home.trustDirectSub },
    { icon: "💵", title: home.trustCod, sub: home.trustCodSub },
  ];

  return (
    <section className="border-b border-gray-100 bg-white">
      <div className="page-container">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {items.map((item) => (
            <div key={item.title} className="flex items-start gap-3">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-xl"
                aria-hidden="true"
              >
                {item.icon}
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                <p className="mt-0.5 text-xs text-gray-500">{item.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}