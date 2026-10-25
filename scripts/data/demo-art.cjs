const { createHash } = require('node:crypto');
function deterministicId(key) {
  const hex = createHash('sha256')
    .update('appliances-demo-v1:' + key)
    .digest('hex')
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}
function artwork(kind, color, variant = 0, back = false) {
  const fill = color,
    ink = '#0f172a',
    line = '#cbd5e1';
  let device = '';
  if (['phone', 'tablet', 'powerbank'].includes(kind))
    device = `<rect x="172" y="75" width="168" height="342" rx="27" fill="${ink}"/><rect x="182" y="86" width="148" height="320" rx="20" fill="${back ? fill : '#dbeafe'}"/>${back ? '<circle cx="211" cy="120" r="17" fill="#1e293b"/><circle cx="211" cy="120" r="8" fill="#64748b"/><circle cx="250" cy="120" r="12" fill="#1e293b"/>' : '<path d="M184 330 330 162v230H184Z" fill="' + fill + '"/><path d="M183 244 330 122v111L183 357Z" fill="#93c5fd"/><rect x="230" y="95" width="52" height="8" rx="4" fill="#0f172a"/>'}`;
  else if (['laptop', 'monitor', 'tv'].includes(kind))
    device = `<rect x="65" y="105" width="382" height="247" rx="15" fill="${ink}"/><rect x="77" y="118" width="358" height="219" rx="5" fill="#dbeafe"/><path d="m77 303 160-160 198 194H77Z" fill="${fill}"/><path d="m180 337 143-183 112 118v65Z" fill="#60a5fa"/>${kind === 'laptop' ? '<path d="M65 353h382l38 35H27Z" fill="#94a3b8"/><path d="M28 388h456v9H28Z" fill="#475569"/>' : '<path d="M234 352h44v45h-44Z" fill="#64748b"/><rect x="180" y="393" width="150" height="12" rx="6" fill="#475569"/>'}`;
  else if (kind === 'headphones')
    device = `<path d="M136 273v-74a120 120 0 0 1 240 0v74" fill="none" stroke="${ink}" stroke-width="35"/><path d="M136 273v-74a120 120 0 0 1 240 0v74" fill="none" stroke="${fill}" stroke-width="20"/><rect x="104" y="232" width="74" height="145" rx="30" fill="${ink}"/><rect x="334" y="232" width="74" height="145" rx="30" fill="${ink}"/><rect x="119" y="246" width="45" height="116" rx="20" fill="${fill}"/><rect x="348" y="246" width="45" height="116" rx="20" fill="${fill}"/>`;
  else if (kind === 'watch')
    device = `<rect x="211" y="35" width="90" height="440" rx="32" fill="${fill}"/><rect x="157" y="143" width="198" height="226" rx="45" fill="#94a3b8"/><rect x="167" y="153" width="178" height="206" rx="36" fill="${ink}"/><circle cx="256" cy="256" r="64" fill="none" stroke="#3b82f6" stroke-width="12"/><path d="M256 210v48l34 22" stroke="#facc15" stroke-width="10" fill="none" stroke-linecap="round"/>`;
  else if (kind === 'washer')
    device = `<rect x="110" y="75" width="292" height="354" rx="17" fill="${fill}"/><rect x="125" y="91" width="262" height="55" rx="7" fill="#e2e8f0"/><circle cx="330" cy="119" r="18" fill="#64748b"/><rect x="140" y="105" width="90" height="22" rx="3" fill="#334155"/><circle cx="256" cy="277" r="100" fill="#cbd5e1"/><circle cx="256" cy="277" r="82" fill="#1e293b"/><circle cx="256" cy="277" r="65" fill="#93c5fd"/><path d="M196 291q60-42 120 0v28H196Z" fill="#3b82f6"/>`;
  else if (kind === 'fridge')
    device = `<rect x="142" y="45" width="228" height="420" rx="17" fill="${fill}"/><path d="M143 196h226" stroke="${ink}" stroke-width="5"/><rect x="166" y="120" width="9" height="52" rx="4" fill="#e2e8f0"/><rect x="166" y="218" width="9" height="78" rx="4" fill="#e2e8f0"/><rect x="327" y="245" width="22" height="85" rx="5" fill="#334155"/>`;
  else if (kind === 'camera')
    device = `<rect x="70" y="157" width="372" height="233" rx="27" fill="${fill}"/><path d="M159 157v-42h129l28 42" fill="${ink}"/><circle cx="260" cy="271" r="94" fill="#0f172a"/><circle cx="260" cy="271" r="70" fill="#475569"/><circle cx="260" cy="271" r="48" fill="#1e3a8a"/><circle cx="243" cy="252" r="15" fill="#93c5fd"/><rect x="370" y="182" width="42" height="26" rx="5" fill="#e2e8f0"/>`;
  else if (kind === 'keyboard')
    device = `<rect x="35" y="170" width="442" height="170" rx="19" fill="${ink}"/>${Array.from({ length: 60 }, (_, i) => `<rect x="${49 + (i % 15) * 28}" y="${185 + Math.floor(i / 15) * 32}" width="22" height="24" rx="3" fill="${i % 7 === 0 ? fill : '#e2e8f0'}"/>`).join('')}`;
  else if (kind === 'ac')
    device = `<rect x="38" y="142" width="436" height="178" rx="31" fill="${fill}"/><path d="M58 271h396" stroke="#64748b" stroke-width="12"/><path d="M80 292h350" stroke="#cbd5e1" stroke-width="8"/><rect x="369" y="170" width="65" height="30" rx="6" fill="#1e293b"/><path d="M150 343v60m106-60v75m106-75v60" stroke="#93c5fd" stroke-width="8" stroke-linecap="round"/>`;
  else if (kind === 'kettle')
    device = `<path d="M166 143h152l30 209q0 50-94 50-94 0-94-50Z" fill="${fill}"/><path d="M318 177q114-10 89 105l-53 24" stroke="${ink}" stroke-width="21" fill="none"/><path d="m164 171-68-25 62 102" fill="${ink}"/><rect x="165" y="127" width="151" height="20" rx="10" fill="#1e293b"/><rect x="146" y="405" width="220" height="17" rx="8" fill="#334155"/>`;
  else if (kind === 'blender')
    device = `<path d="M172 76h168l-18 212H188Z" fill="#bfdbfe" stroke="#64748b" stroke-width="8"/><path d="M339 99q83 4 50 118l-62 20" stroke="#475569" stroke-width="13" fill="none"/><rect x="166" y="64" width="180" height="23" rx="8" fill="${ink}"/><path d="M190 280h135l24 148H165Z" fill="${fill}"/><circle cx="257" cy="355" r="28" fill="#e2e8f0"/><path d="m222 217 65 35m-65 0 65-35" stroke="#64748b" stroke-width="8"/>`;
  else if (kind === 'vacuum')
    device = `<path d="M233 168h35v233h-35Z" fill="#94a3b8"/><rect x="180" y="81" width="149" height="112" rx="29" fill="${fill}"/><rect x="207" y="171" width="93" height="90" rx="15" fill="#bfdbfe"/><path d="M187 419h136l37 37H150Z" fill="${ink}"/><path d="M316 104h59v72h-59" stroke="#334155" stroke-width="15" fill="none"/>`;
  else if (kind === 'speaker')
    device = `<rect x="133" y="68" width="246" height="380" rx="53" fill="${fill}"/><circle cx="256" cy="176" r="61" fill="#1e293b"/><circle cx="256" cy="176" r="41" fill="#475569"/><circle cx="256" cy="324" r="76" fill="#1e293b"/><circle cx="256" cy="324" r="54" fill="#475569"/>`;
  else if (kind === 'microwave')
    device = `<rect x="44" y="131" width="424" height="258" rx="19" fill="${fill}"/><rect x="65" y="154" width="284" height="206" rx="9" fill="#1e293b"/><rect x="370" y="159" width="69" height="45" rx="5" fill="#0f172a"/><circle cx="404" cy="257" r="24" fill="#e2e8f0"/><circle cx="404" cy="324" r="19" fill="#cbd5e1"/><rect x="327" y="195" width="9" height="122" rx="4" fill="#94a3b8"/>`;
  else
    device = `<rect x="125" y="118" width="262" height="306" rx="${kind === 'fryer' ? 70 : 45}" fill="${fill}"/><ellipse cx="256" cy="124" rx="131" ry="42" fill="#334155"/><rect x="190" y="171" width="132" height="62" rx="12" fill="#0f172a"/><circle cx="256" cy="202" r="16" fill="#3b82f6"/><path d="M144 278h225" stroke="#94a3b8" stroke-width="5"/><rect x="221" y="296" width="70" height="25" rx="12" fill="#1e293b"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 512 512"><rect width="512" height="512" rx="28" fill="#f8fafc"/><ellipse cx="256" cy="463" rx="173" ry="14" fill="#e2e8f0"/><g transform="translate(${back ? 10 : 0} 0)">${device}</g><text x="28" y="38" font-family="sans-serif" font-size="12" font-weight="600" fill="#64748b">APPLIANCES.LK · DEMO ${variant + 1}${back ? ' · DETAIL' : ''}</text></svg>`;
}
module.exports = { deterministicId, artwork };
