const crypto = require('crypto');
const { Redis } = require('@upstash/redis');

const PEOPLE = ['Deusa da sabedoria','Extasimus','Deusa da morte','Diabo','Bibliotecária','Pescador','Coveiro','Padre','Enfermeira','Mineradora','Mercadora','Fazendeira','Taverneiro','Xerife','Escritora'];
const ACTIONS = ['atacou','explodiu','se infiltrou','reformou','matou'];
const REFORMABLE_PLACES = new Set(['biblioteca','mercado','taverna','igreja','cemitério','enfermaria']);
const PLACE_ACTIONS = ['atacou','explodiu','se escondeu'];
const PERSON_ACTIONS = ['atacou','se infiltrou','matou'];
const PLACES = ['biblioteca','mercado','taverna','igreja','cemitério','docas','minas','enfermaria','floresta'];
const WEAPONS = ['facão','espada','foice','picareta','enxada','pá','machado','arma'];
const TYPES = ['invisível','quebrada','amaldiçoada','ouro','diamante','ferro','inquebrável'];
const DEFAULT_ROLE_LIMITS = { magistrada: 2, infiltrado: 4, mascarado: 10 };
const ROLES = DEFAULT_ROLE_LIMITS;
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
const PLACE_PREPOSITIONS = {
  biblioteca: 'na biblioteca',
  mercado: 'no mercado',
  taverna: 'na taverna',
  igreja: 'na igreja',
  'cemitério': 'no cemitério',
  docas: 'nas docas',
  minas: 'nas minas',
  enfermaria: 'na enfermaria',
  floresta: 'na floresta'
};

const WEAPON_ARTICLES = {
  facão: 'um facão',
  espada: 'uma espada',
  foice: 'uma foice',
  picareta: 'uma picareta',
  enxada: 'uma enxada',
  pá: 'uma pá',
  machado: 'um machado',
  arma: 'uma arma'
};

const FEMININE_WEAPONS = new Set(['espada', 'foice', 'picareta', 'enxada', 'pá', 'arma']);

function weaponPhrase(weapon, type) {
  const articleWeapon = WEAPON_ARTICLES[weapon] || `uma ${weapon}`;
  if (['ouro', 'diamante', 'ferro'].includes(type)) return `${articleWeapon} de ${type}`;
  if (type === 'invisível' || type === 'inquebrável') return `${articleWeapon} ${type}`;
  if (type === 'quebrada') return `${articleWeapon} ${FEMININE_WEAPONS.has(weapon) ? 'quebrada' : 'quebrado'}`;
  if (type === 'amaldiçoada') return `${articleWeapon} ${FEMININE_WEAPONS.has(weapon) ? 'amaldiçoada' : 'amaldiçoado'}`;
  return `${articleWeapon} ${type}`;
}

function placePhrase(action, place) {
  const destination = PLACE_PREPOSITIONS[place] || `em ${place}`;
  if (action === 'se infiltrou') return `se infiltrou ${destination}`;
  const object = {
    biblioteca: 'a biblioteca',
    mercado: 'o mercado',
    taverna: 'a taverna',
    igreja: 'a igreja',
    'cemitério': 'o cemitério',
    docas: 'as docas',
    minas: 'as minas',
    enfermaria: 'a enfermaria',
    floresta: 'a floresta'
  }[place] || place;
  return `${action} ${object}`;
}

function personPhrase(action, person) {
  return action === 'se infiltrou' ? `se infiltrou em ${person}` : `${action} ${person}`;
}

