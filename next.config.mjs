/** @type {import('next').NextConfig} */
const allowInlineScripts = process.env.NEXT_PUBLIC_E2E === 'true' || process.env.NODE_ENV !== 'production';

const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  async headers() {
    const scriptSrc = ["'self'", 'https://pagead2.googlesyndication.com', 'https://securepubads.g.doubleclick.net'];
    if (allowInlineScripts) {
      scriptSrc.push("'unsafe-inline'");
    }
    const connectSrc = [
      "'self'",
      'https://oauth2.googleapis.com',
      'https://accounts.google.com',
      'https://pagead2.googlesyndication.com',
      'https://googleads.g.doubleclick.net',
      'https://securepubads.g.doubleclick.net',
    ];
    const frameSrc = [
      "'self'",
      'https://googleads.g.doubleclick.net',
      'https://tpc.googlesyndication.com',
      'https://pagead2.googlesyndication.com',
    ];

    const securityHeaders = [
      {
        key: 'Content-Security-Policy',
        value: [
          "default-src 'self'",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com https://r2cdn.perplexity.ai",
          "img-src 'self' data: https://*",
          `connect-src ${connectSrc.join(' ')}`,
          `script-src ${scriptSrc.join(' ')}`,
          `frame-src ${frameSrc.join(' ')}`,
          "frame-ancestors 'self' https://carter-portfolio.fyi",
          "base-uri 'self'",
          "form-action 'self' https://accounts.google.com",
        ].join('; '),
      },
      {
        key: 'Cross-Origin-Opener-Policy',
        value: 'same-origin',
      },
      {
        key: 'Cross-Origin-Embedder-Policy',
        value: 'require-corp',
      },
      {
        key: 'Cross-Origin-Resource-Policy',
        value: 'same-origin',
      },
      {
        key: 'Referrer-Policy',
        value: 'strict-origin-when-cross-origin',
      },
      {
        key: 'Permissions-Policy',
        value:
          'accelerometer=(), autoplay=(), camera=(), clipboard-write=(self), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
      },
      {
        key: 'X-Content-Type-Options',
        value: 'nosniff',
      },
      {
        key: 'Strict-Transport-Security',
        value: 'max-age=31536000; includeSubDomains',
      },
    ];

    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
