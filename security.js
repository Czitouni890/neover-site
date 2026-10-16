const helmet = require('helmet');

function policy(https) {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        workerSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: https ? [] : null
      }
    },
    strictTransportSecurity: https ? { maxAge: 31536000, includeSubDomains: false } : false,
    xFrameOptions: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' }
  });
}

const httpPolicy = policy(false);
const httpsPolicy = policy(true);
function securityHeaders(req, res, next) {
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  return (req.secure ? httpsPolicy : httpPolicy)(req, res, next);
}

module.exports = { securityHeaders };
