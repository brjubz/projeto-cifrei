// Envia push notifications pendentes — roda via GitHub Actions (cron a cada 15min)
const admin = require('firebase-admin');
const webpush = require('web-push');

const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error('❌ VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY são obrigatórios.');
  process.exit(1);
}

webpush.setVapidDetails('mailto:cifrei@noreply.app', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function resolverSubscriptions(destino, escaladaData, destinoLogin) {
  const tokensSnap = await db.collection('push_subscriptions').get();
  const subs = [];
  tokensSnap.forEach(d => {
    const s = d.data();
    if (s.subscription) subs.push(s);
  });

  if (destino === 'todos') return subs;

  if (destino === 'usuario') {
    // destinoLogin guarda o nome do músico (do select de avatars_musicos)
    return subs.filter(s => s.login === destinoLogin || s.nome === destinoLogin);
  }

  if (destino === 'escalada' && escaladaData) {
    const escSnap = await db.collection('escalas').get();
    let membros = [];
    escSnap.forEach(d => {
      const e = d.data();
      if (e.data === escaladaData && e.funcoes) {
        membros = e.funcoes.map(f => (f.nome || '').toLowerCase().trim()).filter(Boolean);
      }
    });
    if (!membros.length) return [];

    // Resolve nomes → logins via coleção usuarios
    const usersSnap = await db.collection('usuarios').get();
    const nomeParaLogin = {};
    usersSnap.forEach(d => {
      const u = d.data();
      if (u.nome) nomeParaLogin[u.nome.toLowerCase().trim()] = u.login;
    });

    const logins = new Set(membros.map(n => nomeParaLogin[n]).filter(Boolean));
    return subs.filter(s => logins.has(s.login));
  }

  return [];
}

async function main() {
  const agora = Date.now();
  const filaSnap = await db.collection('notificacoes_config').get();

  const pendentes = [];
  filaSnap.forEach(d => {
    const n = { id: d.id, ...d.data() };
    if (n.tipo === 'push_job' && n.status === 'pendente' && (n.agendadoPara || 0) <= agora) pendentes.push(n);
  });

  if (!pendentes.length) { console.log('✅ Nenhuma notificação pendente.'); process.exit(0); }
  console.log(`📣 ${pendentes.length} notificação(ões) para enviar.`);

  for (const notif of pendentes) {
    console.log(`\n→ Enviando: "${notif.titulo}" (${notif.destino})`);
    await db.collection('notificacoes_config').doc(notif.id).update({ status: 'enviando' });

    let subs = [];
    try {
      subs = await resolverSubscriptions(notif.destino, notif.escaladaData || null, notif.destinoLogin || null);
    } catch(e) {
      console.error('  ❌ Erro ao resolver destinatários:', e.message);
      await db.collection('notificacoes_config').doc(notif.id).update({ status: 'erro', erros: [e.message], enviadaEm: Date.now() });
      continue;
    }

    console.log(`  📱 Dispositivos: ${subs.length}`);
    let enviadas = 0, falhas = 0;
    const erros = [];

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          sub.subscription,
          JSON.stringify({ title: notif.titulo, body: notif.corpo, url: notif.url || '/', tag: notif.id })
        );
        enviadas++;
      } catch(e) {
        falhas++;
        // Subscription expirada — remove
        if (e.statusCode === 410 || e.statusCode === 404) {
          await db.collection('push_subscriptions').doc(sub.login).delete().catch(() => {});
          erros.push(`${sub.login}: subscription expirada (removida)`);
        } else {
          erros.push(`${sub.login}: ${e.message}`);
        }
      }
    }

    await db.collection('notificacoes_config').doc(notif.id).update({
      status: falhas === subs.length && subs.length > 0 ? 'erro' : 'enviada',
      enviadaEm: Date.now(),
      totalEnviadas: enviadas,
      totalFalhas: falhas,
      erros: erros.length ? erros : [],
    });
    console.log(`  ✅ Enviadas: ${enviadas} | ❌ Falhas: ${falhas}`);
  }

  console.log('\n🎉 Processamento concluído.');
  process.exit(0);
}

main().catch(e => { console.error('❌ Erro fatal:', e.message); process.exit(1); });
