
/* Proposer un itinéraire : tracé à la main + export GPX (100 % dans le navigateur, aucune donnée envoyée). */
(function () {
  if (typeof map === 'undefined' || typeof L === 'undefined') return;
  var CFG = window.PI_CONFIG || {};
  var contactEmail = CFG.contactEmail || "";   // ex. : window.PI_CONFIG = {contactEmail: "contact@exemple.fr"};

  var pts = [], markers = [], drawing = false;
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
    '<div class="pi-head"><strong>Proposer un itinéraire</strong><button class="pi-x" type="button" aria-label="Fermer">&times;</button></div>' +
    '<p class="pi-help">Dessinez votre proposition directement sur la carte : cliquez successivement pour placer les points de votre itinéraire (vous pouvez ensuite déplacer chaque point). ' +
    'Lorsque vous avez terminé, cliquez sur <b>Exporter en GPX</b> et transmettez-nous le fichier' + (contactEmail ? ' à <a href="mailto:' + contactEmail + '">' + contactEmail + '</a>' : '') + '.</p>' +
    '<label for="pi-nom">Nom de l\u2019itinéraire (facultatif)</label><input id="pi-nom" type="text" maxlength="120" placeholder="Ex. : Sentier du belvédère">' +
    '<label for="pi-com">Commentaire (facultatif)</label><textarea id="pi-com" rows="2" maxlength="500" placeholder="Difficulté, points d\u2019intérêt, accès\u2026"></textarea>' +
    '<div class="pi-stats" id="pi-stats">Aucun point tracé.</div>' +
    '<div class="pi-row"><button type="button" class="pi-primary" id="pi-start">Commencer le tracé</button></div>' +
    '<div class="pi-row"><button type="button" id="pi-undo">\u21A9\uFE0F Annuler le dernier point</button><button type="button" id="pi-clear">\uD83D\uDDD1\uFE0F Effacer</button></div>' +
    '<div class="pi-row"><button type="button" class="pi-export" id="pi-export">\uD83D\uDCBE Exporter en GPX</button></div>' +
    '<div class="pi-row"><button type="button" id="pi-import">\uD83D\uDCE5 Importer un GPX</button><input type="file" id="pi-file" accept=".gpx,application/gpx+xml,text/xml" style="display:none"></div>' +
    '<div class="pi-msg" id="pi-msg" role="status"></div>' +
    '<div class="pi-priv">Votre tracé reste sur votre appareil : rien n\u2019est envoyé automatiquement. Vous nous transmettez vous-même le fichier GPX.</div>';
  container.appendChild(panel);
  L.DomEvent.disableClickPropagation(panel);
  L.DomEvent.disableScrollPropagation(panel);

  function $(id) { return panel.querySelector('#' + id); }
  var elStats = $('pi-stats'), elMsg = $('pi-msg'), btnStart = $('pi-start'), btnUndo = $('pi-undo'),
      btnClear = $('pi-clear'), btnExport = $('pi-export');

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
    L.DomUtil[on ? 'addClass' : 'removeClass'](container, 'pi-drawing');
    if (on) { map.doubleClickZoom.disable(); say('Cliquez sur la carte pour ajouter des points.'); }
    else { map.doubleClickZoom.enable(); }
    refresh();
  }

  map.on('click', function (e) { if (drawing) addPoint(e.latlng); });

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
  function buildGpx() {
    var nom = $('pi-nom').value.trim() || 'Proposition d\u2019itinéraire';
    var com = $('pi-com').value.trim();
    var now = new Date().toISOString();
    var x = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<gpx version="1.1" creator="Carte des sentiers de Mayotte" xmlns="http://www.topografix.com/GPX/1/1">\n' +
      '  <metadata>\n    <name>' + esc(nom) + '</name>\n' + (com ? '    <desc>' + esc(com) + '</desc>\n' : '') + '    <time>' + now + '</time>\n  </metadata>\n' +
      '  <trk>\n    <name>' + esc(nom) + '</name>\n' + (com ? '    <desc>' + esc(com) + '</desc>\n' : '') + '    <trkseg>\n';
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
    say('Fichier « ' + name + ' » téléchargé. Merci de nous le transmettre par e-mail.');
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

  refresh();
})();
