const crypto = require('crypto');
const { ROLES, DEFAULT_ROLE_LIMITS, makeEvent, getGame, saveGame, publicState, roleView, parseBody, requireAdmin, adminSessionId, getSettings } = require('../lib/game');

function id() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control','no-store');
  try {
    const action = req.query.action || 'state';
    let game = await getGame();

    if (action === 'state') return res.status(200).json(publicState(game));

    if (action === 'admin-state') {
      if (!requireAdmin(req)) return res.status(401).json({ error:'Não autorizado.' });
      if (!game) return res.status(200).json({ ...publicState(game), event:null, magistradaGuesses:{} });
      return res.status(200).json({ ...publicState(game), event: game.event || null, players: game.players, magistradaGuesses: game.magistradaGuesses || {} });
    }

    if (action === 'start') {
      if (!requireAdmin(req)) return res.status(401).json({ error:'Não autorizado.' });
      const previousRound = game?.round || 0;
      const settings = getSettings(game);
      game = { active:true, finished:false, round:previousRound+1, startedAt:Date.now(), event:makeEvent(), players:[], winner:null, magistradaGuesses:{}, startedByAdminSession:adminSessionId(req), adminJoinNotice:null, settings };
      await saveGame(game);
      return res.status(200).json(publicState(game));
    }

    if (action === 'settings') {
      if (!requireAdmin(req)) return res.status(401).json({ error:'Não autorizado.' });
      const body = parseBody(req);
      const current = getSettings(game);
      const warning = body.adminJoinWarning === undefined ? current.adminJoinWarning : !!body.adminJoinWarning;
      const roleLimits = { ...current.roleLimits };
      const requested = body.roleLimits || {};
      for (const role of Object.keys(DEFAULT_ROLE_LIMITS)) {
        if (requested[role] !== undefined) {
          const value = Number(requested[role]);
          if (!Number.isInteger(value) || value < DEFAULT_ROLE_LIMITS[role] || value > 100) {
            return res.status(400).json({ error:`O limite de ${role} deve estar entre ${DEFAULT_ROLE_LIMITS[role]} e 100.` });
          }
          const currentCount = game?.players?.filter(p => p.role === role).length || 0;
          if (value < currentCount) return res.status(400).json({ error:`Não é possível colocar ${role} em ${value} enquanto existem ${currentCount} jogadores desse cargo na rodada atual.` });
          roleLimits[role] = value;
        }
      }
      const settings = { adminJoinWarning: warning, roleLimits };
      if (!game) game = { active:false, finished:false, round:0, startedAt:null, event:null, players:[], winner:null, magistradaGuesses:{}, startedByAdminSession:null, adminJoinNotice:null, settings };
      else game.settings = settings;
      await saveGame(game);
      return res.status(200).json({ ok:true, settings });
    }

    if (action === 'finish') {
      if (!requireAdmin(req)) return res.status(401).json({ error:'Não autorizado.' });
      if (!game) return res.status(400).json({ error:'Nenhum jogo iniciado.' });
      game.active=false; game.finished=true;
      await saveGame(game);
      return res.status(200).json(publicState(game));
    }

    if (action === 'reset') {
      if (!requireAdmin(req)) return res.status(401).json({ error:'Não autorizado.' });
      game = { active:false, finished:false, round:0, startedAt:null, event:null, players:[], winner:null, magistradaGuesses:{}, startedByAdminSession:null, adminJoinNotice:null, settings:getSettings(game) };
      await saveGame(game);
      return res.status(200).json(publicState(game));
    }

    if (action === 'reset-round') {
      if (!requireAdmin(req)) return res.status(401).json({ error:'Não autorizado.' });
      if (!game) return res.status(400).json({ error:'Nenhuma rodada iniciada.' });
      const previousRound = Math.max(0, (game.round || 0) - 1);
      game = {
        active:false,
        finished:false,
        round:previousRound,
        startedAt:null,
        event:null,
        players:[],
        winner:null,
        magistradaGuesses:{},
        startedByAdminSession:null,
        adminJoinNotice:null,
        settings:getSettings(game)
      };
      await saveGame(game);
      return res.status(200).json(publicState(game));
    }

    if (action === 'join') {
      if (!game?.active) return res.status(400).json({ error:'O ADM ainda não iniciou uma rodada.' });
      const body = parseBody(req);
      const name = String(body.name || '').trim().slice(0, 32);
      const role = String(body.role || '').trim();
      if (!name) return res.status(400).json({ error:'Digite seu nome.' });
      if (!ROLES[role]) return res.status(400).json({ error:'Escolha um cargo.' });
      const limits = getSettings(game).roleLimits;
      const count = game.players.filter(p => p.role === role).length;
      if (count >= limits[role]) return res.status(409).json({ error:'Esse cargo já está cheio.' });
      const currentAdminSession = adminSessionId(req);
      const isRoundAdmin = !!currentAdminSession && currentAdminSession === game.startedByAdminSession;
      const player = { id:id(), name, role, guess:null, joinedAt:Date.now(), isAdminPlayer:isRoundAdmin };
      game.players.push(player);
      if (isRoundAdmin && getSettings(game).adminJoinWarning) {
        game.adminJoinNotice = { id: (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`), at: Date.now(), name };
      }
      await saveGame(game);
      return res.status(200).json({ playerId:player.id, roleView:roleView(game, role, player.id), state:publicState(game) });
    }

    if (action === 'role-view') {
      const body = parseBody(req);
      const player = game?.players?.find(p => p.id === body.playerId);
      if (!player) return res.status(404).json({ error:'Jogador não encontrado.' });
      return res.status(200).json({ player, roleView:roleView(game, player.role, player.id), state:publicState(game) });
    }

    if (action === 'guess') {
      const body = parseBody(req);
      const player = game?.players?.find(p => p.id === body.playerId);
      if (!player) return res.status(404).json({ error:'Jogador não encontrado.' });
      if (player.role !== 'infiltrado') return res.status(403).json({ error:'Apenas infiltrados podem registrar um chute.' });
      player.guess = { text:String(body.guess || '').trim().slice(0, 200), at:Date.now() };
      await saveGame(game);
      return res.status(200).json({ ok:true, player, state:publicState(game) });
    }

    if (action === 'magistrada-guess') {
      const body = parseBody(req);
      const player = game?.players?.find(p => p.id === body.playerId);
      if (!player) return res.status(404).json({ error:'Jogadora não encontrada.' });
      if (player.role !== 'magistrada') return res.status(403).json({ error:'Apenas magistradas podem registrar esse palpite.' });
      const guesses = Array.isArray(body.guesses) ? body.guesses : [];
      if (guesses.length !== 4) return res.status(400).json({ error:'Informe os 4 nomes dos infiltrados.' });
      const clean = guesses.map(x => String(x || '').trim().slice(0, 32));
      if (clean.some(x => !x)) return res.status(400).json({ error:'Preencha os 4 nomes dos infiltrados.' });
      game.magistradaGuesses = game.magistradaGuesses || {};
      game.magistradaGuesses[player.id] = clean;
      await saveGame(game);
      return res.status(200).json({ ok:true, guesses:clean, state:publicState(game) });
    }

    return res.status(404).json({ error:'Ação desconhecida.' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error:e.message || 'Erro interno.' });
  }
};
