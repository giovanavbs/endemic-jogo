let timer;const $=s=>document.querySelector(s);
function setStatus(msg, kind=''){const el=$('#adminStatus');if(!el)return;el.textContent=msg;el.className=kind?`admin-status ${kind}`:'admin-status';}
async function req(url,opts={}){const r=await fetch(url,{...opts,headers:{'Content-Type':'application/json',...(opts.headers||{})}});let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||`Erro ${r.status}`);return d}
$('#loginBtn').onclick=async()=>{try{await req('/api/admin-login',{method:'POST',body:JSON.stringify({password:$('#password').value})});$('#login').classList.add('hidden');$('#dashboard').classList.remove('hidden');refresh()}catch(e){$('#loginMsg').textContent=e.message}};
$('#password').onkeydown=e=>{if(e.key==='Enter')$('#loginBtn').click()};
async function refresh(){try{const s=await req('/api/game?action=admin-state');$('#round').textContent=s.round||'—';$('#total').textContent=s.players.length;$('#cMag').textContent=s.counts.magistrada+'/2';$('#cInf').textContent=s.counts.infiltrado+'/4';$('#cMas').textContent=s.counts.mascarado+'/10';$('#event').innerHTML=s.event?.text
  ? `<div>${esc(s.event.text)}</div><div class="event-deck">BARALHO USADO: ${s.event.deck ? `BARALHO ${s.event.deck}` : deckName(s.event.mode)}</div>`
  : 'Nenhum jogo iniciado.';const box=$('#players');box.innerHTML='';s.players.forEach(p=>{const el=document.createElement('div');el.className='player';el.innerHTML=`<span><b>${esc(p.name)}</b><br><em>${p.role.toUpperCase()}</em>${p.guess?.text?`<div class="guess">CHUTE: ${esc(p.guess.text)}</div>`:''}</span><span>#${p.id.slice(-4)}</span>`;box.appendChild(el)});const mg=$('#magGuesses');const entries=Object.entries(s.magistradaGuesses||{});if(!entries.length){mg.textContent='Nenhum palpite registrado.'}else{mg.innerHTML='';entries.forEach(([playerId,guesses])=>{const p=s.players.find(x=>x.id===playerId);const el=document.createElement('div');el.className='mag-guess-admin';el.innerHTML=`<b>${esc(p?.name||'Magistrada')}</b><ol>${guesses.map(g=>`<li>${esc(g)}</li>`).join('')}</ol>`;mg.appendChild(el)})}}catch(e){if(e.message.includes('Não autorizado')){$('#dashboard').classList.add('hidden');$('#login').classList.remove('hidden')}else $('#event').textContent=e.message}}
function deckName(mode){
  return mode==='pessoa-acao-lugar' ? 'BARALHO 1' :
         mode==='pessoa-arma-tipo' ? 'BARALHO 2' :
         mode==='pessoa-acao-pessoa' ? 'BARALHO 3' : 'NÃO IDENTIFICADO';
}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
$('#start').onclick=async()=>{if(!confirm('Iniciar uma nova rodada? A rodada atual e seus jogadores serão substituídos.'))return;try{await req('/api/game?action=start',{method:'POST'});setStatus('✓ Nova rodada iniciada.','success');refresh()}catch(e){setStatus(e.message,'error')}};
$('#finish').onclick=async()=>{if(!confirm('Encerrar a rodada atual? Os jogadores não poderão mais acessar as informações desta rodada.'))return;try{await req('/api/game?action=finish',{method:'POST'});setStatus('✓ Rodada encerrada. Clique em “INICIAR NOVO JOGO” para começar a próxima rodada.','success');refresh()}catch(e){setStatus(e.message,'error')}};

$('#reset').onclick=async()=>{if(!confirm('Resetar completamente o jogo e voltar a rodada para ZERO? Isso apagará os jogadores e o evento atual.'))return;try{await req('/api/game?action=reset',{method:'POST'});setStatus('✓ Jogo resetado. A próxima rodada começará no número 1.','success');refresh()}catch(e){setStatus(e.message,'error')}};
