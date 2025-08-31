import { useState, useEffect, useMemo } from 'react'
import { Button } from './components/ui/button.jsx'
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card.jsx'
import { Badge } from './components/ui/badge.jsx'
import { Settings as SettingsIcon, History as HistoryIcon, CheckCircle, Undo2, Trash2, Edit3, Save, X, Upload, Download } from 'lucide-react'
import './App.css'

// === Schema & Keys ===
const SCHEMA_VERSION = 2;
const LS_KEYS = {
  history: 'insulin-history',
  prefs: 'insulin-prefs',
  schema: 'insulin-schema-version',
  pinSession: 'insulin-pin-session',
};

// === Data model: points ===
const injectionPoints = {
  abdomen: {
    name: 'Abdômen',
    region: 'abdomen',
    points: [
      { id: 'abd_r1', name: 'Direito 1', side: 'right', position: { x: 45, y: 35 } },
      { id: 'abd_r2', name: 'Direito 2', side: 'right', position: { x: 45, y: 45 } },
      { id: 'abd_r3', name: 'Direito 3', side: 'right', position: { x: 45, y: 55 } },
      { id: 'abd_l1', name: 'Esquerdo 1', side: 'left', position: { x: 55, y: 35 } },
      { id: 'abd_l2', name: 'Esquerdo 2', side: 'left', position: { x: 55, y: 45 } },
      { id: 'abd_l3', name: 'Esquerdo 3', side: 'left', position: { x: 55, y: 55 } },
    ],
  },
  thigh: {
    name: 'Coxa',
    region: 'thigh',
    points: [
      { id: 'th_r1', name: 'Direito 1', side: 'right', position: { x: 45, y: 75 } },
      { id: 'th_r2', name: 'Direito 2', side: 'right', position: { x: 45, y: 85 } },
      { id: 'th_l1', name: 'Esquerdo 1', side: 'left', position: { x: 55, y: 75 } },
      { id: 'th_l2', name: 'Esquerdo 2', side: 'left', position: { x: 55, y: 85 } },
    ],
  },
  arm: {
    name: 'Braço',
    region: 'arm',
    points: [
      { id: 'arm_r1', name: 'Direito 1', side: 'right', position: { x: 35, y: 40 } },
      { id: 'arm_l1', name: 'Esquerdo 1', side: 'left', position: { x: 65, y: 40 } },
    ],
  },
};

// === Defaults / Prefs ===
const defaultPrefs = {
  cooldownDays: 7,
  alternateSide: true,
  alternateRegion: true,
  dailySlots: 2,
  enabledRegions: { abdomen: true, thigh: true, arm: true },
  language: 'pt', // 'pt' | 'en'
  pinEnabled: false,
  pinCode: '',
};

// === Utils ===
const dayMs = 24*60*60*1000;

