import type { LegalDocument } from '../legal.types.js';
import { LEGAL_EFFECTIVE_DATE, LEGAL_VERSION } from './meta.js';

// Every statement below was checked against the code when this was written
// (what is stored, how it is protected, what the browser keeps, which third
// parties the web app contacts). When the code changes in a way that affects
// one of these facts — notably when Google sign-in/Drive ships — update the
// text and bump LEGAL_VERSION in the same change.
export const privacyPolicy: LegalDocument = {
  slug: 'privacy',
  title: 'Privacy Policy',
  version: LEGAL_VERSION,
  effectiveDate: LEGAL_EFFECTIVE_DATE,
  language: 'en',
  sections: [
    {
      heading: '1. Who is responsible for your data',
      paragraphs: [
        'This Privacy Policy explains how personal data is processed when you use Exin Finance (https://exin-finance.sam-trek.com), a web application for bookkeeping and invoicing.',
        'The controller within the meaning of the EU General Data Protection Regulation (GDPR) is:',
      ],
      bullets: [
        'SAMTrek UG (haftungsbeschränkt), Lerchenstr. 7, 85630 Grasbrunn, Germany',
        'Managing director: Dr. Shahidul Alam',
        'Register court: Amtsgericht München, HRB 309076',
        'VAT ID: DE463689203',
        'Contact for all privacy and legal requests: info@sam-trek.com',
      ],
    },
    {
      heading: '2. What data we process',
      bullets: [
        'Account data: your name and email address (stored in lower case) and your password. The password is stored only as a bcrypt hash; we cannot read it.',
        'Business data you enter: the profile of each business (name, currency, address, contact email, website, logo, default invoice terms), your accounts and categories, ledger entries (date, amount, description and counterparty), clients (name, address, email), invoices with their line items, and the PDF files generated for them.',
        'Bank details for invoices: account holder name and bank branch are stored as entered. The account number, routing number and SWIFT code are additionally encrypted at rest with AES-256-GCM.',
        'Uploaded files: invoices and receipts (PDF or image) that you attach to ledger entries or upload to have an amount, date and counterparty suggested. Text is read from the file on our own server (from the PDF text layer or by text recognition); the file is not sent to any other company for this.',
        'Sharing data: if you share a business with someone, we store whom you shared it with (matched by email address), what they may do (view or edit) and until when. People you share with can see the data of that business.',
        'Technical data: your IP address is used by the server to limit the number of requests (rate limiting). The application keeps it in memory only, does not write it to its database, and discards it when the service restarts. The application itself does not write access logs. Our hosting infrastructure may process IP addresses in standard operating logs.',
        'Data in your browser: Exin Finance does not set cookies. It stores two items in your browser’s local storage: the session token that keeps you signed in (removed when you sign out or when it expires or becomes invalid), and your list/grid view preference. Both stay on your device and are strictly necessary for the service you asked for.',
      ],
    },
    {
      heading: '3. Fonts loaded from Google',
      paragraphs: [
        'The pages of Exin Finance display the fonts Plus Jakarta Sans and Roboto Mono, which are loaded from Google Fonts (fonts.googleapis.com and fonts.gstatic.com). When your browser loads a page it therefore connects to servers of Google, which receive your IP address and technical browser data. This is the only third-party resource the web app loads; it contains no scripts for advertising, analytics or tracking.',
        'The legal basis is our legitimate interest in a consistent and readable display of the service (Art. 6(1)(f) GDPR). Information on how Google processes data is available at https://policies.google.com/privacy.',
      ],
    },
    {
      heading: '4. Purposes and legal bases',
      bullets: [
        'Providing the service you requested — creating and running your account, storing your business data, generating invoices and reports, sharing with people you choose: Art. 6(1)(b) GDPR (performance of a contract).',
        'Security, preventing abuse and keeping the service running — rate limiting, protecting accounts and files, diagnosing faults: Art. 6(1)(f) GDPR (legitimate interests).',
        'Compliance with legal obligations — for example commercial and tax record-keeping duties of SAMTrek UG and answering lawful requests from authorities: Art. 6(1)(c) GDPR.',
        'Displaying fonts as described above: Art. 6(1)(f) GDPR.',
        'Connecting Google sign-in or Google Drive, when that feature is available and you choose to use it: Art. 6(1)(b) GDPR, together with your decision to grant access on Google’s consent screen.',
      ],
      paragraphs: [
        'We do not use advertising, analytics or tracking cookies, we do not profile you, and we do not take decisions about you by automated means.',
      ],
    },
    {
      heading: '5. Data about your own customers',
      paragraphs: [
        'Invoices and ledger entries usually contain data about other people, such as your clients. You decide what you enter and are responsible for having a lawful basis for it. Where the GDPR applies to you as a business, we process this content on your behalf and only to provide the service to you. If you need a data processing agreement, contact us at info@sam-trek.com.',
      ],
    },
    {
      heading: '6. How long we keep data and how to delete it',
      paragraphs: [
        'We keep your data for as long as your account exists. You can delete individual ledger entries, invoices (their PDF is deleted with them), clients and whole businesses in the app; deleting a business removes all of its data and files.',
        'There is currently no self-service button to delete your account. Write to info@sam-trek.com and we will delete your account and the remaining data without undue delay, unless a legal obligation requires us to keep something. Regular backups of our database are rotated; deleted data therefore disappears from backups after a limited period.',
        'Please keep in mind that you may be subject to your own record-keeping obligations. Export or download what you need before deleting.',
      ],
    },
    {
      heading: '7. Who receives data',
      bullets: [
        'Hosting provider: Exin Finance runs on servers of Hetzner Online GmbH in the European Union. Hetzner processes data on our behalf under a data processing agreement.',
        'People you share a business with: they can see the data of that business for the period you set.',
        'Google: Google Fonts always (see section 3); Google sign-in and Google Drive only if you connect them (see section 10).',
        'Authorities and courts, where we are legally obliged to disclose data.',
      ],
      paragraphs: ['We do not sell personal data and we do not pass it on for advertising.'],
    },
    {
      heading: '8. Transfers to countries outside the EU',
      paragraphs: [
        'Our own servers are located in the European Union. A transfer of personal data to a country outside the EU can only happen through Google. Google LLC (USA) is certified under the EU-US Data Privacy Framework; where that is not relied on, the transfer is based on the EU Standard Contractual Clauses.',
      ],
    },
    {
      heading: '9. Security',
      bullets: [
        'The service is accessed over HTTPS.',
        'Passwords are stored only as bcrypt hashes.',
        'Bank account number, routing number and SWIFT code are encrypted at rest with AES-256-GCM; the encryption key is kept separately from the database.',
        'Every request is checked against the signed-in user: you only reach your own businesses and those shared with you.',
        'Uploaded files are checked for type and size, and invoice PDFs are rendered in an environment that cannot reach the internet.',
        'Requests are rate limited to make guessing passwords and abuse harder.',
      ],
      paragraphs: [
        'Other business data is protected by access controls and the security of our hosting rather than by additional per-field encryption. No online service can be completely secure.',
      ],
    },
    {
      heading: '10. Google sign-in and Google Drive',
      paragraphs: [
        'Exin Finance is introducing optional sign-in with Google and optional storage of your files in your own Google Drive. Until this feature is enabled for your account, none of this section applies and your files are stored on our server. When it is enabled, it works as follows.',
      ],
      bullets: [
        'Minimum scopes. For sign-in we ask for openid, email and profile, to identify you and create your account (your name and email address). For Drive we ask only for https://www.googleapis.com/auth/drive.file, which gives access only to files and folders that Exin Finance itself creates in your Drive. We cannot see, list or change any other file in your Drive.',
        'What we do in your Drive. Exin Finance creates a folder named after the project in your Drive and keeps your invoice PDFs and receipts in it, organised by business.',
        'Tokens. The access and refresh tokens we receive from Google are stored encrypted, are never sent to your browser, and are used only to provide these features.',
        'No other use. We do not use data from Google for advertising, we do not sell it, and we do not use it to develop, improve or train artificial intelligence or machine-learning models.',
        'Human access. Our staff do not read your Google user data unless you give your consent for a specific case, it is necessary for security purposes (for example investigating abuse), or the law requires it.',
        'Google API Services User Data Policy. Exin Finance’s use and transfer of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.',
        'Disconnecting. You can disconnect Google in the app at any time, and you can revoke access at https://myaccount.google.com/permissions. After that we can no longer access your Drive and we delete the stored Google tokens.',
        'Files already in Drive. Files that Exin Finance has already saved in your Drive belong to you and stay there when you disconnect or revoke access; we cannot delete them afterwards because we no longer have access. You can delete or move them yourself in Google Drive.',
      ],
    },
    {
      heading: '11. Your rights',
      paragraphs: [
        'Under the GDPR you have the right to access your data (Art. 15), to have it corrected (Art. 16) or erased (Art. 17), to restrict its processing (Art. 18), to receive it in a portable format (Art. 20) and to object to processing based on legitimate interests (Art. 21). Where processing is based on your consent you can withdraw it at any time with effect for the future. To exercise your rights, write to info@sam-trek.com.',
        'You also have the right to lodge a complaint with a supervisory authority. The authority responsible for us is the Bayerisches Landesamt für Datenschutzaufsicht (BayLDA), Promenade 18, 91522 Ansbach, Germany (https://www.lda.bayern.de). You may also complain to the authority in your country of residence.',
        'Providing your account data is necessary to use the service; without it we cannot create an account.',
      ],
    },
    {
      heading: '12. Changes to this policy',
      paragraphs: [
        'We update this policy when the service or the law changes. The version number and effective date at the top of this page show which revision applies. We will announce material changes on this page and, where appropriate, in the app.',
      ],
    },
  ],
};
