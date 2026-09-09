const sections = [
  {
    title: "1. Introduction",
    body: (
      <>
        <p>
          Fortune Market is a project of{" "}
          <strong>Artyologers</strong>, a business registered in Sri Lanka
          (&quot;Fortune Market&quot;, &quot;we&quot;, &quot;us&quot;, or
          &quot;our&quot;). This Privacy Policy explains how we collect, use,
          disclose, and safeguard your information when you use the Fortune
          Market platform (the &quot;Platform&quot;).
        </p>
        <p>
          By accessing or using the Platform, you acknowledge that you have
          read and understood this Privacy Policy. If you do not agree with
          this Policy, you must not use the Platform.{" "}
          <strong>All rights reserved to Artyologers.</strong>
        </p>
      </>
    ),
  },
  {
    title: "2. Information We Collect",
    body: (
      <>
        <p>We may collect the following categories of information:</p>
        <ul>
          <li>
            <strong>Account information:</strong> your name, email address,
            phone number (verified via one-time password), password (stored as
            an encrypted hash), role, and profile avatar.
          </li>
          <li>
            <strong>Producer/business information:</strong> if you register as
            a Producer, we collect your business name, business description,
            location, district, and phone number as part of the verification
            process.
          </li>
          <li>
            <strong>Order &amp; transaction information:</strong> shipping
            name, phone number, delivery address, city, order notes, and
            payment method (such as Cash on Delivery or card).
          </li>
          <li>
            <strong>Reviews &amp; content:</strong> reviews and any other
            content you submit on the Platform.
          </li>
          <li>
            <strong>Reports:</strong> information you provide when reporting a
            product or listing.
          </li>
          <li>
            <strong>Device &amp; usage data:</strong> basic technical data
            needed to operate and secure the Platform.
          </li>
        </ul>
      </>
    ),
  },
  {
    title: "3. How We Use Your Information",
    body: (
      <>
        <p>We use the information we collect to:</p>
        <ul>
          <li>Create and manage your account;</li>
          <li>Process, fulfil, and deliver your orders;</li>
          <li>Verify Producer applications and listings;</li>
          <li>
            Communicate with you, including sending verification codes (OTP),
            order updates, and important notices;
          </li>
          <li>Operate, maintain, and improve the Platform;</li>
          <li>
            Prevent fraud, abuse, and security incidents; and
          </li>
          <li>Comply with applicable legal and regulatory obligations.</li>
        </ul>
      </>
    ),
  },
  {
    title: "4. Payment Information",
    body: (
      <>
        <p>
          When you make a purchase using card payment, payment details are
          processed through a trusted payment gateway. We do not display or
          store full card numbers ourselves. For Cash on Delivery orders, no
          card details are collected. You are responsible for safeguarding any
          payment information you provide.
        </p>
      </>
    ),
  },
  {
    title: "5. Cookies & Local Storage",
    body: (
      <>
        <p>
          The Platform uses cookies and similar technologies to keep you signed
          in and to operate the Platform securely. Your shopping cart is stored
          in your browser&apos;s local storage on your device. It remains on
          your device and is not transmitted to us unless you place an order.
        </p>
      </>
    ),
  },
  {
    title: "6. Sharing of Information",
    body: (
      <>
        <p>
          We do not sell your personal information. We may share your
          information only in the following circumstances:
        </p>
        <ul>
          <li>
            <strong>With Producers:</strong> to fulfil an order, we share your
            shipping name, phone number, and delivery address with the relevant
            Producer.
          </li>
          <li>
            <strong>With service providers:</strong> we may share data with
            trusted providers who help us operate the Platform (for example,
            hosting and payment processing), subject to appropriate safeguards.
          </li>
          <li>
            <strong>Legal compliance:</strong> where required by law, regulation,
            or a valid legal request.
          </li>
        </ul>
      </>
    ),
  },
  {
    title: "7. Data Security",
    body: (
      <>
        <p>
          We take reasonable measures to protect your information, including
          encrypting passwords and restricting access to personal data. However,
          no method of transmission or storage is completely secure, and we
          cannot guarantee absolute security. You are responsible for keeping
          your account credentials confidential.
        </p>
      </>
    ),
  },
  {
    title: "8. Data Retention",
    body: (
      <>
        <p>
          We retain your personal information for as long as your account is
          active and for as long as necessary to provide the Platform, comply
          with legal obligations, and resolve disputes. When information is no
          longer required, we will take reasonable steps to delete or
          anonymise it.
        </p>
      </>
    ),
  },
  {
    title: "9. Your Rights",
    body: (
      <>
        <p>
          You have the right to access, correct, or request deletion of the
          personal information we hold about you, and to object to or restrict
          certain processing. To exercise any of these rights, please contact
          the Artyologers team through the support channels provided on the
          Platform. We may need to verify your identity before responding.
        </p>
      </>
    ),
  },
  {
    title: "10. Children's Privacy",
    body: (
      <>
        <p>
          The Platform is intended for users who are at least 18 years old. We
          do not knowingly collect personal information from children. If you
          believe a child has provided us with personal information, please
          contact us so we can take appropriate action.
        </p>
      </>
    ),
  },
  {
    title: "11. Third-Party Links",
    body: (
      <>
        <p>
          The Platform may contain links to external websites or sources. This
          Privacy Policy does not apply to those third parties. We are not
          responsible for the privacy practices or content of any third-party
          websites.
        </p>
      </>
    ),
  },
  {
    title: "12. Changes to This Policy",
    body: (
      <>
        <p>
          Fortune Market may update this Privacy Policy from time to time. Any
          changes will be posted on this page, and the &quot;Last updated&quot;
          date will be revised. Your continued use of the Platform after changes
          take effect constitutes your acceptance of the updated Policy.
        </p>
      </>
    ),
  },
  {
    title: "13. Contact",
    body: (
      <>
        <p>
          If you have any questions about this Privacy Policy or how we handle
          your information, please contact the Artyologers team through the
          contact or support channels provided on the Fortune Market platform.
        </p>
      </>
    ),
  },
];

export const metadata = {
  title: "Privacy Policy | Fortune Market",
  description:
    "Privacy Policy for the use of the Fortune Market platform, a project of Artyologers.",
};

export default function PrivacyPage() {
  return (
    <div className="page-container py-10 md:py-16">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="section-title">Privacy Policy</h1>
          <p className="text-sm text-gray-500 mt-2">
            Last updated: 2026 &nbsp;·&nbsp; Fortune Market — A project of
            Artyologers
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
