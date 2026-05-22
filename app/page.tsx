/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'
import { useState, useRef, useEffect, useCallback } from 'react'

const BATCH = 5

const SECTORS = [
  "Engrais & fertilisants","Produits de commodité","Traitement d'eau",
  "Cosmétiques & bien-être","Détergents & produits de nettoyage",
  "Peintures, colles & encres","Pigments & colorants",
  "Polymères & résines","Verres","Phytosanitaires","Gaz industriels & médicaux",
  "Hors secteur FCP"
]

const SECTOR_COLORS: Record<string, string> = {
  "Engrais & fertilisants": "#22c55e",
  "Produits de commodité": "#3b82f6",
  "Traitement d'eau": "#06b6d4",
  "Cosmétiques & bien-être": "#ec4899",
  "Détergents & produits de nettoyage": "#f59e0b",
  "Peintures, colles & encres": "#8b5cf6",
  "Pigments & colorants": "#f97316",
  "Polymères & résines": "#64748b",
  "Verres": "#0ea5e9",
  "Phytosanitaires": "#84cc16",
  "Gaz industriels & médicaux": "#a78bfa",
  "Hors secteur FCP": "#94a3b8",
}

const SAMPLE = "MA0403400\tUnilever Maghreb\tCasablanca\nMA0424700\tAkzo Nobel Coatings\tCasablanca\nMA0428300\tAtlas Peinture\tMarrakech\nMA0434700\tBasf Maroc\tCasablanca\nMA0436000\tBayer\tCasablanca\nMA0463400\tCaoutchouc et Plastiques du Maghreb\tCasablanca\nMA0479800\tChérifienne des Sels\tCasablanca\nMA0480600\tChimicolor\tCasablanca\nMA2224770\tAir Liquide Maroc\tCasablanca\nMA2226243\tBiotal Cosmétics (usine)\tEl Jadida"

interface Result {
  code: string; name: string; city: string; region: string
  activite: string; sous_activite: string | null; site_web: string | null
  confiance: number; raison: string; sources: string[]
}

function save(k: string, v: any) { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }
function load(k: string, fb: any) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb } catch { return fb } }

