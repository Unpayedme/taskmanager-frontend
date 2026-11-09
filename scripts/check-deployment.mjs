import { deploymentConfig } from "../server/api-proxy.mjs";
try {
  deploymentConfig();
  console.log(
    "Vercel API proxy configuration is valid. Secrets are server-only."
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
