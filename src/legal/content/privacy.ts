import type { LegalDocument } from '../legal.types.js';
import { LEGAL_EFFECTIVE_DATE, LEGAL_VERSION } from './meta.js';

// Every statement below was checked against the code when this was written
// (what is stored, how it is protected, what the browser keeps, which third
// parties the web app contacts). When the code changes in a way that affects
// one of these facts — notably anything about Google sign-in/Drive — update the
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
        'Account data: you sign in only with Google. From your Google account we receive and store your name, your email address (in lower case) and Google’s unique identifier for your account. We do not collect or store a password for you. Accounts created before Google sign-in was introduced may still hold a password hash from that time; it can no longer be used to sign in.',
        'Google connection data: the Google refresh token that lets Exin Finance reach your Google Drive, stored encrypted (see section 10).',
        'Business data you enter: the profile of each business (name, currency, address, contact email, website, logo, default invoice terms), your accounts and categories, ledger entries (date, amount, description and counterparty), clients (name, address, email), invoices with their line items, and the PDF files generated for them.',
        'Bank details for invoices: account holder name and bank branch are stored as entered. The account number, routing number and SWIFT code are additionally encrypted at rest with AES-256-GCM.',
        'Uploaded files: invoices and receipts (PDF or image) that you attach to ledger entries or upload to have an amount, date and counterparty suggested. Text is read from the file on our own server (from the PDF text layer or by text recognition); the file is not sent to any other company for this.',
        'Sharing data: if you share a business with someone, we store whom you shared it with (matched by email address), what they may do (view or edit) and until when. People you share with can see the data of that business.',
        'Technical data: your IP address is used by the server to limit the number of requests (rate limiting). The application keeps it in memory only, does not write it to its database, and discards it when the service restarts. The application itself does not write access logs. Our hosting infrastructure may process IP addresses in standard operating logs.',
        'Data in your browser: Exin Finance stores two items in your browser’s local storage: the session token that keeps you signed in (removed when you sign out or when it expires or becomes invalid), and your list/grid view preference. Both stay on your device and are strictly necessary for the service you asked for. The only cookie is a temporary security cookie that is set when you click “Continue with Google” and protects the sign-in against forgery. It is not readable by scripts, lasts at most 10 minutes and is deleted when sign-in finishes. We use no other cookies, and none for advertising, analytics or tracking.',
      ],
    },
    {
      heading: '3. Fonts loaded from Google',
      paragraphs: [
        'The pages of Exin Finance display the fonts Plus Jakarta Sans, Roboto and Roboto Mono, which are loaded from Google Fonts (fonts.googleapis.com and fonts.gstatic.com). When your browser loads a page it therefore connects to servers of Google, which receive your IP address and technical browser data. This is the only third-party resource the web app loads; it contains no scripts for advertising, analytics or tracking.',
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
        'Signing you in with Google and keeping your files in your own Google Drive: Art. 6(1)(b) GDPR (performance of a contract), together with your decision to grant access on Google’s consent screen.',
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
        'There is currently no self-service button to delete your account. Write to info@sam-trek.com and we will delete your account, including the stored Google token, and the remaining data without undue delay, unless a legal obligation requires us to keep something. Regular backups of our database are rotated; deleted data therefore disappears from backups after a limited period.',
        'Please keep in mind that you may be subject to your own record-keeping obligations. Export or download what you need before deleting.',
      ],
    },
    {
      heading: '7. Who receives data',
      bullets: [
        'Hosting provider: Exin Finance runs on servers of Hetzner Online GmbH in the European Union. Hetzner processes data on our behalf under a data processing agreement.',
        'People you share a business with: they can see the data of that business for the period you set.',
        'Google: Google Fonts (see section 3), and Google sign-in and Google Drive, which you use to sign in (see section 10).',
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
        'Sign-in is handled by Google; Exin Finance never sees your Google password. The Google refresh token is encrypted at rest with AES-256-GCM.',
        'Bank account number, routing number and SWIFT code are encrypted at rest with AES-256-GCM; the encryption key is kept separately from the database.',
        'Every request is checked against the signed-in user: you only reach your own businesses and those shared with you.',
        'Uploaded files are checked for type and size, and invoice PDFs are rendered in an environment that cannot reach the internet.',
        'Requests are rate limited to make abuse harder.',
      ],
      paragraphs: [
        'Other business data is protected by access controls and the security of our hosting rather than by additional per-field encryption. No online service can be completely secure.',
      ],
    },
    {
      heading: '10. Google sign-in and Google Drive',
      paragraphs: [
        'Exin Finance uses Google sign-in (OAuth 2.0) as its only way to sign in and to create an account: your first sign-in creates your account, later sign-ins open it. Exin Finance also keeps the files it stores for you, such as invoice PDFs and receipts, in your own Google Drive. Using Exin Finance therefore requires a Google account and the Drive permission described below.',
      ],
      bullets: [
        'Sign-in data. We request the scopes openid, email and profile to identify you. We receive your Google account identifier, your name, your email address and whether Google has verified that address. If an account with the same verified email address already exists, your Google account is linked to it.',
        'Drive permission (required). We request https://www.googleapis.com/auth/drive.file, which gives access only to files and folders that Exin Finance itself creates in your Drive. We cannot see, list or change any other file in your Drive. This permission is required: if you do not allow it on Google’s consent screen, you cannot sign in.',
        'What we do in your Drive. Exin Finance creates a folder in your Google Drive and keeps your invoice PDFs and receipts only there, organised by business. The files are stored in your own Google Drive, not in any other cloud storage.',
        'Offline access and refresh token. We request offline access so that Exin Finance can keep working with your Drive when you are not using the app. Google therefore gives us a refresh token. We store it encrypted at rest with AES-256-GCM, never send it to your browser, and use it only for the Drive features described here. Short-lived access tokens from Google are used only in memory and are not stored.',
        'No other use. We do not use data from Google for advertising, we do not sell it, and we do not use it to develop, improve or train artificial intelligence or machine-learning models. We do not transfer it to third parties except as needed to provide these features, to comply with law, or as part of a merger or sale of the business with notice to you.',
        'Human access. Our staff do not read your Google user data unless you give your consent for a specific case, it is necessary for security purposes (for example investigating abuse), or the law requires it.',
        "Google API Services User Data Policy. Exin Finance's use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.",
        'Revoking access. You can revoke Exin Finance’s access at any time at https://myaccount.google.com/permissions. The stored refresh token then stops working and you can sign in again only after granting the permissions again. To have the stored token and your account deleted, write to info@sam-trek.com (see section 6).',
        'Files already in Drive. Files that Exin Finance has already saved in your Drive belong to you and stay there when you revoke access or delete your account; we cannot delete them afterwards because we no longer have access. You can delete or move them yourself in Google Drive.',
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
