/**
 * In-app legal copy (Privacy Policy + Terms of Use / EULA).
 * Rendered by /privacy and /terms — keep App Store / paywall links in sync.
 */

export type LegalBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'bullet'; text: string }
  | { type: 'link'; label: string; url: string };

export type LegalSection = {
  heading: string;
  blocks: LegalBlock[];
};

export type LegalDocument = {
  title: string;
  lastUpdated: string;
  sections: LegalSection[];
};

export const PRIVACY_POLICY: LegalDocument = {
  title: 'Privacy Policy',
  lastUpdated: 'September 2026',
  sections: [
    {
      heading: '1. Overview',
      blocks: [
        {
          type: 'paragraph',
          text: 'Redact PDF ("we," "our," or "the App") is engineered as a local-first utility. We believe your private records belong exclusively to you.',
        },
      ],
    },
    {
      heading: '2. On-Device Document Processing',
      blocks: [
        {
          type: 'paragraph',
          text: 'The App processes all documents, PDF pages, scans, and photos 100% locally on your iPhone using built-in device capabilities.',
        },
        {
          type: 'bullet',
          text: 'Your files, bank statements, identification numbers, and contact details are NEVER transmitted to external cloud servers.',
        },
        {
          type: 'bullet',
          text: 'We do not operate file-upload servers, do not train AI models on your files, and cannot see or read your documents.',
        },
      ],
    },
    {
      heading: '3. Analytics & Diagnostics',
      blocks: [
        {
          type: 'paragraph',
          text: 'We do not use third-party behavioral trackers or sell personal advertising profiles. Anonymous operational telemetry (such as crash reports or subscription validation via RevenueCat) is collected solely to manage purchase access and app stability.',
        },
      ],
    },
    {
      heading: '4. Third-Party Services',
      blocks: [
        {
          type: 'paragraph',
          text: 'In-app subscription management and receipts are securely processed by Apple App Store In-App Purchases and RevenueCat. These platforms handle transactions under their respective privacy policies.',
        },
      ],
    },
    {
      heading: '5. Contact Us',
      blocks: [
        {
          type: 'paragraph',
          text: 'For questions regarding this policy, contact support at:',
        },
        {
          type: 'link',
          label: 'princemahlaba27@gmail.com',
          url: 'mailto:princemahlaba27@gmail.com',
        },
      ],
    },
  ],
};

export const TERMS_OF_USE: LegalDocument = {
  title: 'Terms of Use (EULA)',
  lastUpdated: 'September 2026',
  sections: [
    {
      heading: '1. Acceptance of Terms',
      blocks: [
        {
          type: 'paragraph',
          text: 'By downloading or using Redact PDF ("the App"), you agree to be bound by these Terms of Use. If you do not agree, do not use the App.',
        },
      ],
    },
    {
      heading: '2. License & Subscriptions',
      blocks: [
        {
          type: 'bullet',
          text: 'Billing: Certain features (such as flattened document export) require an active auto-renewable subscription. Subscriptions begin with an introductory promotional rate ($0.49 for 7 days) and automatically renew at the standard weekly rate ($9.99/week) unless canceled at least 24 hours before the end of the billing period.',
        },
        {
          type: 'bullet',
          text: 'Management: Payment is charged to your Apple ID account at confirmation of purchase. You can manage or cancel your subscription at any time within your iPhone Settings > Apple ID > Subscriptions.',
        },
      ],
    },
    {
      heading: '3. Permitted Use & Output Disclaimer',
      blocks: [
        {
          type: 'paragraph',
          text: 'The App provides automated text masking and manual markup tools to cover sensitive data on documents. While the App flattens exported files to protect underlying text, you remain solely responsible for reviewing and confirming that all desired private data is completely covered prior to sending or sharing files with third parties.',
        },
      ],
    },
    {
      heading: '4. Intellectual Property & File Ownership',
      blocks: [
        {
          type: 'paragraph',
          text: 'You retain 100% ownership and copyright of all documents and images imported, edited, and exported through the App. We claim no ownership over your files.',
        },
      ],
    },
    {
      heading: '5. Standard Apple EULA',
      blocks: [
        {
          type: 'paragraph',
          text: "These terms incorporate by reference Apple's standard Licensed Application End User License Agreement (EULA):",
        },
        {
          type: 'link',
          label: 'Apple Standard EULA',
          url: 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/',
        },
      ],
    },
  ],
};
