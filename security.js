const helmet = require('helmet');

function policy(https) {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        // React and the existing layout use inline styles, not inline scripts.
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        workerSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: https ? [] : null
      }
    },
    strictTransportSecurity: https ? { maxAge: 31536000, includeSubDomains: false } : false,
    xFrameOptions: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
  });
}

const httpPolicy = policy(false);
const httpsPolicy = policy(true);
function securityHeaders(req, res, next) {
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  return (req.secure ? httpsPolicy : httpPolicy)(req, res, next);
}

function contactOriginGuard(req, res, next) {
  if (req.method !== 'POST') return next();
  const origin = req.get('origin');
  const expected = `${req.protocol}://${req.get('host')}`;
  if (req.get('sec-fetch-site') === 'cross-site' || (origin && origin !== expected)) {
    return res.status(403).json({ ok: false, code: 'ORIGIN_REJECTED' });
  }
  // Requests without browser headers still need the rate limit and field validation.
  return next();
}

module.exports = { securityHeaders, contactOriginGuard };