export default function Home() {
  const [dark, setDark] = useState(() => load('dark_mode', true))
  const [anthropicKey, setAnthropicKeyRaw] = useState(() => load('ak5', ''))
  const [tavilyKey, setTavilyKeyRaw] = useState(() => load('tk5', ''))
  const [supabaseUrl, setSupabaseUrlRaw] = useState(() => load('su5', ''))
  const [supabaseKey, setSupabaseKeyRaw] = useState(() => load('sk5', ''))
  const [raw, setRawState] = useState(() => load('fcp_raw', ''))
  const [results, setResultsState] = useState<Result[]>([])
  const [logs, setLogs] = useState<string[]>(['[ AGENT FCP ] Prêt.'])
  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0, wave: 0, totalWaves: 0 })
  const [filter, setFilter] = useState('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [dbConnected, setDbConnected] = useState(false)
  const [tab, setTab] = useState<'config' | 'results'>('config')
  const [syncing, setSyncing] = useState(false)
  const pauseRef = useRef(false)
  const stopRef = useRef(false)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [logs])

  const setAnthropicKey = (v: string) => { setAnthropicKeyRaw(v); save('ak5', v) }
  const setTavilyKey = (v: string) => { setTavilyKeyRaw(v); save('tk5', v) }
  const setSupabaseUrl = (v: string) => { setSupabaseUrlRaw(v); save('su5', v) }
  const setSupabaseKey = (v: string) => { setSupabaseKeyRaw(v); save('sk5', v) }
  const setRaw = (v: string) => { setRawState(v); save('fcp_raw', v) }
  const toggleDark = () => { setDark((d: boolean) => { save('dark_mode', !d); return !d }) }

  const addLog = useCallback((m: string) => setLogs(p => [...p, m]), [])
  const addLogs = useCallback((ms: string[]) => setLogs(p => [...p, ...ms]), [])

  const setResults = (fn: (p: Result[]) => Result[]) => setResultsState(fn)

  useEffect(() => {
    const su = load('su5', ''); const sk = load('sk5', '')
    if (su && sk) syncFromDB(su, sk)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const syncFromDB = async (url?: string, key?: string) => {
    const u = url || supabaseUrl; const k = key || supabaseKey
    if (!u || !k) { addLog('⚠ Supabase keys missing'); return }
    setSyncing(true)
    try {
      const res = await fetch('/api/results', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supabaseUrl: u, supabaseKey: k })
      })
      const data = await res.json()
      if (data.results?.length > 0) {
        setResultsState(data.results)
        setDbConnected(true)
        addLog(`💾 ${data.results.length} résultats chargés depuis la DB`)
        setTab('results')
      } else { setDbConnected(true); addLog('✅ DB connectée') }
    } catch (e: any) { addLog(`❌ DB: ${e.message}`) }
    setSyncing(false)
  }

  const parse = (s: string) => s.split('\n').filter(l => l.trim()).map(l => {
    const [code, name, city] = l.split('\t')
    return { code: code?.trim() || '', name: name?.trim() || '', city: city?.trim() || '' }
  }).filter(c => c.name)

  const start = async () => {
    if (!anthropicKey.trim()) { addLog('❌ Clé Anthropic manquante'); return }
    if (!tavilyKey.trim()) { addLog('❌ Clé Tavily manquante'); return }
    const companies = parse(raw)
    if (!companies.length) { addLog('❌ Aucune donnée'); return }
    const done = new Set(results.map(r => r.code))
    const todo = companies.filter(c => !done.has(c.code))
    if (!todo.length) { addLog('✅ Toutes les entreprises déjà traitées'); return }

    setLogs([])
    stopRef.current = false; pauseRef.current = false
    setRunning(true); setPaused(false); setTab('results')
    const totalWaves = Math.ceil(todo.length / BATCH)
    setProgress({ done: 0, total: todo.length, wave: 0, totalWaves })
    addLog(`🚀 Agent FCP démarré — ${todo.length} entreprises — ${BATCH} parallèles`)

    for (let w = 0; w < totalWaves; w++) {
      if (stopRef.current) break
      while (pauseRef.current) await sleep(300)
      const batch = todo.slice(w * BATCH, (w + 1) * BATCH)
      setProgress(p => ({ ...p, wave: w + 1 }))
      addLog(`\n⚡ Vague ${w + 1}/${totalWaves} — ${batch.map(c => c.name).join(' · ')}`)
      try {
        const res = await fetch('/api/classify', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companies: batch, anthropicKey, tavilyKey, supabaseUrl, supabaseKey, concurrency: BATCH })
        })
        const data = await res.json()
        if (data.logs) addLogs(data.logs)
        if (data.results) setResults(p => [...p, ...data.results])
        setProgress(p => ({ ...p, done: Math.min(p.done + batch.length, todo.length) }))
      } catch (e: any) { addLog(`❌ Vague ${w + 1}: ${e.message}`) }
      if (w < totalWaves - 1) await sleep(500)
    }
    setRunning(false)
    addLog(`\n✅ Terminé`)
  }

  const togglePause = () => { pauseRef.current = !pauseRef.current; setPaused(pauseRef.current); addLog(pauseRef.current ? '⏸ Pause' : '▶ Reprise') }
  const stop = () => { stopRef.current = true; pauseRef.current = false; setPaused(false); addLog('⏹ Arrêt...') }
  const clearResults = () => { setResultsState([]); addLog('🗑 Résultats effacés localement') }

  const exportCSV = () => {
    const h = ['Code','Nom','Ville','Région','Activité','Sous-activité','Site Web','Confiance','Raisonnement','Sources']
    const rows = results.map(r => [
      r.code, `"${r.name}"`, r.city, r.region,
      `"${r.activite}"`, `"${r.sous_activite||''}"`,
      r.site_web||'', Math.round(r.confiance*100)+'%',
      `"${(r.raison||'').replace(/"/g,'""')}"`,
      `"${(r.sources||[]).join(', ')}"`
    ].join(','))
    const blob = new Blob([[h.join(','),...rows].join('\n')],{type:'text/csv;charset=utf-8;'})
    const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='fcp_classification.csv'; a.click()
  }
  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(results,null,2)],{type:'application/json'})
    const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='fcp_classification.json'; a.click()
  }

  const companies = parse(raw)
  const processed = new Set(results.map(r => r.code))
  const remaining = companies.filter(c => !processed.has(c.code)).length
  const pct = progress.total ? Math.round(progress.done/progress.total*100) : (companies.length ? Math.round(results.length/companies.length*100) : 0)
  const filtered = filter === 'all' ? results : results.filter(r => r.activite === filter)

  // Theme
  const D = dark
  const bg = D ? '#0d0d14' : '#f8fafc'
  const surface = D ? 'rgba(255,255,255,.04)' : '#ffffff'
  const surfaceBorder = D ? 'rgba(255,255,255,.08)' : '#e2e8f0'
  const text = D ? '#f1f5f9' : '#0f172a'
  const textDim = D ? 'rgba(255,255,255,.4)' : '#64748b'
  const inputBg = D ? 'rgba(255,255,255,.05)' : '#f8fafc'
  const inputBorder = D ? 'rgba(255,255,255,.12)' : '#cbd5e1'
  const tableHover = D ? 'rgba(255,255,255,.03)' : '#f8fafc'
  const theadBg = D ? '#0f0f1a' : '#f1f5f9'

  const ACCENT = '#6366f1'
  const GREEN = '#22c55e'
  const RED = '#ef4444'
  const YELLOW = '#f59e0b'

  const card = { background: surface, border: `1px solid ${surfaceBorder}`, borderRadius: 12, padding: 20 }
  const inp = { width: '100%', background: inputBg, border: `1px solid ${inputBorder}`, borderRadius: 8, padding: '9px 12px', color: text, fontFamily: 'monospace', fontSize: 12, outline: 'none', boxSizing: 'border-box' as const }
  const lbl = { display: 'block', fontSize: 10, fontFamily: 'monospace', color: textDim, marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.08em' }

  return (
    <div style={{ minHeight: '100vh', background: bg, color: text, fontFamily: 'system-ui,sans-serif', transition: 'background .2s, color .2s' }}>
      {D && <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', backgroundImage: 'linear-gradient(rgba(99,102,241,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,.04) 1px,transparent 1px)', backgroundSize: '40px 40px' }} />}
      <div style={{ position: 'relative', zIndex: 10, maxWidth: 1350, margin: '0 auto', padding: 24 }}>

        {/* HEADER */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, paddingBottom: 20, borderBottom: `1px solid ${surfaceBorder}` }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, background: 'linear-gradient(135deg,#6366f1,#a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              🧪 Agent IA — Classification FCP
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 11, fontFamily: 'monospace', color: textDim, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Claude Haiku + Tavily · {BATCH} parallèles · 11 Secteurs · Supabase · Ville & Région
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Dark/Light toggle */}
            <button onClick={toggleDark}
              style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${surfaceBorder}`, background: surface, color: text, fontSize: 18, cursor: 'pointer', transition: 'all .2s' }}
              title={dark ? 'Switch to Light mode' : 'Switch to Dark mode'}>
              {dark ? '☀️' : '🌙'}
            </button>
            {dbConnected && <span style={{ fontSize: 11, fontFamily: 'monospace', color: GREEN }}>💾 DB</span>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderRadius: 8, border: `1px solid ${running ? 'rgba(99,102,241,.5)' : surfaceBorder}`, fontSize: 11, fontFamily: 'monospace', color: running ? ACCENT : textDim }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: running ? ACCENT : textDim, display: 'inline-block', animation: running ? 'pulse 1.5s infinite' : 'none' }} />
              {running ? (paused ? 'EN PAUSE' : `VAGUE ${progress.wave}/${progress.totalWaves}`) : 'EN ATTENTE'}
            </div>
          </div>
        </div>

        {/* TABS */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 20, background: D ? 'rgba(255,255,255,.04)' : '#f1f5f9', borderRadius: 10, padding: 4, width: 'fit-content', border: `1px solid ${surfaceBorder}` }}>
          {[['config','⚙ Config'],['results',`📊 Résultats${results.length>0?` (${results.length})`:''}`]].map(([t,l]) => (
            <button key={t} onClick={()=>setTab(t as any)}
              style={{ padding:'7px 20px', borderRadius:8, border:'none', background:tab===t?ACCENT:'transparent', color:tab===t?'white':textDim, fontWeight:tab===t?700:400, fontSize:13, cursor:'pointer', transition:'all .2s' }}>{l}</button>
          ))}
        </div>

        {/* CONFIG */}
        {tab === 'config' && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
            <div style={card}>
              <p style={{margin:'0 0 4px',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.12em',color:textDim}}>Clés API</p>
              <p style={{margin:'0 0 14px',fontSize:10,fontFamily:'monospace',color:GREEN}}>✓ Sauvegardées automatiquement dans votre navigateur</p>
              {[
                {label:'Clé Anthropic',val:anthropicKey,set:setAnthropicKey,ph:'sk-ant-api03-...'},
                {label:'Clé Tavily',val:tavilyKey,set:setTavilyKey,ph:'tvly-...'},
                {label:'Supabase URL',val:supabaseUrl,set:setSupabaseUrl,ph:'https://xxx.supabase.co',pw:false},
                {label:'Supabase Anon Key',val:supabaseKey,set:setSupabaseKey,ph:'eyJ...'},
              ].map(f=>(
                <div key={f.label} style={{marginBottom:10}}>
                  <label style={lbl}>{f.label}</label>
                  <input type={f.pw===false?'text':'password'} value={f.val} onChange={e=>f.set(e.target.value)} placeholder={f.ph} style={inp}/>
                </div>
              ))}
              <div style={{display:'flex',gap:8,marginTop:6}}>
                <button onClick={()=>syncFromDB()} disabled={syncing}
                  style={{padding:'8px 14px',background:'rgba(99,102,241,.1)',border:'1px solid rgba(99,102,241,.3)',borderRadius:8,color:ACCENT,fontSize:12,fontWeight:700,cursor:syncing?'wait':'pointer'}}>
                  {syncing?'⏳ Chargement...':'🔄 Sync depuis DB'}
                </button>
              </div>
              <div style={{marginTop:14,padding:'12px 14px',background:D?'rgba(99,102,241,.06)':'rgba(99,102,241,.06)',border:'1px solid rgba(99,102,241,.15)',borderRadius:8,fontSize:11,fontFamily:'monospace',color:textDim,lineHeight:1.8}}>
                ⚡ {BATCH} entreprises en parallèle<br/>
                🔍 2 recherches Tavily par entreprise<br/>
                🗺 Région détectée automatiquement<br/>
                💾 Sauvegarde auto Supabase<br/>
                🌓 Mode sombre/clair
              </div>
            </div>
            <div style={card}>
              <p style={{margin:'0 0 4px',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.12em',color:textDim}}>Données Entreprises</p>
              <p style={{margin:'0 0 14px',fontSize:10,fontFamily:'monospace',color:GREEN}}>✓ Sauvegardées automatiquement dans votre navigateur</p>
              <label style={lbl}>TSV — Copiez depuis Excel (code↹nom↹ville)</label>
              <textarea value={raw} onChange={e=>setRaw(e.target.value)} rows={11}
                placeholder={"MA0403400\tUnilever Maghreb\tCasablanca\nMA0424700\tAkzo Nobel Coatings\tCasablanca"}
                style={{...inp,resize:'vertical',lineHeight:1.6}}/>
              <div style={{display:'flex',gap:8,marginTop:10,alignItems:'center',flexWrap:'wrap'}}>
                <button onClick={()=>setRaw(SAMPLE)} style={{padding:'7px 14px',background:inputBg,border:`1px solid ${inputBorder}`,borderRadius:8,color:textDim,fontSize:12,fontWeight:700,cursor:'pointer'}}>📂 Données exemple</button>
                {raw&&<span style={{fontSize:11,fontFamily:'monospace',color:textDim}}>{companies.length} total</span>}
                {raw&&remaining>0&&<span style={{fontSize:11,fontFamily:'monospace',color:YELLOW}}>· {remaining} restantes</span>}
                {raw&&remaining===0&&companies.length>0&&<span style={{fontSize:11,fontFamily:'monospace',color:GREEN}}>· ✅ Toutes traitées</span>}
              </div>
            </div>
          </div>
        )}

        {/* CONTROLS */}
        <div style={{display:'flex',gap:10,marginBottom:20,flexWrap:'wrap',alignItems:'center'}}>
          <button onClick={start} disabled={running}
            style={{padding:'11px 24px',background:running?inputBg:ACCENT,color:running?textDim:'white',border:'none',borderRadius:8,fontWeight:900,fontSize:14,cursor:running?'not-allowed':'pointer',transition:'all .2s'}}>
            ▶ {remaining>0?`Traiter ${remaining} restantes`:'Lancer l\'Agent'}
          </button>
          <button onClick={togglePause} disabled={!running}
            style={{padding:'11px 20px',background:inputBg,border:`1px solid ${inputBorder}`,borderRadius:8,color:text,fontWeight:700,fontSize:13,cursor:!running?'not-allowed':'pointer',opacity:!running?.4:1}}>
            {paused?'▶ Reprendre':'⏸ Pause'}
          </button>
          <button onClick={stop} disabled={!running}
            style={{padding:'11px 20px',background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.3)',borderRadius:8,color:RED,fontWeight:700,fontSize:13,cursor:!running?'not-allowed':'pointer',opacity:!running?.4:1}}>
            ⏹ Arrêter
          </button>
          <button onClick={clearResults} disabled={running}
            style={{padding:'11px 20px',background:inputBg,border:`1px solid ${inputBorder}`,borderRadius:8,color:textDim,fontWeight:700,fontSize:13,cursor:running?'not-allowed':'pointer'}}>
            🗑 Effacer
          </button>
          {running&&<span style={{fontSize:11,fontFamily:'monospace',color:textDim,marginLeft:8}}>{progress.done}/{progress.total} · vague {progress.wave}/{progress.totalWaves}</span>}
        </div>

        {/* STATS */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:10,marginBottom:14}}>
          {[
            {l:'Total',v:companies.length||results.length,col:text},
            {l:'Traités',v:results.length,col:ACCENT},
            {l:'Restants',v:remaining,col:remaining>0?YELLOW:GREEN},
            {l:'Sites trouvés',v:results.filter(r=>r.site_web).length,col:'#22c55e'},
            {l:'Hors FCP',v:results.filter(r=>r.activite==='Hors secteur FCP').length,col:'#94a3b8'},
            {l:'Confiance > 80%',v:results.filter(r=>r.confiance>=.8).length,col:'#a78bfa'},
          ].map(s=>(
            <div key={s.l} style={{...card,padding:'12px 14px',textAlign:'center'}}>
              <div style={{fontSize:24,fontWeight:900,fontFamily:'monospace',color:s.col,lineHeight:1}}>{s.v}</div>
              <div style={{fontSize:10,color:textDim,textTransform:'uppercase',letterSpacing:'0.08em',marginTop:4}}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* PROGRESS */}
        <div style={{...card,padding:'11px 18px',marginBottom:14,display:'flex',alignItems:'center',gap:14}}>
          <span style={{fontSize:10,fontFamily:'monospace',color:textDim,textTransform:'uppercase',whiteSpace:'nowrap'}}>
            {running?`Vague ${progress.wave}/${progress.totalWaves}`:'Progression'}
          </span>
          <div style={{flex:1,height:4,background:D?'rgba(255,255,255,.08)':'#e2e8f0',borderRadius:2,overflow:'hidden'}}>
            <div style={{height:'100%',background:'linear-gradient(90deg,#6366f1,#a78bfa)',borderRadius:2,width:pct+'%',transition:'width .4s'}}/>
          </div>
          <span style={{fontSize:14,fontWeight:900,fontFamily:'monospace',color:ACCENT,minWidth:40,textAlign:'right'}}>{pct}%</span>
        </div>

        {/* LOGS */}
        <div ref={logRef} style={{background:D?'rgba(0,0,0,.4)':'#f8fafc',border:`1px solid ${surfaceBorder}`,borderRadius:10,padding:14,height:140,overflowY:'auto',fontFamily:'monospace',fontSize:11,lineHeight:1.8,marginBottom:16}}>
          {logs.map((l,i)=>(
            <div key={i} style={{color:l.includes('❌')?RED:l.includes('✅')||l.includes('✓')?GREEN:l.includes('⚠')?YELLOW:l.includes('🚀')||l.includes('⚡')?ACCENT:textDim}}>{l}</div>
          ))}
        </div>

        {/* FILTER TABS BY SECTOR */}
        <div style={{...card,padding:'12px 16px',marginBottom:12,display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
          <span style={{fontSize:10,fontFamily:'monospace',color:textDim,textTransform:'uppercase',letterSpacing:'0.08em',marginRight:4}}>Filtrer:</span>
          <button onClick={()=>setFilter('all')}
            style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontFamily:'monospace',cursor:'pointer',border:`1px solid ${filter==='all'?ACCENT:inputBorder}`,background:filter==='all'?ACCENT:'transparent',color:filter==='all'?'white':textDim,fontWeight:filter==='all'?700:400}}>
            Tous ({results.length})
          </button>
          {SECTORS.map(s=>{
            const count = results.filter(r=>r.activite===s).length
            if(count===0) return null
            const col = SECTOR_COLORS[s] || '#6366f1'
            const active = filter===s
            return (
              <button key={s} onClick={()=>setFilter(s)}
                style={{padding:'3px 10px',borderRadius:20,fontSize:10,fontFamily:'monospace',cursor:'pointer',border:`1px solid ${active?col:inputBorder}`,background:active?col:'transparent',color:active?'white':textDim,fontWeight:active?700:400,transition:'all .2s'}}>
                {s.length>30?s.substring(0,28)+'…':s} ({count})
              </button>
            )
          })}
        </div>

        {/* TABLE */}
        <div style={{...card,padding:0,overflow:'hidden'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'13px 18px',borderBottom:`1px solid ${surfaceBorder}`,flexWrap:'wrap',gap:10}}>
            <span style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.12em',color:textDim}}>Résultats — {filtered.length} entreprises</span>
          </div>
          <div style={{overflowX:'auto',maxHeight:580,overflowY:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead style={{position:'sticky',top:0,zIndex:10,background:theadBg}}>
                <tr style={{borderBottom:`1px solid ${surfaceBorder}`}}>
                  {['#','Code','Nom','Ville','Région','Activité','Sous-activité','Site Web','Conf.',''].map((h,i)=>(
                    <th key={i} style={{padding:'10px 14px',textAlign:'left',fontSize:10,fontFamily:'monospace',textTransform:'uppercase',letterSpacing:'0.08em',color:textDim,whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length===0&&(
                  <tr><td colSpan={10} style={{padding:'48px 20px',textAlign:'center',color:textDim,fontFamily:'monospace'}}>
                    {results.length===0?'Lancez l\'agent pour voir les résultats ⚡':'Aucun résultat pour ce filtre'}
                  </td></tr>
                )}
                {filtered.map((r,i)=>{
                  const rk=`${r.code}-${i}`
                  const isExp=expanded===rk
                  const sectorColor = SECTOR_COLORS[r.activite] || '#94a3b8'
                  return [
                    <tr key={rk} style={{borderBottom:`1px solid ${surfaceBorder}`,cursor:'pointer',transition:'background .1s'}}
                      onClick={()=>setExpanded(isExp?null:rk)}
                      onMouseEnter={e=>(e.currentTarget.style.background=tableHover)}
                      onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                      <td style={{padding:'10px 14px',color:textDim,fontFamily:'monospace',fontSize:11}}>{results.indexOf(r)+1}</td>
                      <td style={{padding:'10px 14px',fontFamily:'monospace',fontSize:10,color:textDim}}>{r.code}</td>
                      <td style={{padding:'10px 14px',fontWeight:600,color:text}}>{r.name}</td>
                      <td style={{padding:'10px 14px',color:textDim,fontSize:11}}>{r.city}</td>
                      <td style={{padding:'10px 14px'}}>
                        <span style={{padding:'2px 7px',borderRadius:4,fontSize:10,fontFamily:'monospace',background:D?'rgba(255,255,255,.06)':'#f1f5f9',color:textDim,whiteSpace:'nowrap'}}>{r.region}</span>
                      </td>
                      <td style={{padding:'10px 14px'}}>
                        <span style={{padding:'3px 9px',borderRadius:20,fontSize:10,fontFamily:'monospace',fontWeight:700,whiteSpace:'nowrap',background:`${sectorColor}18`,color:sectorColor,border:`1px solid ${sectorColor}40`}}>
                          {r.activite}
                        </span>
                      </td>
                      <td style={{padding:'10px 14px',fontSize:11,color:textDim,maxWidth:200}}>
                        {r.sous_activite ? <span style={{padding:'2px 7px',borderRadius:4,fontSize:10,background:D?'rgba(99,102,241,.1)':'rgba(99,102,241,.08)',color:ACCENT,border:`1px solid rgba(99,102,241,.2)`}}>{r.sous_activite}</span> : <span style={{color:textDim}}>—</span>}
                      </td>
                      <td style={{padding:'10px 14px'}}>
                        {r.site_web
                          ?<a href={r.site_web.startsWith('http')?r.site_web:'https://'+r.site_web} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}
                              style={{color:GREEN,fontSize:11,fontFamily:'monospace',textDecoration:'none'}}>
                              🔗 {r.site_web.replace(/^https?:\/\//,'').split('/')[0]}
                            </a>
                          :<span style={{color:textDim,fontSize:10}}>—</span>}
                      </td>
                      <td style={{padding:'10px 14px'}}>
                        <div style={{display:'flex',alignItems:'center',gap:6}}>
                          <div style={{width:40,height:3,background:D?'rgba(255,255,255,.08)':'#e2e8f0',borderRadius:2,overflow:'hidden'}}>
                            <div style={{height:'100%',background:r.confiance>=.8?GREEN:r.confiance>=.6?YELLOW:RED,width:(r.confiance*100)+'%'}}/>
                          </div>
                          <span style={{fontFamily:'monospace',fontSize:10,color:textDim}}>{Math.round(r.confiance*100)}%</span>
                        </div>
                      </td>
                      <td style={{padding:'10px 14px',color:textDim,fontSize:14}}>{isExp?'▲':'▼'}</td>
                    </tr>,
                    isExp&&(
                      <tr key={`${rk}-exp`} style={{background:D?'rgba(0,0,0,.3)':'#f8fafc'}}>
                        <td colSpan={10} style={{padding:'16px 20px'}}>
                          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
                            <div>
                              <p style={{margin:'0 0 8px',fontSize:10,fontFamily:'monospace',color:ACCENT,textTransform:'uppercase',letterSpacing:'0.1em'}}>🧪 Raisonnement</p>
                              <p style={{margin:0,fontSize:12,color:text,lineHeight:1.7}}>{r.raison||'—'}</p>
                            </div>
                            <div>
                              <p style={{margin:'0 0 8px',fontSize:10,fontFamily:'monospace',color:'#a78bfa',textTransform:'uppercase',letterSpacing:'0.1em'}}>📍 Localisation</p>
                              <p style={{margin:0,fontSize:12,color:text}}><strong>Ville:</strong> {r.city}<br/><strong>Région:</strong> {r.region}</p>
                            </div>
                            {r.sources?.length>0&&(
                              <div style={{gridColumn:'1/-1'}}>
                                <p style={{margin:'0 0 8px',fontSize:10,fontFamily:'monospace',color:YELLOW,textTransform:'uppercase',letterSpacing:'0.1em'}}>🔍 Sources</p>
                                <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                                  {r.sources.map((s,si)=>(
                                    <span key={si} style={{padding:'2px 8px',background:inputBg,border:`1px solid ${inputBorder}`,borderRadius:4,fontSize:10,fontFamily:'monospace',color:textDim}}>{s}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  ].filter(Boolean)
                })}
              </tbody>
            </table>
          </div>
          <div style={{padding:'13px 18px',borderTop:`1px solid ${surfaceBorder}`,display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
            {[{l:'⬇ Export CSV',fn:exportCSV},{l:'⬇ Export JSON',fn:exportJSON}].map(b=>(
              <button key={b.l} onClick={b.fn} disabled={!results.length}
                style={{padding:'8px 16px',background:inputBg,border:`1px solid ${inputBorder}`,borderRadius:8,color:text,fontSize:12,fontWeight:700,cursor:results.length?'pointer':'not-allowed',opacity:results.length?1:.4}}>{b.l}</button>
            ))}
            <span style={{marginLeft:'auto',fontSize:11,fontFamily:'monospace',color:textDim}}>
              {results.length>0?`${results.length} résultats · ${results.filter(r=>r.site_web).length} sites · ${results.filter(r=>r.activite!=='Hors secteur FCP').length} classifiés FCP`:'Aucune donnée'}
            </span>
          </div>
        </div>

      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  )
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }
