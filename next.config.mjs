import { withWorkflow } from "workflow/next";
/** @type {import('next').NextConfig} */
const nextConfig = {
  // PDF.js resolves its legacy worker relative to the package at runtime.
  // Keep the package external and include that worker in the Vercel function.
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/*": ["./node_modules/pdfjs-dist/legacy/build/*.mjs"],
  },
};

export default withWorkflow(nextConfig);
