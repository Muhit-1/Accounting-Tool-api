import type { LegalDocument } from '../legal.types.js';
import { LEGAL_EFFECTIVE_DATE, LEGAL_VERSION } from './meta.js';

// Keep in step with privacy.ts: statements about what the service does must
// match the code. Bump LEGAL_VERSION when anything here changes in substance.
export const termsOfService: LegalDocument = {
  slug: 'terms',
  title: 'Terms of Service',
  version: LEGAL_VERSION,
  effectiveDate: LEGAL_EFFECTIVE_DATE,
  language: 'en',
  sections: [
    {
      heading: '1. Who we are',
      paragraphs: [
        'Exin Finance (https://exin-finance.sam-trek.com) is provided by SAMTrek UG (haftungsbeschränkt), Lerchenstr. 7, 85630 Grasbrunn, Germany, represented by its managing director Dr. Shahidul Alam, registered at Amtsgericht München under HRB 309076, VAT ID DE463689203 (“we”, “us”). Contact: info@sam-trek.com.',
        'These Terms apply to your use of Exin Finance. By creating an account or using the service you agree to them. How we handle personal data is described in our Privacy Policy.',
      ],
    },
    {
      heading: '2. The service',
      paragraphs: [
        'Exin Finance is a web application for bookkeeping and invoicing. It lets you manage one or more businesses, record income and expenses, attach invoices and receipts, create invoices as PDF files, view dashboards and reports, share a business with other people, and have an amount, date and counterparty suggested from an uploaded invoice. Optionally, you can connect Google to sign in and to store your files in your own Google Drive.',
        'Exin Finance is an early-stage service. Features can change, be added or be removed. These Terms do not set a price; if paid plans are introduced, they will be agreed with you separately and in advance.',
      ],
    },
    {
      heading: '3. Eligibility',
      paragraphs: [
        'You may use Exin Finance if you act for a business or for yourself and are of full legal age in your country. If you register on behalf of a company, you confirm that you are authorised to do so.',
      ],
    },
    {
      heading: '4. Your account',
      bullets: [
        'Give correct information when you register and keep it up to date.',
        'Choose a strong password and keep your credentials confidential. Do not share your account; use the sharing function to give other people access.',
        'You are responsible for everything that happens under your account. Tell us at info@sam-trek.com without delay if you suspect it has been compromised.',
      ],
    },
    {
      heading: '5. Acceptable use',
      paragraphs: ['You agree not to:'],
      bullets: [
        'use the service for anything unlawful, or to create false or misleading invoices or records;',
        'upload content or files you have no right to use, or files that contain malware;',
        'try to access data of other users, to bypass access controls or rate limits, or to probe, overload or disrupt the service;',
        'use automated means to create accounts or to extract data in bulk;',
        'resell the service or make it available to third parties other than through its sharing function.',
      ],
    },
    {
      heading: '6. Your data',
      paragraphs: [
        'The data and files you enter or upload remain yours. You grant us only the non-exclusive right to store, process and display them, and to generate documents from them, as far as needed to operate the service for you and for the people you share a business with. This right ends when you delete the data, subject to the retention described in the Privacy Policy.',
        'You are responsible for the content you enter and for having the right to enter it, including data about your clients.',
      ],
    },
    {
      heading: '7. Sharing with others',
      paragraphs: [
        'You decide with whom you share a business, whether they may only view or also edit, and for how long. People you share with can see the data of that business. Choose them with care and revoke access when it is no longer needed.',
      ],
    },
    {
      heading: '8. A bookkeeping aid, not advice',
      paragraphs: [
        'Exin Finance is a tool that helps you keep records and create invoices. It does not provide accounting, tax or legal advice. You are responsible for the accuracy and completeness of your entries and invoices, for checking suggestions made from uploaded invoices (they are produced automatically and can be wrong), and for complying with your tax, accounting and other legal obligations. Please consult a qualified professional where needed.',
        'Combined views across businesses that use different currencies add up the figures as entered; they do not convert currencies.',
      ],
    },
    {
      heading: '9. Availability and changes',
      paragraphs: [
        'We provide the service as it is, without a guarantee of uninterrupted or error-free availability. There may be maintenance, outages or changes. We may change or discontinue features; where this significantly affects you, we will try to give reasonable notice. Keep your own copies of important documents; the app lets you download invoice PDFs, receipts and reports.',
        'The limitations in this section do not limit our liability as set out in section 11.',
      ],
    },
    {
      heading: '10. Google Drive integration',
      paragraphs: [
        'Connecting Google is optional. If you connect it, files are stored in your own Google Drive, in a folder that Exin Finance creates, and we can access only files and folders that Exin Finance itself creates. Your use of Google is also subject to Google’s own terms. You can disconnect Google in the app and revoke access at any time at https://myaccount.google.com/permissions. We are not responsible for the availability of Google’s services. Details on data handling are in the Privacy Policy.',
      ],
    },
    {
      heading: '11. Liability',
      paragraphs: [
        'We are liable without limitation for intent and gross negligence, for injury to life, body or health, and under the German Product Liability Act (Produkthaftungsgesetz).',
        'In cases of slight negligence we are liable only for the breach of essential contractual obligations, meaning obligations whose fulfilment makes the proper performance of the contract possible in the first place and on which you may regularly rely. In that case our liability is limited to the foreseeable damage typical for this kind of contract. Any further liability for slight negligence is excluded. This also applies to the personal liability of our employees, representatives and vicarious agents.',
      ],
    },
    {
      heading: '12. Termination, export and deletion',
      paragraphs: [
        'You can stop using Exin Finance at any time. You can delete your data in the app (entries, invoices, clients and whole businesses), and you can ask us at info@sam-trek.com to delete your account.',
        'Before you do, download what you need: invoice PDFs, receipts and reports are available in the app, and you can ask us for an export of your data. After termination we delete your data as described in the Privacy Policy.',
        'We may end your access with reasonable notice, or immediately for good cause, for example if you seriously or repeatedly breach section 5.',
      ],
    },
    {
      heading: '13. Changes to these Terms',
      paragraphs: [
        'We may change these Terms for good reasons, such as new features, changes in the law or changes in the service. We will inform you of material changes in the app or by email at least 30 days before they take effect. If you do not agree, you can stop using the service and delete your data before then; if you continue to use it after the effective date, the new Terms apply to your continued use.',
      ],
    },
    {
      heading: '14. Severability',
      paragraphs: [
        'If a provision of these Terms is or becomes invalid, the remaining provisions stay in effect. The invalid provision is replaced by the statutory rule.',
      ],
    },
    {
      heading: '15. Governing law and jurisdiction',
      paragraphs: [
        'These Terms are governed by German law; the UN Convention on Contracts for the International Sale of Goods (CISG) does not apply. To the extent legally permissible, the place of jurisdiction is our registered seat. Mandatory consumer protection rights of the country where you live, and statutory places of jurisdiction for consumers, remain unaffected.',
      ],
    },
    {
      heading: '16. Contact',
      paragraphs: ['SAMTrek UG (haftungsbeschränkt), Lerchenstr. 7, 85630 Grasbrunn, Germany. Email: info@sam-trek.com.'],
    },
  ],
};
