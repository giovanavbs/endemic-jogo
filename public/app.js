let playerId = localStorage.getItem('caos_player');
let timer;
let currentViewKey = '';
const deckTimers = new Map();
const $=s=>document.querySelector(s);
async function api(action, options={}){const r=await fetch('/api/game?action='+encodeURIComponent(action),{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||`Erro ${r.status}`);return d}
function showError(msg){const x=$('#offline');x.textContent=msg;x.classList.remove('hidden')}
function renderCounts(s){$('#counts').textContent=`Deusas ${s.counts.magistrada}/2 · Infiltrados ${s.counts.infiltrado}/4 · Mascarados ${s.counts.mascarado}/10`;$('#round').textContent=s.round||'—'}
async function refresh(){try{const s=await api('state');renderCounts(s);
  if(s.finished && playerId){
    showFinishModal(s.answer);
    return;
  }
  if(!s.active && playerId){
    
    returnToLobby();
    return;
  }
  if(!s.active && !playerId)return;
  if(playerId){
    const d=await api('role-view',{method:'POST',body:JSON.stringify({playerId})});
    renderCounts(d.state);
    if(d.player) renderRole(d.player,d.roleView);
  }
}catch(e){if(!playerId)showError('O jogo ainda não está disponível. O ADM precisa iniciar uma rodada.')}}
function renderDecks(decks){
  if(!decks?.length)return '';
  return `<div class="decks"><div class="deck-intro">ABRA UM BARALHO PARA VER AS OPÇÕES — ELE FECHA APÓS 3 SEGUNDOS</div>${decks.map(d=>`
    <div class="deck" data-deck-id="${d.id}">
      <button class="deck-toggle" type="button" aria-expanded="false">
        <span><b>${d.title}</b><small>${d.subtitle}</small></span><strong>＋</strong>
      </button>
      <div class="deck-content hidden">
        <div class="deck-groups">${d.groups.map(g=>`<div class="deck-group"><h4>${g.label}</h4>${g.items.map(item=>`<span>${item}</span>`).join('')}</div>`).join('')}</div>
      </div>
    </div>`).join('')}</div>`;
}
function closeDeck(deck){
  const content=deck.querySelector('.deck-content');
  const btn=deck.querySelector('.deck-toggle');
  if(!content)return;
  content.classList.add('hidden');
  btn.setAttribute('aria-expanded','false');
  btn.querySelector('strong').textContent='＋';
  deckTimers.delete(deck.dataset.deckId);
}
function bindDecks(){
  document.querySelectorAll('.deck-toggle').forEach(btn=>btn.addEventListener('click',()=>{
    const deck=btn.parentElement;
    const content=deck.querySelector('.deck-content');
    const id=deck.dataset.deckId;
    const open=!content.classList.contains('hidden');
    if(open){ closeDeck(deck); return; }
    document.querySelectorAll('.deck').forEach(other=>{if(other!==deck)closeDeck(other)});
    content.classList.remove('hidden');
    btn.setAttribute('aria-expanded','true');
    btn.querySelector('strong').textContent='−';
    if(deckTimers.has(id))clearTimeout(deckTimers.get(id));
    deckTimers.set(id,setTimeout(()=>closeDeck(deck),3000));
  }));
}
function renderRole(player,v){
  $('#lobby').classList.add('hidden');
  $('#game').classList.remove('hidden');
  $('#roleBadge').textContent=player.role.toUpperCase();
  const viewKey=JSON.stringify({role:player.role,event:v.event,description:v.description,decks:v.decks,magistradaGuess:v.magistradaGuess});
  if(viewKey===currentViewKey)return;
  currentViewKey=viewKey;
  const box=$('#roleContent');
  box.innerHTML='';
  const desc=document.createElement('p');
  desc.textContent=v.description||'';
  box.appendChild(desc);
  if(player.role!=='infiltrado'){
    const ev=document.createElement('div');
    ev.className='event';
    ev.textContent=v.event||'—';
    box.appendChild(ev);
  }
  if(v.decks) box.insertAdjacentHTML('beforeend',renderDecks(v.decks));
  if(player.role==='infiltrado'){
    $('#guessBox').classList.remove('hidden');
    $('#magGuessBox').classList.add('hidden');
  }else if(player.role==='magistrada'){
    $('#guessBox').classList.add('hidden');
    $('#magGuessBox').classList.remove('hidden');
    const guesses=v.magistradaGuess||['','','',''];
    document.querySelectorAll('.mag-guess').forEach((input,i)=>input.value=guesses[i]||'');
  }else{
    $('#guessBox').classList.add('hidden');
    $('#magGuessBox').classList.add('hidden');
  }
  bindDecks();
}
for(const b of document.querySelectorAll('[data-role]'))b.addEventListener('click',async()=>{try{const name=$('#name').value.trim();if(!name)return showError('Digite seu nome antes de escolher o cargo.');const d=await api('join',{method:'POST',body:JSON.stringify({name,role:b.dataset.role})});playerId=d.playerId;localStorage.setItem('caos_player',playerId);currentViewKey='';renderRole({name,role:b.dataset.role},d.roleView);renderCounts(d.state);showError('');$('#offline').classList.add('hidden')}catch(e){showError(e.message)}});
$('#sendGuess').addEventListener('click',async()=>{try{const guess=$('#guess').value.trim();if(!guess)return $('#guessStatus').textContent='Escreva seu chute primeiro.';await api('guess',{method:'POST',body:JSON.stringify({playerId,guess})});$('#guessStatus').textContent='✓ Chute registrado para o ADM.'}catch(e){$('#guessStatus').textContent=e.message}});
$('#sendMagGuess').addEventListener('click',async()=>{try{const guesses=[...document.querySelectorAll('.mag-guess')].map(x=>x.value.trim());if(guesses.some(x=>!x))return $('#magGuessStatus').textContent='Preencha os 4 nomes dos infiltrados.';await api('magistrada-guess',{method:'POST',body:JSON.stringify({playerId,guesses})});$('#magGuessStatus').textContent='✓ Palpite dos 4 infiltrados registrado para o ADM.'}catch(e){$('#magGuessStatus').textContent=e.message}});
function showFinishModal(answer){
  $('#game').classList.add('hidden');
  $('#lobby').classList.add('hidden');
  const modal=$('#finishModal');
  if(modal) {
    const answerBox=$('#finishAnswer');
    if(answerBox) answerBox.textContent=answer ? `A resposta era: ${answer}` : 'A resposta não está disponível.';
    modal.classList.remove('hidden');
  }
}
function returnToLobby(){
  playerId=null;
  localStorage.removeItem('caos_player');
  currentViewKey='';
  const modal=$('#finishModal');
  if(modal) modal.classList.add('hidden');
  $('#game').classList.add('hidden');
  $('#lobby').classList.remove('hidden');
  $('#name').value='';
  showError('');
  $('#offline').classList.add('hidden');
}
const returnLobbyBtn=$('#returnLobby');
if(returnLobbyBtn) returnLobbyBtn.addEventListener('click',returnToLobby);
const leaveBtn=$('#leave');
if(leaveBtn) leaveBtn.addEventListener('click',returnToLobby);
refresh();timer=setInterval(refresh,1500);
