// Gera um par de chaves VAPID para Web Push.
// Execute UMA VEZ: node scripts/gerar-vapid-keys.js
// Depois:
//   1. Cole a publicKey no Cifrei/index.html (busque por VAPID_PUBLIC_KEY)
//   2. Adicione a privateKey como segredo do GitHub: VAPID_PRIVATE_KEY

const webpush = require('web-push');
const keys = webpush.generateVAPIDKeys();
console.log('\n✅ Par de chaves VAPID gerado:\n');
console.log('VAPID_PUBLIC_KEY (cole no Cifrei/index.html):');
console.log(keys.publicKey);
console.log('\nVAPID_PRIVATE_KEY (adicione como GitHub Secret):');
console.log(keys.privateKey);
console.log('\nAdicione também VAPID_PUBLIC_KEY como GitHub Secret (usa o mesmo valor da publicKey acima).');
console.log('\n⚠️  Guarde a privateKey — ela não pode ser recuperada depois!\n');
