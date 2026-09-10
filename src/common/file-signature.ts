// A multipart upload's declared mimetype is just a client-supplied header —
// trivially spoofed (rename a .exe to "invoice.pdf", or set the field's
// Content-Type by hand). Checking the actual file signature (magic bytes)
// before trusting the claimed type closes that gap for the upload
// endpoints (invoice scan, receipt attach) that store the bytes to disk
// and later serve them back with that same claimed Content-Type.
const SIGNATURE_CHECKS: Record<string, (buffer: Buffer) => boolean> = {
  'application/pdf': (buf) => buf.subarray(0, 4).toString('latin1') === '%PDF',
  'image/png': (buf) => buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': (buf) => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  'image/webp': (buf) =>
    buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP',
};

export function matchesFileSignature(buffer: Buffer, claimedMimeType: string): boolean {
  const check = SIGNATURE_CHECKS[claimedMimeType];
  // No known check for this type: nothing to verify against, so don't
  // block it here — the caller's own mimetype allowlist is what actually
  // restricts which types get this far in the first place.
  return check ? check(buffer) : true;
}
