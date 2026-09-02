"use client";

import { useState, useEffect } from "react";

interface Offer {
  id: string;
  title: string;
  titleSi: string;
  description: string;
  descriptionSi: string;
  discountPercent: number;
  startDate: string;
  endDate: string;
  producer: {
    businessName: string;
    businessNameSi: string;
  };
}

function CountdownTimer({ endDate }: { endDate: string }) {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    function calculate() {
      const diff = new Date(endDate).getTime() - Date.now();
      if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
      return {
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((diff / (1000 * 60)) % 60),
        seconds: Math.floor((diff / 1000) % 60),
      };
    }

    setTimeLeft(calculate());
    const timer = setInterval(() => setTimeLeft(calculate()), 1000);
    return () => clearInterval(timer);
  }, [endDate]);

  return (
    <div className="flex gap-3 text-center">
      {[
        { value: timeLeft.days, label: "Days" },
        { value: timeLeft.hours, label: "Hrs" },
        { value: timeLeft.minutes, label: "Min" },
        { value: timeLeft.seconds, label: "Sec" },
      ].map((item) => (
        <div key={item.label} className="bg-white rounded-lg px-3 py-2 min-w-[60px]">
          <p className="text-2xl font-bold text-primary">{String(item.value).padStart(2, "0")}</p>
          <p className="text-xs text-gray-500">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

export default function OffersPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/offers")
      .then((res) => res.json())
      .then((data) => {
        setOffers(data.offers || []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="page-container">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Special Offers</h1>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : offers.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500 text-lg">No special offers available right now</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {offers.map((offer) => (
            <div key={offer.id} className="card overflow-hidden">
              <div className="bg-gradient-to-r from-accent to-accent-600 p-6 text-white">
                <div className="text-4xl font-bold mb-2">{offer.discountPercent}% OFF</div>
                <h2 className="text-xl font-semibold">{offer.titleSi}</h2>
              </div>
              <div className="p-6">
                <p className="text-gray-600 text-sm mb-4">{offer.descriptionSi}</p>
                <p className="text-xs text-gray-500 mb-3">
                  By {offer.producer.businessNameSi}
                </p>
                <p className="text-xs text-gray-500 mb-2">Ends in:</p>
                <CountdownTimer endDate={offer.endDate} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
