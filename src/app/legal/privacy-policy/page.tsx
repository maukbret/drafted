import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy | Mauk.ai',
  description:
    'How Mauk.ai collects, uses, and protects personal information when you use our service.',
}

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-12 md:py-16">
        <header className="mb-10 border-b border-border pb-8">
          <Link href="/" className="inline-flex items-center">
            <img
              src="/assets/logo-black.svg"
              alt="Mauk.ai"
              width={410}
              height={96}
              className="h-9 w-auto dark:invert"
            />
          </Link>
          <h1 className="mt-8 text-3xl font-semibold tracking-tight">
            Privacy Policy
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Last updated: April 7, 2026
          </p>
        </header>

        <div className="space-y-10 text-sm leading-relaxed md:text-base">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">
              1. Introduction
            </h2>
            <p className="text-muted-foreground">
              Mauk.ai (&quot;Mauk.ai&quot;, &quot;we&quot;, &quot;us&quot;, or
              &quot;our&quot;) provides tools that help teams turn Figma designs
              into Klaviyo email drafts. This Privacy Policy describes how we
              collect, use, disclose, and safeguard information when you use our
              website, application, and related services (collectively, the
              &quot;Service&quot;).
            </p>
            <p className="text-muted-foreground">
              By using the Service, you agree to this Privacy Policy. If you do
              not agree, please do not use the Service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">
              2. Information we collect
            </h2>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
              <li>
                <strong className="text-foreground">Account information:</strong>{' '}
                such as name, email address, password (stored securely), team
                affiliation, and profile details you choose to provide.
              </li>
              <li>
                <strong className="text-foreground">Billing information:</strong>{' '}
                processed by Stripe. We do not store full payment card numbers on
                our servers.
              </li>
              <li>
                <strong className="text-foreground">Service data:</strong>{' '}
                content and metadata you upload or generate in the Service,
                such as campaign drafts, imported assets, integration settings,
                and related usage context needed to operate features you
                request.
              </li>
              <li>
                <strong className="text-foreground">
                  Connected services:
                </strong>{' '}
                when you connect third-party accounts (such as Figma or
                Klaviyo), we receive tokens and profile or resource identifiers
                as permitted by those services and your authorization choices.
              </li>
              <li>
                <strong className="text-foreground">Technical data:</strong>{' '}
                such as IP address, device and browser type, general location
                derived from IP, log data, and cookies or similar technologies
                where applicable.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">
              3. How we use information
            </h2>
            <p className="text-muted-foreground">
              We use the information above to provide, maintain, and improve the
              Service; authenticate users; process subscriptions; communicate
              with you about the Service; secure our systems; comply with law;
              and analyze usage in aggregated or de-identified form where
              appropriate.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">
              4. How we share information
            </h2>
            <p className="text-muted-foreground">
              We may share information with vendors and service providers who
              process data on our behalf (for example, hosting, analytics,
              payments, email delivery, and AI providers where you enable
              features that use them), with your direction (for example, when
              you export to Klaviyo), to comply with legal obligations, to
              protect rights and safety, or in connection with a business
              transfer (such as a merger or acquisition). We do not sell your
              personal information.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">
              5. Data retention
            </h2>
            <p className="text-muted-foreground">
              We retain information for as long as your account is active or as
              needed to provide the Service, resolve disputes, enforce
              agreements, and meet legal, security, and operational
              requirements.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">6. Security</h2>
            <p className="text-muted-foreground">
              We use reasonable administrative, technical, and organizational
              measures designed to protect personal information. No method of
              transmission or storage is completely secure.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">
              7. Your rights and choices
            </h2>
            <p className="text-muted-foreground">
              Depending on where you live, you may have rights to access,
              correct, delete, or restrict certain processing of your personal
              information, or to object to or port data. You can often manage
              account details directly in the Service. You may also contact us
              to exercise applicable rights, subject to verification and legal
              limitations.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">
              8. International transfers
            </h2>
            <p className="text-muted-foreground">
              We may process and store information in countries other than where
              you live. Where required, we use appropriate safeguards for
              cross-border transfers.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">
              9. Children&apos;s privacy
            </h2>
            <p className="text-muted-foreground">
              The Service is not directed to children under 13 (or the minimum
              age required in your jurisdiction), and we do not knowingly
              collect personal information from children.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">
              10. Changes to this policy
            </h2>
            <p className="text-muted-foreground">
              We may update this Privacy Policy from time to time. We will post
              the updated version on this page and revise the &quot;Last
              updated&quot; date above. Material changes may be communicated
              through the Service or by email where appropriate.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">11. Contact</h2>
            <p className="text-muted-foreground">
              Questions about this Privacy Policy or our privacy practices may
              be directed through the contact options we provide in the Service
              or on our website.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
