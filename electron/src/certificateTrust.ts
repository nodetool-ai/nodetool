import { readFileSync } from "node:fs";
import { getCACertificates, setDefaultCACertificates } from "node:tls";

/** The hardened Electron fuse strips NODE_EXTRA_CA_CERTS before JavaScript starts. */
export function configureCertificateTrust(): void {
  const certificateFile = process.env.NODETOOL_EXTRA_CA_CERTS;
  if (!certificateFile) {
    return;
  }
  const pem = readFileSync(certificateFile, "utf8");
  const certificates = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
  if (!certificates?.length) {
    throw new Error("NODETOOL_EXTRA_CA_CERTS contains no PEM certificates");
  }
  setDefaultCACertificates([...getCACertificates("default"), ...certificates]);
}
