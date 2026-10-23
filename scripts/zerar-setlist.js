// Zeragem automática do setlist — roda via GitHub Actions domingo 23h59 (BRT)
const admin = require('firebase-admin');

const SETLIST_PLACEHOLDER = '___SETLIST_VAZIO___';
const GIST_ID_SETLIST = process.env.GIST_ID_SETLIST || '4ddc9a95ef4e523dcafff049a31caeb2';
const GIST_TOKEN = process.env.GIST_TOKEN;

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// Mesmo formato que parseSongs no admin: separador --END--, title na 1ª linha
function parseSongs(raw) {
  if (!raw || raw === SETLIST_PLACEHOLDER) return [];
  const songs = [];
  const blocks = raw.split('--END--');
  for (const b of blocks) {
    const c = b.trim();
    if (!c) continue;
    const lines = c.split('\n');
    let title = 'Sem título';
    for (const l of lines) {
      if (l.trim()) { title = l.trim(); break; }
    }
    const artistMatch = c.match(/^\[ARTIST:(.*?)\]/m);
    const verified = /\(verificado\)/i.test(title);
    const cleanTitle = title.replace(/\s*\(verificado\)/i, '').trim();
    songs.push({
      title: cleanTitle,
      verified,
      artist: artistMatch ? artistMatch[1].trim() : '',
      key: '-',
    });
  }
  return songs;
}

// Data do domingo atual no fuso horário de Brasília (UTC-3)
function getSundayDateBRT() {
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const dayOfWeek = brt.getUTCDay(); // 0 = domingo
  const sunday = new Date(brt);
  sunday.setUTCDate(brt.getUTCDate() - dayOfWeek);
  return sunday.toISOString().slice(0, 10);
}

async function updateGist(content) {
  if (!GIST_TOKEN) {
    console.warn('⚠️  GIST_TOKEN não configurado — Gist não foi zerado');
    return;
  }
  const res = await fetch(`https://api.github.com/gists/${GIST_ID_SETLIST}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `token ${GIST_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'cifrei-zerar-setlist',
    },
    body: JSON.stringify({ files: { 'setlist.txt': { content } } }),
  });
  if (!res.ok) throw new Error(`Gist update falhou: ${res.status} ${await res.text()}`);
}

async function main() {
  console.log('🕛 Iniciando zeragem do setlist...');

  // 1. Ler setlist atual do Firestore
  const setlistRef = db.collection('salas').doc('setlist_musico');
  const snap = await setlistRef.get();
  const songs = snap.exists ? parseSongs(snap.data()?.content || '') : [];
  console.log(`📋 Setlist: ${songs.length} música(s)`);

  // 2. Salvar histórico (apenas se houver músicas)
  if (songs.length > 0) {
    const key = getSundayDateBRT();
    const dataObj = new Date(key + 'T12:00:00Z');
    const dataFormatada = dataObj.toLocaleDateString('pt-BR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
    await db.collection('historico_setlists').doc(key).set({
      data: key,
      dataFormatada,
      musicas: songs.map(s => ({
        title: String(s.title || ''),
        key: String(s.key || ''),
        artist: String(s.artist || ''),
        verified: s.verified === true,
      })),
      total: songs.length,
      timestamp: Date.now(),
    });
    console.log(`✅ Histórico salvo: ${key} — ${songs.length} músicas`);
  } else {
    console.log('⚠️  Setlist vazio, histórico não salvo');
  }

  // 3. Zerar Gist com placeholder
  await updateGist(SETLIST_PLACEHOLDER);
  console.log('✅ Gist zerado');

  // 4. Apagar setlist_musico do Firestore
  if (snap.exists) await setlistRef.delete();
  console.log('✅ setlist_musico apagado');

  // 5. Sinalizar todos os dispositivos
  await db.collection('salas').doc('adm_update').set({
    updatedAt: Date.now(),
    tipo: 'setlist',
    setlistContent: SETLIST_PLACEHOLDER,
    savedBy: 'auto',
  });
  console.log('✅ adm_update sinalizado — todos os dispositivos notificados');

  console.log('🎉 Zeragem concluída!');
  process.exit(0);
}

main().catch(e => {
  console.error('❌ Erro na zeragem:', e.message);
  process.exit(1);
});
