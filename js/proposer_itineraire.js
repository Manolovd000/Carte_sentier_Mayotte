
/* Proposer un itinéraire : tracé à la main + export GPX (100 % dans le navigateur, aucune donnée envoyée). */
(function () {
  if (typeof map === 'undefined' || typeof L === 'undefined') return;
  var CFG = window.PI_CONFIG || {};
  var contactEmail = CFG.contactEmail || "";   // ex. : window.PI_CONFIG = {contactEmail: "contact@exemple.fr"};

  var pts = [], markers = [], drawing = false, reporting = false;
  var line = L.polyline([], {color: '#e03131', weight: 4, opacity: 0.95, dashArray: '8,6', interactive: false}).addTo(map);
  var container = map.getContainer();

  // --- bouton sur la carte
  var Ctl = L.Control.extend({
    options: {position: 'topleft'},
    onAdd: function () {
      var div = L.DomUtil.create('div', 'leaflet-bar pi-btn-ctl');
      var a = L.DomUtil.create('a', '', div);
      a.href = '#'; a.title = 'Proposer un itinéraire'; a.setAttribute('role', 'button');
      a.innerHTML = '\u270F\uFE0F Proposer un itinéraire';
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.on(a, 'click', function (e) { L.DomEvent.preventDefault(e); panel.classList.toggle('pi-open'); });
      return div;
    }
  });
  new Ctl().addTo(map);

  // --- panneau
  var panel = document.createElement('div');
  panel.className = 'pi-panel';
  panel.innerHTML =
    '<div class="pi-head"><strong>Proposer un itinéraire</strong><span class="pi-hbtn"><button class="pi-min" type="button" title="Réduire" aria-label="Réduire">&minus;</button><button class="pi-x" type="button" title="Fermer" aria-label="Fermer">&times;</button></span></div>' +
    '<p class="pi-help">Dessinez votre proposition directement sur la carte : cliquez successivement pour placer les points de votre itinéraire (vous pouvez ensuite déplacer chaque point). ' +
    'Lorsque vous avez terminé, cliquez sur <b>Exporter en GPX</b> et transmettez-nous le fichier' + (contactEmail ? ' à <a href="mailto:' + contactEmail + '">' + contactEmail + '</a>' : '') + '.</p>' +
    '<label for="pi-nom">Nom de l\u2019itinéraire (facultatif)</label><input id="pi-nom" type="text" maxlength="120" placeholder="Ex. : Sentier du belvédère">' +
    '<label for="pi-type">Type de sentier</label><select id="pi-type"><option value="">Non précisé</option><option>Randonnée pédestre</option><option>Trail / course à pied</option><option>VTT</option><option>Équestre</option><option>Sentier d\u2019interprétation / découverte</option><option>Autre</option></select>' +
    '<label for="pi-diff">Difficulté estimée</label><select id="pi-diff"><option value="">Non précisée</option><option>Facile</option><option>Moyenne</option><option>Difficile</option></select>' +
    '<label for="pi-com">Commentaire (facultatif)</label><textarea id="pi-com" rows="2" maxlength="500" placeholder="Points d\u2019intérêt, accès, passages délicats\u2026"></textarea>' +
    '<label for="pi-contact">Vos coordonnées (facultatif)</label><input id="pi-contact" type="text" maxlength="120" placeholder="Nom, e-mail ou téléphone, pour vous recontacter">' +
    '<div class="pi-stats" id="pi-stats">Aucun point tracé.</div>' +
    '<div class="pi-actions"><div class="pi-row"><button type="button" class="pi-primary" id="pi-start">Commencer le tracé</button></div>' +
    '<div class="pi-row"><button type="button" id="pi-undo">\u21A9\uFE0F Annuler<span class="pi-long"> le dernier point</span></button><button type="button" id="pi-clear">\uD83D\uDDD1\uFE0F Effacer</button></div>' +
    '<div class="pi-row"><button type="button" class="pi-export" id="pi-export">\uD83D\uDCBE Exporter<span class="pi-long"> en GPX</span></button></div></div>' +
    '<div class="pi-row pi-r-import"><button type="button" id="pi-import">\uD83D\uDCE5 Importer un GPX</button><input type="file" id="pi-file" accept=".gpx,application/gpx+xml,text/xml" style="display:none"></div>' +
    '<div class="pi-msg" id="pi-msg" role="status"></div>' +
    '<div class="pi-priv">Votre tracé reste sur votre appareil : rien n\u2019est envoyé automatiquement. Vous nous transmettez vous-même le fichier GPX.</div>';
  container.appendChild(panel);
  L.DomEvent.disableClickPropagation(panel);
  L.DomEvent.disableScrollPropagation(panel);

  function $(id) { return panel.querySelector('#' + id); }
  var elStats = $('pi-stats'), elMsg = $('pi-msg'), btnStart = $('pi-start'), btnUndo = $('pi-undo'),
      btnClear = $('pi-clear'), btnExport = $('pi-export');

  // Réduction du panneau : version compacte pour laisser la carte visible pendant le tracé.
  var btnMin = panel.querySelector('.pi-min');
  function setMini(on) {
    panel.classList.toggle('pi-mini', !!on);
    btnMin.innerHTML = on ? '&#9633;' : '&minus;';
    btnMin.title = on ? 'Agrandir' : 'Réduire';
    btnMin.setAttribute('aria-label', btnMin.title);
  }
  btnMin.addEventListener('click', function () { setMini(!panel.classList.contains('pi-mini')); });

  function say(t, err) { elMsg.textContent = t || ''; elMsg.className = 'pi-msg' + (err ? ' pi-err' : ''); }

  function lengthKm() {
    var m = 0;
    for (var i = 1; i < pts.length; i++) m += pts[i - 1].distanceTo(pts[i]);
    return m / 1000;
  }
  function refresh() {
    line.setLatLngs(pts);
    elStats.textContent = pts.length
      ? pts.length + ' point' + (pts.length > 1 ? 's' : '') + ' \u2022 longueur : ' + lengthKm().toFixed(2).replace('.', ',') + ' km'
      : 'Aucun point tracé.';
    btnUndo.disabled = btnClear.disabled = pts.length === 0;
    btnExport.disabled = pts.length < 2;
    btnStart.textContent = drawing ? '\u2714 Terminer le tracé' : (pts.length ? 'Reprendre le tracé' : 'Commencer le tracé');
  }

  function addPoint(latlng) {
    var idx = pts.length;
    pts.push(latlng);
    var mk = L.marker(latlng, {
      draggable: true, keyboard: false,
      icon: L.divIcon({className: '', html: '<div class="pi-vertex' + (idx === 0 ? ' pi-first' : '') + '"></div>', iconSize: [14, 14], iconAnchor: [7, 7]})
    }).addTo(map);
    mk.on('drag', function () { var i = markers.indexOf(mk); if (i >= 0) { pts[i] = mk.getLatLng(); refresh(); } });
    markers.push(mk);
    refresh();
  }
  function clearAll() {
    markers.forEach(function (m) { map.removeLayer(m); });
    markers = []; pts = []; refresh();
  }
  function setDrawing(on) {
    drawing = on;
    setMini(on);   // réduit le panneau dès que le tracé commence, l'agrandit à la fin
    L.DomUtil[(on || reporting) ? 'addClass' : 'removeClass'](container, 'pi-drawing');
    if (on) { map.closePopup(); map.doubleClickZoom.disable(); say('Cliquez sur la carte pour ajouter des points.'); }
    else { map.doubleClickZoom.enable(); }
    refresh();
  }

  map.on('click', function (e) { if (drawing) addPoint(e.latlng); });
  // Pendant le tracé, les fenêtres d'information des couches ne doivent pas s'ouvrir (elles intercepteraient les clics suivants).
  map.on('popupopen', function () { if (drawing || reporting) map.closePopup(); });

  btnStart.addEventListener('click', function () { setDrawing(!drawing); });
  btnUndo.addEventListener('click', function () {
    if (!pts.length) return;
    pts.pop(); map.removeLayer(markers.pop()); refresh();
  });
  btnClear.addEventListener('click', function () {
    if (pts.length > 2 && !window.confirm('Effacer tout le tracé ?')) return;
    clearAll(); say('');
  });
  panel.querySelector('.pi-x').addEventListener('click', function () { panel.classList.remove('pi-open'); setDrawing(false); });

  // --- export GPX
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function details() {
    var l = [], t = $('pi-type').value, d = $('pi-diff').value, c = $('pi-com').value.trim(), k = $('pi-contact').value.trim();
    if (t) l.push('Type : ' + t);
    if (d) l.push('Difficulté : ' + d);
    if (c) l.push('Commentaire : ' + c);
    if (k) l.push('Contact : ' + k);
    return l;
  }
  function buildGpx() {
    var nom = $('pi-nom').value.trim() || 'Proposition d\u2019itinéraire';
    var det = details(), desc = det.join('\n');
    var t = $('pi-type').value, k = $('pi-contact').value.trim();
    var now = new Date().toISOString();
    var x = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<gpx version="1.1" creator="Carte des sentiers de Mayotte" xmlns="http://www.topografix.com/GPX/1/1">\n' +
      '  <metadata>\n    <name>' + esc(nom) + '</name>\n' + (desc ? '    <desc>' + esc(desc) + '</desc>\n' : '') +
      (k ? '    <author><name>' + esc(k) + '</name></author>\n' : '') + '    <time>' + now + '</time>\n  </metadata>\n' +
      '  <trk>\n    <name>' + esc(nom) + '</name>\n' + (desc ? '    <desc>' + esc(desc) + '</desc>\n' : '') + (t ? '    <type>' + esc(t) + '</type>\n' : '') + '    <trkseg>\n';
    pts.forEach(function (p) { x += '      <trkpt lat="' + p.lat.toFixed(6) + '" lon="' + p.lng.toFixed(6) + '"></trkpt>\n'; });
    return x + '    </trkseg>\n  </trk>\n</gpx>\n';
  }
  btnExport.addEventListener('click', function () {
    if (pts.length < 2) { say('Placez au moins 2 points pour exporter un tracé.', true); return; }
    var dt = new Date();
    var name = 'proposition_itineraire_mayotte_' + dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()) + '.gpx';
    var blob = new Blob([buildGpx()], {type: 'application/gpx+xml;charset=utf-8'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
    say('');
    var nomT = $('pi-nom').value.trim() || 'Proposition d\u2019itinéraire';
    var corps = ['Bonjour,', '', 'Je vous transmets ma proposition d\u2019itinéraire (fichier GPX joint : ' + name + ').', ''].concat(details(), ['', 'Longueur approximative : ' + lengthKm().toFixed(2).replace('.', ',') + ' km']).join('\n');
    elMsg.className = 'pi-msg';
    elMsg.innerHTML = 'Fichier « ' + esc(name) + ' » téléchargé. ' + (contactEmail ? '<a href="mailto:' + contactEmail + '?subject=' + encodeURIComponent('Proposition d\u2019itinéraire – ' + nomT) + '&body=' + encodeURIComponent(corps) + '">Ouvrir un e-mail pré-rempli</a> et joignez-y le fichier.' : 'Merci de nous le transmettre par e-mail.');
  });

  // --- import GPX
  $('pi-import').addEventListener('click', function () { $('pi-file').click(); });
  $('pi-file').addEventListener('change', function (ev) {
    var f = ev.target.files && ev.target.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      var doc = new DOMParser().parseFromString(r.result, 'application/xml');
      if (doc.getElementsByTagName('parsererror').length) { say('Fichier GPX illisible.', true); return; }
      var nodes = doc.getElementsByTagName('trkpt');
      if (!nodes.length) nodes = doc.getElementsByTagName('rtept');
      if (!nodes.length) { say('Aucun tracé trouvé dans ce fichier.', true); return; }
      if (pts.length && !window.confirm('Remplacer le tracé actuel par le GPX importé ?')) return;
      clearAll();
      for (var i = 0; i < nodes.length; i++) {
        var la = parseFloat(nodes[i].getAttribute('lat')), lo = parseFloat(nodes[i].getAttribute('lon'));
        if (isFinite(la) && isFinite(lo)) addPoint(L.latLng(la, lo));
      }
      var n = doc.getElementsByTagName('name')[0];
      if (n && !$('pi-nom').value) $('pi-nom').value = n.textContent.trim();
      if (pts.length) map.fitBounds(line.getBounds().pad(0.15));
      setDrawing(false);
      say(pts.length + ' points importés. Vous pouvez déplacer les points, puis ré-exporter.');
    };
    r.readAsText(f);
    ev.target.value = '';
  });

  /* ===== Signaler un problème : point sur la carte + message e-mail pré-rempli (aucune donnée envoyée automatiquement) ===== */
  var sgMarker = null, sgLatLng = null, sgNearest = null;
  var SgCtl = L.Control.extend({
    options: {position: 'topleft'},
    onAdd: function () {
      var div = L.DomUtil.create('div', 'leaflet-bar pi-btn-ctl pi-btn-sg');
      var a = L.DomUtil.create('a', '', div);
      a.href = '#'; a.title = 'Signaler un problème sur un sentier'; a.setAttribute('role', 'button');
      a.innerHTML = '⚠️ Signaler un problème';
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.on(a, 'click', function (e) { L.DomEvent.preventDefault(e); sgSetOpen(!sgPanel.classList.contains('pi-open')); });
      return div;
    }
  });
  new SgCtl().addTo(map);

  var sgPanel = document.createElement('div');
  sgPanel.className = 'pi-panel pi-sg';
  sgPanel.innerHTML =
    '<div class="pi-head"><strong>Signaler un problème</strong><span class="pi-hbtn"><button class="pi-x" type="button" title="Fermer" aria-label="Fermer">&times;</button></span></div>' +
    '<p class="pi-help"><b>1.</b> Cliquez sur la carte à l’endroit concerné (vous pouvez déplacer le point). <b>2.</b> Choisissez la catégorie et décrivez le problème. <b>3.</b> Envoyez le message : votre messagerie s’ouvre avec les informations déjà remplies.</p>' +
    '<div class="pi-stats" id="sg-stats">Aucun point placé : cliquez sur la carte.</div>' +
    '<label for="sg-cat">Catégorie</label><select id="sg-cat">' +
    '<option>Tronçon impraticable</option><option>Arbre tombé ou obstacle</option><option>Erreur de tracé</option><option>Sentier manquant ou à ajouter</option><option>Danger / sécurité</option><option>Autre</option></select>' +
    '<label for="sg-com">Description</label><textarea id="sg-com" rows="3" maxlength="800" placeholder="Que constatez-vous ? Depuis quand ?"></textarea>' +
    '<label for="sg-contact">Vos coordonnées (facultatif)</label><input id="sg-contact" type="text" maxlength="120" placeholder="Nom, e-mail ou téléphone">' +
    '<div class="pi-row"><button type="button" class="pi-export" id="sg-send">✉️ Envoyer par e-mail</button><button type="button" id="sg-copy">📋 Copier le message</button></div>' +
    '<div class="pi-msg" id="sg-msg" role="status"></div>' +
    '<div class="pi-priv">Rien n’est envoyé automatiquement : le message s’ouvre dans votre messagerie et vous décidez de l’envoyer.</div>';
  container.appendChild(sgPanel);
  L.DomEvent.disableClickPropagation(sgPanel);
  L.DomEvent.disableScrollPropagation(sgPanel);
  function $s(id) { return sgPanel.querySelector('#' + id); }
  function sgSay(t, err) { var m = $s('sg-msg'); m.textContent = t || ''; m.className = 'pi-msg' + (err ? ' pi-err' : ''); }

  function sgSetOpen(on) {
    if (on) { panel.classList.remove('pi-open'); setDrawing(false); }
    sgPanel.classList.toggle('pi-open', on);
    reporting = on;
    L.DomUtil[on ? 'addClass' : 'removeClass'](container, 'pi-drawing');
    if (on) { map.closePopup(); sgSay(''); }
    else if (!drawing) { L.DomUtil.removeClass(container, 'pi-drawing'); }
  }
  // l'ouverture du panneau de tracé ferme celui du signalement
  var piBtn = document.querySelector('.pi-btn-ctl:not(.pi-btn-sg) a');
  if (piBtn) { piBtn.addEventListener('click', function () { if (sgPanel.classList.contains('pi-open')) { sgPanel.classList.remove('pi-open'); reporting = false; if (!drawing) { L.DomUtil.removeClass(container, 'pi-drawing'); } } }); }
  sgPanel.querySelector('.pi-x').addEventListener('click', function () { sgSetOpen(false); });

  function sgNearestTrail(ll) {
    if (typeof layer_Sentiersnomms_3 === 'undefined') { return null; }
    var best = null, bd = Infinity;
    layer_Sentiersnomms_3.eachLayer(function (l) {
      (function walk(a) {
        if (!a.length) { return; }
        if (a[0] instanceof L.LatLng) { for (var i = 0; i < a.length; i++) { var d = ll.distanceTo(a[i]); if (d < bd) { bd = d; best = l.feature.properties.nom; } } }
        else { a.forEach(walk); }
      })(l.getLatLngs());
    });
    return best && bd <= 150 ? {nom: best, d: Math.round(bd)} : null;
  }
  function sgSetPoint(ll) {
    sgLatLng = ll; sgNearest = sgNearestTrail(ll);
    if (!sgMarker) {
      sgMarker = L.marker(ll, {draggable: true, keyboard: false,
        icon: L.divIcon({className: '', html: '<div class="pi-sgpin">!</div>', iconSize: [26, 26], iconAnchor: [13, 13]})}).addTo(map);
      sgMarker.on('dragend', function () { sgSetPoint(sgMarker.getLatLng()); });
    } else { sgMarker.setLatLng(ll); }
    $s('sg-stats').textContent = 'Point placé : ' + ll.lat.toFixed(5) + ', ' + ll.lng.toFixed(5) +
      (sgNearest ? ' • sentier le plus proche : ' + sgNearest.nom + ' (à ' + sgNearest.d + ' m)' : ' • aucun sentier à moins de 150 m');
  }
  map.on('click', function (e) { if (reporting) { sgSetPoint(e.latlng); } });

  function sgMessage() {
    var cat = $s('sg-cat').value, com = $s('sg-com').value.trim(), ct = $s('sg-contact').value.trim(), L0 = sgLatLng;
    var lignes = ['Signalement sur la carte des sentiers de Mayotte', '',
      'Catégorie : ' + cat,
      'Sentier concerné : ' + (sgNearest ? sgNearest.nom + ' (point à ' + sgNearest.d + ' m du tracé)' : 'non identifié'),
      'Coordonnées (lat, lon) : ' + L0.lat.toFixed(6) + ', ' + L0.lng.toFixed(6),
      'Voir le lieu : https://www.openstreetmap.org/?mlat=' + L0.lat.toFixed(6) + '&mlon=' + L0.lng.toFixed(6) + '#map=18/' + L0.lat.toFixed(6) + '/' + L0.lng.toFixed(6),
      '', 'Description :', com || '(non renseignée)'];
    if (ct) { lignes.push('', 'Contact : ' + ct); }
    lignes.push('', 'Date : ' + new Date().toLocaleDateString('fr-FR'));
    return {subject: 'Signalement sentier – ' + cat + (sgNearest ? ' – ' + sgNearest.nom : ''), body: lignes.join('\n')};
  }
  $s('sg-send').addEventListener('click', function () {
    if (!sgLatLng) { sgSay('Cliquez d’abord sur la carte pour placer le point à signaler.', true); return; }
    var m = sgMessage();
    if (!contactEmail) { sgSay('Adresse de contact non configurée.', true); return; }
    window.location.href = 'mailto:' + contactEmail + '?subject=' + encodeURIComponent(m.subject) + '&body=' + encodeURIComponent(m.body);
    sgSay('Votre messagerie s’ouvre. Si rien ne se passe, utilisez « Copier le message » et envoyez-le à ' + contactEmail + '.');
  });
  $s('sg-copy').addEventListener('click', function () {
    if (!sgLatLng) { sgSay('Cliquez d’abord sur la carte pour placer le point à signaler.', true); return; }
    var m = sgMessage(), txt = 'À : ' + contactEmail + '\nObjet : ' + m.subject + '\n\n' + m.body;
    function ok() { sgSay('Message copié : collez-le dans un e-mail à ' + contactEmail + '.'); }
    function ko() {
      var ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); ok(); } catch (e) { sgSay('Copie impossible : sélectionnez le texte à la main.', true); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(txt).then(ok, ko); } else { ko(); }
  });

  refresh();
})();
