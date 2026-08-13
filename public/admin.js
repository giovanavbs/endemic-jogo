let timer;const $=s=>document.querySelector(s);
function setStatus(msg, kind=''){const el=$('#adminStatus') || $('#settingsStatus');if(!el)return;el.textContent=msg;el.className=kind?`admin-status ${kind}`:'admin-status';}
async function req(url,opts={}){const r=await fetch(url,{...opts,headers:{'Content-Type':'application/json',...(opts.headers||{})}});let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||`Erro ${r.status}`);return d}
$('#loginBtn').onclick=async()=>{try{await req('/api/admin-login',{method:'POST',body:JSON.stringify({password:$('#password').value})});$('#login').classList.add('hidden');$('#dashboard').classList.remove('hidden');refresh()}catch(e){$('#loginMsg').textContent=e.message}};
$('#password').onkeydown=e=>{if(e.key==='Enter')$('#loginBtn').click()};
async function refresh(){try{const s=await req('/api/game?action=admin-state');const limits=s.limits||s.settings?.roleLimits||{magistrada:2,infiltrado:4,mascarado:10};$('#round').textContent=s.round||'—';$('#total').textContent=s.players.length;$('#totalLimit').textContent=limits.magistrada+limits.infiltrado+limits.mascarado;$('#cMag').textContent=s.counts.magistrada+'/'+limits.magistrada;$('#cInf').textContent=s.counts.infiltrado+'/'+limits.infiltrado;$('#cMas').textContent=s.counts.mascarado+'/'+limits.mascarado;$('#adminJoinWarning').checked=s.settings?.adminJoinWarning !== false;$('#limitMag').value=limits.magistrada;$('#limitInf').value=limits.infiltrado;$('#limitMas').value=limits.mascarado;$('#event').innerHTML=s.event?.text
  ? `<div>${esc(s.event.text)}</div><div class="event-deck">BARALHO USADO: ${s.event.deck ? `BARALHO ${s.event.deck}` : deckName(s.event.mode)}</div>`
  : 'Nenhum jogo iniciado.';const box=$('#players');box.innerHTML='';s.players.forEach(p=>{const el=document.createElement('div');el.className='player';el.innerHTML=`<span><b>${esc(p.name)}</b><br><em>${p.role.toUpperCase()}</em>${p.guess?.text?`<div class="guess">CHUTE: ${esc(p.guess.text)}</div>`:''}</span><span>#${p.id.slice(-4)}</span>`;box.appendChild(el)});const mg=$('#magGuesses');const entries=Object.entries(s.magistradaGuesses||{});if(!entries.length){mg.textContent='Nenhum palpite registrado.'}else{mg.innerHTML='';entries.forEach(([playerId,guesses])=>{const p=s.players.find(x=>x.id===playerId);const el=document.createElement('div');el.className='mag-guess-admin';el.innerHTML=`<b>${esc(p?.name||'Magistrada')}</b><ol>${guesses.map(g=>`<li>${esc(g)}</li>`).join('')}</ol>`;mg.appendChild(el)})}}catch(e){if(e.message.includes('Não autorizado')){$('#dashboard').classList.add('hidden');$('#login').classList.remove('hidden')}else $('#event').textContent=e.message}}
function deckName(mode){
  return mode==='pessoa-acao-lugar' ? 'BARALHO 1' :
         mode==='pessoa-arma-tipo' ? 'BARALHO 2' :
         mode==='pessoa-acao-pessoa' ? 'BARALHO 3' : 'NÃO IDENTIFICADO';
}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
$('#saveSettings').onclick=async()=>{
  try{
    const payload={adminJoinWarning:$('#adminJoinWarning').checked,roleLimits:{magistrada:Number($('#limitMag').value),infiltrado:Number($('#limitInf').value),mascarado:Number($('#limitMas').value)}};
    const d=await req('/api/game?action=settings',{method:'POST',body:JSON.stringify(payload)});
    $('#limitMag').value=d.settings.roleLimits.magistrada;$('#limitInf').value=d.settings.roleLimits.infiltrado;$('#limitMas').value=d.settings.roleLimits.mascarado;
    setStatus('✓ Configurações salvas.','success');
  }catch(e){setStatus(e.message,'error');}
};
$('#start').onclick=async()=>{if(!confirm('Iniciar uma nova rodada? A rodada atual e seus jogadores serão substituídos.'))return;try{await req('/api/game?action=start',{method:'POST'});setStatus('✓ Nova rodada iniciada.','success');refresh()}catch(e){setStatus(e.message,'error')}};
$('#finish').onclick=async()=>{if(!confirm('Encerrar a rodada atual? Os jogadores não poderão mais acessar as informações desta rodada.'))return;try{await req('/api/game?action=finish',{method:'POST'});setStatus('✓ Rodada encerrada. Clique em “INICIAR NOVO JOGO” para começar a próxima rodada.','success');refresh()}catch(e){setStatus(e.message,'error')}};


$('#resetRound').onclick=async()=>{if(!confirm('Resetar somente a rodada atual? A rodada será reduzida em 1, os jogadores e o evento serão apagados.'))return;try{await req('/api/game?action=reset-round',{method:'POST'});setStatus('✓ Rodada atual resetada.','success');refresh()}catch(e){setStatus(e.message,'error')}};

$('#reset').onclick=async()=>{if(!confirm('Resetar completamente o jogo e voltar a rodada para ZERO? Isso apagará os jogadores e o evento atual.'))return;try{await req('/api/game?action=reset',{method:'POST'});setStatus('✓ Jogo resetado. A próxima rodada começará no número 1.','success');refresh()}catch(e){setStatus(e.message,'error')}};
