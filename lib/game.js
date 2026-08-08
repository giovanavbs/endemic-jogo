const crypto = require('crypto');
const { Redis } = require('@upstash/redis');

const PEOPLE = ['Deusa da sabedoria','Extasimus','Deusa da morte','Diabo','Bibliotecária','Pescador','Coveiro','Padre','Enfermeira','Mineradora','Mercadora','Fazendeira','Taverneiro','Xerife','Escritora'];
const ACTIONS = ['atacou','explodiu','se infiltrou','reformou','matou'];
const PLACES = ['biblioteca','mercado','taverna','igreja','cemitério','docas','minas','enfermaria','floresta'];
const WEAPONS = ['facão','espada','foice','picareta','enxada','pá','machado','arma'];
const TYPES = ['invisível','quebrada','amaldiçoada','ouro','diamante','ferro','inquebrável'];
const ROLES = { magistrada: 2, infiltrado: 4, mascarado: 10 };
const KEY = 'anfitriao-caotico:game';

function redis() {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL;

  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN;

  if (!url || !token) return null;

  return new Redis({
    url,
    token
  });
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function makeEvent() {
  const mode = Math.floor(Math.random() * 3);
  if (mode === 0) {
    const person = pick(PEOPLE), action = pick(ACTIONS), place = pick(PLACES);
    return { text: `${person} ${action} ${place}`, mode: 'pessoa-acao-lugar', person, action, place };
  }
  if (mode === 1) {
    const person = pick(PEOPLE), weapon = pick(WEAPONS), type = pick(TYPES);
    return { text: `${person} tem ${weapon} ${type}`, mode: 'pessoa-arma-tipo', person, weapon, type };
  }
  let a = pick(PEOPLE), b = pick(PEOPLE); while (b === a) b = pick(PEOPLE);
  const action = pick(ACTIONS);
  return { text: `${a} ${action} ${b}`, mode: 'pessoa-acao-pessoa', person: a, action, target: b };
}

function sanitizePlayer(p) {
  return { id: p.id, name: p.name, role: p.role, joinedAt: p.joinedAt };
}

function publicState(game) {
  if (!game) return { exists: false, active: false, round: 0, players: [], counts: { magistrada:0, infiltrado:0, mascarado:0 } };
  const counts = { magistrada:0, infiltrado:0, mascarado:0 };
  game.players.forEach(p => counts[p.role]++);
  return {
    exists: true, active: !!game.active, round: game.round,
    startedAt: game.startedAt,
    counts, players: game.players.map(sanitizePlayer),
    winner: game.winner || null,
    finished: !!game.finished
  };
}

function buildDecks() {
  return [
    {
      id: 1,
      title: 'DECK 1',
      subtitle: 'PERSON × ACTION × PLACE',
      groups: [
        { label: 'PEOPLE', items: PEOPLE },
        { label: 'ACTIONS', items: ACTIONS },
        { label: 'PLACES', items: PLACES }
      ]
    },
    {
      id: 2,
      title: 'DECK 2',
      subtitle: 'PERSON × WEAPON × TYPE',
      groups: [
        { label: 'PEOPLE', items: PEOPLE },
        { label: 'WEAPONS', items: WEAPONS },
        { label: 'TYPES', items: TYPES }
      ]
    },
    {
      id: 3,
      title: 'DECK 3',
      subtitle: 'PERSON × ACTION × PERSON',
      groups: [
        { label: 'PEOPLE', items: PEOPLE },
        { label: 'ACTIONS', items: ACTIONS },
        { label: 'TARGET / PERSON', items: PEOPLE }
      ]
    }
  ];
}

function roleView(game, role, playerId = null) {
  if (!game || !game.active || !game.event) return { available:false };
  const decks = buildDecks();
  if (role === 'mascarado') return {
    available:true,
    role,
    event: game.event.text,
    description:'Você recebe o evento completo. Abra os decks para consultar todas as opções.',
    decks
  };
  if (role === 'magistrada') {
    let clue;
    if (game.event.mode === 'pessoa-acao-lugar') clue = `A pessoa foi: ${game.event.person}`;
    else if (game.event.mode === 'pessoa-arma-tipo') clue = `A pessoa foi: ${game.event.person}`;
    else clue = `A pessoa que iniciou o evento foi: ${game.event.person}`;
    return {
      available:true,
      role,
      event: clue,
      description:'Você recebe uma parte do evento. Os três decks também estão disponíveis para consulta.',
      decks,
      magistradaGuess: playerId && game.magistradaGuesses ? (game.magistradaGuesses[playerId] || ['', '', '', '']) : ['', '', '', '']
    };
  }
  if (role === 'infiltrado') {
    return {
      available:true,
      role,
      description:'Você recebe todas as possibilidades. Abra os decks e descubra o evento sem revelar sua identidade.',
      possibilities:{ people:PEOPLE, actions:ACTIONS, places:PLACES, weapons:WEAPONS, types:TYPES },
      decks,
      mode: game.event.mode
    };
  }
  return { available:false };
}

function sign(payload) {
  const secret = process.env.ADMIN_PASSWORD || 'CAOS-2026';
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}
function verify(token) {
  try {
    if (!token) return false;
    const [data, sig] = token.split('.');
    const secret = process.env.ADMIN_PASSWORD || 'CAOS-2026';
    const expected = crypto.createHmac('sha256', secret).update(data).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    return payload.admin === true && payload.exp > Date.now();
  } catch { return false; }
}

async function getGame() {
  const r = redis();
  if (!r) return null;
  return await r.get(KEY);
}
async function saveGame(game) {
  const r = redis();
  if (!r) throw new Error('Redis não configurado. Conecte o Upstash Redis ao projeto.');
  await r.set(KEY, game);
  return game;
}
function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return {};
}
function cookie(req, name) {
  const raw = req.headers.cookie || '';
  const item = raw.split(';').map(x => x.trim()).find(x => x.startsWith(name + '='));
  return item ? decodeURIComponent(item.substring(name.length + 1)) : null;
}
function requireAdmin(req) { return verify(cookie(req, 'admin_session')); }

module.exports = { PEOPLE,ACTIONS,PLACES,WEAPONS,TYPES,ROLES,KEY,makeEvent,getGame,saveGame,publicState,roleView,parseBody,sign,requireAdmin,redis };
