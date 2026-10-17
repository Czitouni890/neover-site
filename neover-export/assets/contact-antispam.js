import '/assets/antispam/widget.js';
import '/assets/antispam/fr.js';

globalThis.$altcha.algorithms.set('SHA-256', () => new Worker('/assets/antispam/sha.js'));
window.neoverAntispamReady = true;
