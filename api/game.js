const { ROLES, makeEvent, getGame, saveGame, publicState, roleView, parseBody, requireAdmin } = require('../lib/game');

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
      game = { active:true, finished:false, round:previousRound+1, startedAt:Date.now(), event:makeEvent(), players:[], winner:null, magistradaGuesses:{} };
      await saveGame(game);
      return res.status(200).json(publicState(game));
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
      game = { active:false, finished:false, round:0, startedAt:null, event:null, players:[], winner:null, magistradaGuesses:{} };
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
        magistradaGuesses:{}
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
      const count = game.players.filter(p => p.role === role).length;
      if (count >= ROLES[role]) return res.status(409).json({ error:'Esse cargo já está cheio.' });
      const player = { id:id(), name, role, guess:null, joinedAt:Date.now() };
      game.players.push(player);
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
