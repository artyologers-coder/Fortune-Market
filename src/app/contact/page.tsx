const EMAIL = "info.fortunemarket@gmail.com";

const sections = [
  {
    title: "1. Get in Touch",
    body: (
      <>
        <p>
          Fortune Market is a project of{" "}
          <strong>Artyologers</strong>, a business registered in Sri Lanka.
          Whether you are a Buyer, a Producer, or a partner, our Fortune Market
          support team is here to help. We&apos;ll get back to you as quickly as
          we can.
        </p>
      </>
    ),
  },
  {
    title: "2. How to Reach Us",
    body: (
      <>
        <p>You can contact us through any of the following channels:</p>
        <ul>
          <li>
            <strong>Email:</strong>{" "}
            <a
              href={`mailto:${EMAIL}`}
              className="text-primary underline hover:text-primary-600"
            >
              {EMAIL}
            </a>
          </li>
          <li>
            <strong>Facebook Page:</strong>{" "}
            <a
              href="https://www.facebook.com/FortuneMarketPage"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline hover:text-primary-600"
            >
              facebook.com/FortuneMarketPage
            </a>
          </li>
          <li>
            <strong>Facebook Group:</strong>{" "}
            <a
              href="https://www.facebook.com/groups/fortunemarket"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline hover:text-primary-600"
            >
              facebook.com/groups/fortunemarket
            </a>
          </li>
        </ul>
      </>
    ),
  },
  {
    title: "3. Customer Support",
    body: (
      <>
        <p>
          Need help with an order, a product, or your account? Our support team
          can assist you with:
        </p>
        <ul>
          <li>Questions about orders, payments, or delivery;</li>
          <li>Help with product listings and accounts;</li>
          <li>Assistance with returns, refunds, or cancellations.</li>
        </ul>
        <p>
          Please email us at{" "}
          <a
            href={`mailto:${EMAIL}`}
            className="text-primary underline hover:text-primary-600"
          >
            {EMAIL}
          </a>{" "}
          with as much detail as possible so we can help you quickly.
        </p>
      </>
    ),
  },
  {
    title: "4. Response Times",
    body: (
      <>
        <p>
          We aim to respond to all enquiries <strong>within 2 business days</strong>.
          During busy periods it may take a little longer, and we appreciate
          your patience.
        </p>
      </>
    ),
  },
  {
    title: "5. For Producers",
    body: (
      <>
        <p>
          Are you a home-based producer or small business interested in selling
          on Fortune Market? If you have questions about onboarding, verification,
          or managing your listings, get in touch with us at{" "}
          <a
            href={`mailto:${EMAIL}`}
            className="text-primary underline hover:text-primary-600"
          >
            {EMAIL}
          </a>{" "}
          and we&apos;ll be happy to guide you through the process.
        </p>
      </>
    ),
  },
  {
    title: "6. Report a Product or Listing",
    body: (
      <>
        <p>
          To report a product or listing that you believe violates our Terms,
          please use the in-app &quot;Report&quot; feature on the product page.
          Our moderation team reviews every report and takes appropriate action.
          For urgent concerns, you can also email us at{" "}
          <a
            href={`mailto:${EMAIL}`}
            className="text-primary underline hover:text-primary-600"
          >
            {EMAIL}
          </a>
          .
        </p>
      </>
    ),
  },
  {
    title: "7. What to Include in Your Message",
    body: (
      <>
        <p>To help us resolve your enquiry faster, where possible please include:</p>
        <ul>
          <li>Your full name and the email address linked to your account;</li>
          <li>The order number, if your enquiry is about an order;</li>
          <li>The product name, if your enquiry is about a listing.</li>
        </ul>
      </>
    ),
  },
];

export const metadata = {
  title: "Contact Us | Fortune Market",
  description:
    "Get in touch with the Fortune Market team. Fortune Market is a project of Artyologers.",
};

export default function ContactPage() {
  return (
    <div className="page-container py-10 md:py-16">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="section-title">Contact Us</h1>
          <p className="text-sm text-gray-500 mt-2">
            Fortune Market — A project of Artyologers
          </p>
        </div>

        <div className="space-y-8">
          {sections.map((section) => (
            <section key={section.title} className="card p-6 md:p-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">
                {section.title}
              </h2>
              <div className="text-sm text-gray-700 leading-relaxed space-y-3">
                {section.body}
              </div>
            </section>
          ))}
        </div>

        <p className="text-center text-sm text-gray-500 mt-10">
          © 2026 Fortune Market — A project of Artyologers. All rights
          reserved.
        </p>
      </div>
    </div>
  );
}