function loadJSON(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function saveJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

function migrateIfNeeded() {
  const current = Number(localStorage.getItem(LS_KEYS.schema) || 1);
  if (current < SCHEMA_VERSION) localStorage.setItem(LS_KEYS.schema, String(SCHEMA_VERSION));
}
function dist(p1, p2) { const dx = p1.x - p2.x; const dy = p1.y - p2.y; return Math.sqrt(dx*dx + dy*dy); }

const pointById = (() => {
  const map = new Map();
  Object.values(injectionPoints).forEach(area => {
    area.points.forEach(pt => map.set(pt.id, { ...pt, region: area.region, areaName: area.name }));
  });
  return map;
})();

function getPointStatus(pointId, history, prefs) {
  const cdMs = (prefs?.cooldownDays ?? defaultPrefs.cooldownDays) * dayMs;
  const entries = history.filter(h => h.pointId === pointId).sort((a,b)=>b.ts-a.ts);
  if (entries.length === 0) return 'available';
  const last = entries[0];
  const elapsed = Date.now() - last.ts;
  if (elapsed >= cdMs) return 'available';
  return 'recent';
}

function suggestNextPoint(history, prefs) {
  const enabledRegions = prefs.enabledRegions || defaultPrefs.enabledRegions;
  const usablePoints = Object.values(injectionPoints)
    .filter(a => enabledRegions[a.region])
    .flatMap(a => a.points);
  if (usablePoints.length === 0) return null;
  const last = history[0] ? pointById.get(history[0].pointId) : null;

  const candidates = usablePoints
    .map(pt => ({ pt, status: getPointStatus(pt.id, history, prefs) }))
    .filter(x => x.status === 'available');

  const pool = (candidates.length > 0 ? candidates : usablePoints.map(pt => ({ pt, status: 'recent' })));

  const scores = pool.map(({ pt, status }) => {
    let score = 0;
    if (status === 'available') score += 50;
    if (prefs.alternateSide && last) score += (pt.side !== last.side ? 20 : -10);
    if (prefs.alternateRegion && last) score += (pt.region !== last.region ? 15 : -5);
    if (last) { const d = dist(pt.position, last.position); score += Math.min(20, d); }
    const lookback = Date.now() - 30*dayMs;
    const count30 = history.filter(h => h.ts >= lookback && h.pointId === pt.id).length;
    score += (10 - Math.min(10, count30*2));
    return { pt, score };
  });

  scores.sort((a,b)=>b.score - a.score);
  return scores[0]?.pt ?? null;
}

function fmtDate(ts, locale='pt-BR') {
  try {
    return new Date(ts).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return new Date(ts).toISOString();
  }
}

// === UI/UX: Silhueta de alta qualidade (mesmo viewBox para manter coordenadas) ===
const Silhouette = () => (
  <>
    <defs>
      <linearGradient id="bodyFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#eef2f7" />
        <stop offset="100%" stopColor="#dfe6ee" />
      </linearGradient>
      <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="0.8" result="blur" />
        <feOffset dx="0" dy="0.6" result="offset" />
        <feComponentTransfer><feFuncA type="linear" slope="0.35" /></feComponentTransfer>
        <feMerge><feMergeNode in="offset" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>

    <g filter="url(#dropShadow)" stroke="#1f2937" strokeWidth="0.6" fill="url(#bodyFill)">
      {/* cabeça */}
      <circle cx="50" cy="16.5" r="8.5" />

      {/* tronco e membros superiores/ inferiores simplificados, mas suaves */}
      <path d="
          M30,30
          Q36,24 42,27
          H58
          Q64,24 70,30
          C73,33 74.5,36.5 74.5,42
          Q74.5,49 68.8,52.5
          L68.8,73.5
          Q68.8,82 72.2,88
          L72.2,104
          H27.8
          L27.8,88
          Q31.2,82 31.2,73.5
          L31.2,52.5
          Q25.5,49 25.5,42
          C25.5,36.5 27,33 30,30
          Z
        " />
    </g>
  </>
);

export default function App() {
  // boot & migrate
  useEffect(() => {
    if (!localStorage.getItem(LS_KEYS.schema)) localStorage.setItem(LS_KEYS.schema, String(SCHEMA_VERSION));
    migrateIfNeeded();
  }, []);

  // Prefs
  const [prefs, setPrefs] = useState(() => ({
    ...defaultPrefs,
    ...loadJSON(LS_KEYS.prefs, {}),
  }));
  useEffect(() => saveJSON(LS_KEYS.prefs, prefs), [prefs]);

  // History
  const [history, setHistory] = useState(() => {
    const raw = loadJSON(LS_KEYS.history, []);
    return Array.isArray(raw)
      ? raw.map(x => ({ ...x, ts: typeof x.ts === 'number' ? x.ts : Date.parse(x.ts) || Date.now() }))
      : [];
  });
  useEffect(() => saveJSON(LS_KEYS.history, history), [history]);

  const [view, setView] = useState('main'); // 'main' | 'history' | 'settings'
  const [manualSelection, setManualSelection] = useState(null);
  const [lastAction, setLastAction] = useState(null);
  const [pinInput, setPinInput] = useState('');
  const [pinOk, setPinOk] = useState(false);

  useEffect(() => {
    if (prefs.pinEnabled) {
      const flag = sessionStorage.getItem(LS_KEYS.pinSession);
      if (flag === 'ok') setPinOk(true);
    } else {
      setPinOk(true);
    }
  }, [prefs.pinEnabled]);

  const suggestedPoint = useMemo(() => {
    if (manualSelection) return manualSelection;
    return suggestNextPoint(history, prefs);
  }, [history, prefs, manualSelection]);

  function recordInjection(point) {
    if (!point) return;
    const entry = {
      id: `h_${Date.now()}`,
      pointId: point.id,
      region: point.region,
      side: point.side,
      ts: Date.now(),
      note: '',
    };
    const newHistory = [entry, ...history];
    setHistory(newHistory);
    setLastAction({ type: 'add', entry });
    setManualSelection(null);
  }

  function undoLast() {
    if (!lastAction || lastAction.type !== 'add') return;
    const id = lastAction.entry.id;
    const newHistory = history.filter(h => h.id !== id);
    setHistory(newHistory);
    setLastAction(null);
  }

  function deleteEntry(id) { setHistory(history.filter(h => h.id !== id)); }
  function updateEntry(id, patch) { setHistory(history.map(h => h.id === id ? { ...h, ...patch } : h)); }

  function exportHistory() {
    const blob = new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `insulin-history-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importHistoryFromFile(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        if (Array.isArray(data)) {
          const norm = data.map(x => ({
            id: x.id || `h_${Math.random().toString(36).slice(2)}`,
            pointId: x.pointId,
            region: x.region || (pointById.get(x.pointId)?.region ?? 'unknown'),
            side: x.side || (pointById.get(x.pointId)?.side ?? 'na'),
            ts: typeof x.ts === 'number' ? x.ts : Date.parse(x.ts) || Date.now(),
            note: x.note || '',
          }));
          setHistory(norm.sort((a,b)=>b.ts-a.ts));
        }
      } catch {
        alert('Arquivo inválido.');
      }
    };
    reader.readAsText(file);
  }

  function clearSessionPin() {
    sessionStorage.removeItem(LS_KEYS.pinSession);
    setPinOk(false);
  }

  const locale = prefs.language === 'en' ? 'en-US' : 'pt-BR';

  // Métricas
  const metrics = useMemo(() => {
    const nowTs = Date.now();
    const mk = (days) => {
      const cutoff = nowTs - days*dayMs;
      const slice = history.filter(h => h.ts >= cutoff);
      const byRegion = {};
      const bySide = { left: 0, right: 0 };
      slice.forEach(h => {
        byRegion[h.region] = (byRegion[h.region]||0)+1;
        bySide[h.side] = (bySide[h.side]||0)+1;
      });
      return { total: slice.length, byRegion, bySide };
    };
    return { d7: mk(7), d30: mk(30) };
  }, [history]);

  function getStatusColor(status) {
    if (status === 'available') return 'fill-green-500/70';
    if (status === 'recent') return 'fill-yellow-400/80';
    return 'fill-red-500/70';
  }
  function onCircleClick(pt) { setManualSelection(prev => prev?.id === pt.id ? null : pt); }

  return (
    <div className="container mx-auto max-w-4xl p-4 space-y-4">
      {view === 'main' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">InsulinRotate</h1>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setView('history')} aria-label="Histórico">
                <HistoryIcon className="w-4 h-4 mr-2" /> Histórico
              </Button>
              <Button variant="outline" onClick={() => setView('settings')} aria-label="Configurações">
                <SettingsIcon className="w-4 h-4 mr-2" /> Configurações
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Próximo ponto sugerido</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex items-center justify-center">
                  <svg
                    viewBox="0 0 100 120"
                    className="w-full h-full"
                    style={{ maxWidth: '360px', margin: '0 auto' }}
                    role="img"
                    aria-label="Mapa do corpo para seleção de pontos de aplicação"
                    shapeRendering="geometricPrecision"
                  >
                    <Silhouette />
                    {Object.values(injectionPoints)
                      .filter(a => prefs.enabledRegions[a.region])
                      .flatMap(area => area.points)
                      .map(pt => {
                        const status = getPointStatus(pt.id, history, prefs);
                        const isSelected = (manualSelection?.id || suggestedPoint?.id) === pt.id;
                        const label = `${pointById.get(pt.id).areaName} - ${pt.name} - ${status}`;
                        return (
                          <circle
                            key={pt.id}
                            cx={pt.position.x}
                            cy={pt.position.y}
                            r={isSelected ? "3.2" : "2.5"}
                            className={`${getStatusColor(status)} ${isSelected ? 'animate-pulse' : ''}`}
                            stroke={isSelected ? "#ffffff" : "#111827"}
                            strokeWidth={isSelected ? "1.2" : "0.6"}
                            vectorEffect="non-scaling-stroke"
                            role="button"
                            aria-label={label}
                            onClick={() => onCircleClick(pointById.get(pt.id))}
                          />
                        )
                      })}
                  </svg>
                </div>

                <div className="space-y-3">
                  {suggestedPoint ? (
                    <>
                      <div className="text-sm text-gray-600">
                        {manualSelection ? 'Ponto selecionado manualmente:' : 'Sugerido pelo algoritmo:'}
                      </div>
                      <div className="text-lg font-semibold">
                        {pointById.get(suggestedPoint.id).areaName} · {suggestedPoint.name} ({suggestedPoint.side === 'left' ? 'Esquerdo' : 'Direito'})
                      </div>
                      <div className="flex gap-2">
                        <Badge variant="secondary">Alternância lado: {prefs.alternateSide ? 'On' : 'Off'}</Badge>
                        <Badge variant="secondary">Alternância região: {prefs.alternateRegion ? 'On' : 'Off'}</Badge>
                        <Badge variant="secondary">Cooldown: {prefs.cooldownDays}d</Badge>
                      </div>
                      <div className="flex gap-2 pt-2">
                        <Button onClick={() => recordInjection(suggestedPoint)}>
                          <CheckCircle className="w-4 h-4 mr-2" /> Confirmar aplicação
                        </Button>
                        {lastAction?.type === 'add' && (
                          <Button variant="outline" onClick={undoLast}>
                            <Undo2 className="w-4 h-4 mr-2" /> Desfazer
                          </Button>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-gray-500">Nenhum ponto disponível (verifique preferências/áreas ativas).</div>
                  )}

                  <div className="pt-4">
                    <div className="text-sm font-medium mb-2">Legenda</div>
                    <div className="flex gap-3 text-sm items-center flex-wrap">
                      <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500/70 inline-block border border-gray-800"></span> Disponível</span>
                      <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-400/80 inline-block border border-gray-800"></span> Recente</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Métricas rápidas</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white/60 rounded-lg p-3">
                  <p className="text-xs text-gray-600">Total (7d)</p>
                  <p className="text-lg font-bold">{metrics.d7.total}</p>
                </div>
                <div className="bg-white/60 rounded-lg p-3">
                  <p className="text-xs text-gray-600">Total (30d)</p>
                  <p className="text-lg font-bold">{metrics.d30.total}</p>
                </div>
                {Object.entries(injectionPoints).map(([key, area]) => (
                  <div key={key} className="bg-white/60 rounded-lg p-3">
                    <p className="text-xs text-gray-600">{area.name} (30d)</p>
                    <p className="text-lg font-bold">{metrics.d30.byRegion[area.region] || 0}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-3">
                Este app não fornece aconselhamento médico. Ajuste preferências conforme orientação de seu profissional de saúde.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {view === 'history' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Histórico</h2>
            <div className="flex gap-2">
              <label className="inline-flex items-center gap-2 text-sm">
                <Upload className="w-4 h-4" />
                <input type="file" accept="application/json" onChange={e => e.target.files[0] && importHistoryFromFile(e.target.files[0])} />
              </label>
              <Button variant="outline" onClick={exportHistory}>
                <Download className="w-4 h-4 mr-2" /> Exportar JSON
              </Button>
              {prefs.pinEnabled && <Button variant="outline" onClick={clearSessionPin}>Bloquear</Button>}
              <Button variant="outline" onClick={() => setView('main')}>Voltar</Button>
            </div>
          </div>
          <Card>
            <CardContent>
              {history.length === 0 ? (
                <div className="text-sm text-gray-500">Sem registros ainda.</div>
              ) : (
                <div className="space-y-2">
                  {history.map(h => {
                    const pt = pointById.get(h.pointId);
                    return (
                      <div key={h.id} className="flex items-start justify-between gap-3 border-b pb-2">
                        <div>
                          <div className="font-medium">{pt?.areaName} · {pt?.name} ({h.side === 'left' ? 'Esquerdo' : 'Direito'})</div>
                          <div className="text-xs text-gray-600">{fmtDate(h.ts, locale)}</div>
                          {/* edição inline da observação */}
                          {editId === h.id ? (
                            <textarea
                              className="mt-2 w-full border rounded p-2"
                              value={editNote}
                              onChange={e=>setEditNote(e.target.value)}
                              placeholder="Observações"
                            />
                          ) : (
                            h.note ? <div className="text-sm mt-1">{h.note}</div> : null
                          )}
                        </div>
                        <div className="flex gap-2">
                          {editId === h.id ? (
                            <>
                              <Button size="sm" onClick={() => { updateEntry(h.id, { note: editNote }); setEditId(null); }}>
                                <Save className="w-4 h-4 mr-1" />Salvar
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setEditId(null)}>
                                <X className="w-4 h-4 mr-1" />Cancelar
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button size="sm" variant="outline" onClick={() => { setEditId(h.id); setEditNote(h.note || ''); }}>
                                <Edit3 className="w-4 h-4 mr-1" />Editar
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => deleteEntry(h.id)}>
                                <Trash2 className="w-4 h-4 mr-1" />Excluir
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {view === 'settings' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Configurações</h2>
            <Button variant="outline" onClick={() => setView('main')}>Voltar</Button>
          </div>
          <Card>
            <CardHeader><CardTitle>Preferências</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Cooldown por ponto (dias)</label>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    className="w-full border rounded px-3 py-2"
                    value={prefs.cooldownDays}
                    onChange={e => setPrefs({ ...prefs, cooldownDays: Math.max(1, Number(e.target.value||1)) })}
                  />
                </div>
                <div className="flex items-center gap-2 mt-6">
                  <input id="altSide" type="checkbox" checked={prefs.alternateSide} onChange={e => setPrefs({ ...prefs, alternateSide: e.target.checked })} />
                  <label htmlFor="altSide">Alternar lado automaticamente</label>
                </div>
                <div className="flex items-center gap-2">
                  <input id="altRegion" type="checkbox" checked={prefs.alternateRegion} onChange={e => setPrefs({ ...prefs, alternateRegion: e.target.checked })} />
                  <label htmlFor="altRegion">Alternar região automaticamente</label>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Aplicações por dia (slots)</label>
                  <input
                    type="number"
                    min="1"
                    max="6"
                    className="w-full border rounded px-3 py-2"
                    value={prefs.dailySlots}
                    onChange={e => setPrefs({ ...prefs, dailySlots: Math.max(1, Number(e.target.value||1)) })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Idioma</label>
                  <select
                    className="w-full border rounded px-3 py-2"
                    value={prefs.language}
                    onChange={e => setPrefs({ ...prefs, language: e.target.value })}
                  >
                    <option value="pt">Português (Brasil)</option>
                    <option value="en">English</option>
                  </select>
                </div>
              </div>

              <div className="mt-2">
                <div className="text-sm font-medium mb-1">Regiões ativas</div>
                <div className="flex gap-4">
                  {Object.values(injectionPoints).map(area => (
                    <label key={area.region} className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={prefs.enabledRegions[area.region]}
                        onChange={e => setPrefs({ ...prefs, enabledRegions: { ...prefs.enabledRegions, [area.region]: e.target.checked } })}
                      />
                      {area.name}
                    </label>
                  ))}
                </div>
              </div>

              <div className="mt-4 border-t pt-4">
                <div className="text-sm font-medium mb-1">Segurança (PIN do histórico)</div>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={prefs.pinEnabled} onChange={e => setPrefs({ ...prefs, pinEnabled: e.target.checked })} />
                  Ativar PIN para ver histórico
                </label>
                {prefs.pinEnabled && (
                  <div className="mt-2 flex gap-2">
                    <input
                      type="password"
                      className="border rounded px-3 py-2"
                      placeholder="Definir PIN"
                      value={prefs.pinCode}
                      onChange={e => setPrefs({ ...prefs, pinCode: e.target.value })}
                    />
                    <Button variant="outline" onClick={() => { sessionStorage.removeItem(LS_KEYS.pinSession); alert('PIN definido.'); }}>Salvar PIN</Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