function makeEvent() {
  const mode = Math.floor(Math.random() * 3);
  if (mode === 0) {
    const person = pick(PEOPLE), place = pick(PLACES);
    const validActions = REFORMABLE_PLACES.has(place) ? [...PLACE_ACTIONS, 'reformou'] : PLACE_ACTIONS;
    const action = pick(validActions);
    const text = `${person} ${placePhrase(action, place)}`;
    return { text, mode: 'pessoa-acao-lugar', deck: 1, person, action, place };
  }
  if (mode === 1) {
    const person = pick(PEOPLE), weapon = pick(WEAPONS), type = pick(TYPES);
    const text = `${person} tem ${weaponPhrase(weapon, type)}`;
    return { text, mode: 'pessoa-arma-tipo', deck: 2, person, weapon, type };
  }
  let a = pick(PEOPLE), b = pick(PEOPLE); while (b === a) b = pick(PEOPLE);
  const action = pick(PERSON_ACTIONS);
  const text = `${a} ${personPhrase(action, b)}`;
  return { text, mode: 'pessoa-acao-pessoa', deck: 3, person: a, action, target: b };
}

function sanitizePlayer(p) {
  return { id: p.id, name: p.name, role: p.role, joinedAt: p.joinedAt };
}

function getSettings(game) {
  const raw = game?.settings || {};
  return {
    adminJoinWarning: raw.adminJoinWarning !== false,
    roleLimits: {
      magistrada: Math.max(DEFAULT_ROLE_LIMITS.magistrada, Number(raw.roleLimits?.magistrada) || DEFAULT_ROLE_LIMITS.magistrada),
      infiltrado: Math.max(DEFAULT_ROLE_LIMITS.infiltrado, Number(raw.roleLimits?.infiltrado) || DEFAULT_ROLE_LIMITS.infiltrado),
      mascarado: Math.max(DEFAULT_ROLE_LIMITS.mascarado, Number(raw.roleLimits?.mascarado) || DEFAULT_ROLE_LIMITS.mascarado)
    }
  };
}

function publicState(game) {
  if (!game) return { exists: false, active: false, round: 0, players: [], counts: { magistrada:0, infiltrado:0, mascarado:0 }, limits: { ...DEFAULT_ROLE_LIMITS }, settings: { adminJoinWarning: true, roleLimits: { ...DEFAULT_ROLE_LIMITS } } };
  const counts = { magistrada:0, infiltrado:0, mascarado:0 };
  const settings = getSettings(game);
  game.players.forEach(p => counts[p.role]++);
  return {
    exists: true, active: !!game.active, round: game.round,
    startedAt: game.startedAt,
    counts, limits: settings.roleLimits, settings: { adminJoinWarning: settings.adminJoinWarning, roleLimits: settings.roleLimits }, players: game.players.map(sanitizePlayer),
    winner: game.winner || null,
    finished: !!game.finished,
    answer: game.finished && game.event ? game.event.text : null,
    adminJoinNotice: game.adminJoinNotice || null
  };
}

function buildDecks() {
  return [
    {
      id: 1,
      title: 'BARALHO 1',
      subtitle: 'PESSOA × AÇÃO × LUGAR',
      groups: [
        { label: 'PESSOAS', items: PEOPLE },
        { label: 'AÇÕES', items: ACTIONS },
        { label: 'LUGARES', items: PLACES }
      ]
    },
    {
      id: 2,
      title: 'BARALHO 2',
      subtitle: 'PESSOA × ARMA × TIPO',
      groups: [
        { label: 'PESSOAS', items: PEOPLE },
        { label: 'ARMAS', items: WEAPONS },
        { label: 'TIPOS', items: TYPES }
      ]
    },
    {
      id: 3,
      title: 'BARALHO 3',
      subtitle: 'PESSOA × AÇÃO × PESSOA',
      groups: [
        { label: 'PESSOAS', items: PEOPLE },
        { label: 'AÇÕES', items: ACTIONS },
        { label: 'ALVO / PESSOA', items: PEOPLE }
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
function adminSessionId(req) {
  const token = cookie(req, 'admin_session');
  if (!token || !verify(token)) return null;
  return crypto.createHash('sha256').update(token).digest('hex');
}
function requireAdmin(req) { return !!adminSessionId(req); }

module.exports = { PEOPLE,ACTIONS,PLACES,WEAPONS,TYPES,ROLES,DEFAULT_ROLE_LIMITS,KEY,makeEvent,getSettings,getGame,saveGame,publicState,roleView,parseBody,sign,requireAdmin,adminSessionId,redis };
