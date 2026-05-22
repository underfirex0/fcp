import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

// FCP Sectors & sub-activities
const FCP_SECTORS: Record<string, string[]> = {
  "Engrais & fertilisants": [
    "Engrais azotés (urée, ammonitrates, solutions azotées…)",
    "Engrais phosphatés",
    "Engrais potassiques",
    "Engrais NPK (formulations complexes)",
    "Engrais liquides & ferti-irrigation",
    "Engrais organiques & organo-minéraux",
    "Amendements du sol (chaux agricole, gypse, matière organique)"
  ],
  "Produits de commodité": [
    "Acides inorganiques (acide sulfurique, chlorhydrique, nitrique…)",
    "Bases et alcalis (soude, potasse, ammoniac…)",
    "Hypochlorites de soude (eau de Javel concentré)",
    "Solvants organiques (alcool, cétones, esters…)",
    "Sels techniques (chlorures, sulfates, nitrates, silicates…)",
    "Oxydants & réducteurs (peroxydes, bisulfites, etc.)",
    "Charges minérales (carbonates, silices, talc…)"
  ],
  "Traitement d'eau": [
    "Coagulants & floculants",
    "Désinfectants (chlore, hypochlorite, dioxyde de chlore, ozone…)",
    "Correcteurs de pH (acides, bases, tampons)",
    "Produits pour eau potable",
    "Traitement des eaux usées & des boues"
  ],
  "Cosmétiques & bien-être": [
    "Huiles essentielles",
    "Parfums & arômes",
    "Soins visage",
    "Soins corps",
    "Soins capillaires",
    "Hygiène (gels douche, savons, déodorants)",
    "Maquillage",
    "Parfums"
  ],
  "Détergents & produits de nettoyage": [
    "Lessives (poudre, liquide, capsules)",
    "Assouplissants textiles",
    "Détergents vaisselle",
    "Nettoyants sols & surfaces",
    "Désinfectants & produits d'hygiène professionnelle",
    "Nettoyants sanitaires",
    "Détergents industriels & agroalimentaires",
    "MP & Ingrédients pour détergence (tensioactifs, SLES…)"
  ],
  "Peintures, colles & encres": [
    "Peintures bâtiment (intérieur / extérieur)",
    "Peintures industrielles & anticorrosion",
    "Peintures pour bois & métaux",
    "Etanchéité",
    "Vernis & laques décoratives",
    "Revêtements de sols & résines de protection",
    "Colles bâtiment (carrelage, plâtre, etc.)",
    "Colles pour bois & papier",
    "Adhésifs industriels (époxys, polyuréthane…)",
    "Colles pour emballage & étiquetage",
    "Encres offset, flexo, hélio",
    "Encres pour impression numérique",
    "Encres pour packaging & étiquettes",
    "Vernis de surfaçage & de protection"
  ],
  "Pigments & colorants": [
    "Pigments minéraux (oxydes, dioxyde de titane…)",
    "Pigments organiques",
    "Pigments à effets (nacrés, métalliques, irisés)",
    "Colorants pour plastiques",
    "Colorants pour peintures & encres",
    "Colorants textiles",
    "Colorants alimentaires & boissons",
    "Colorants pour cosmétiques"
  ],
  "Polymères & résines": [
    "Polymères thermoplastiques (PE, PP, PVC, PET, PS…)",
    "Polymères techniques (PA, POM, PC, PBT…)",
    "Résines thermodurcissables (époxy, polyester, vinylester…)",
    "Résines acryliques & alkydes",
    "Elastomères & caoutchoucs (naturels & synthétiques)",
    "Résines pour composites & stratifiés",
    "Masterbatches & compounds formulés"
  ],
  "Verres": [
    "Verre pour emballage (bouteilles, bocaux)",
    "Verres de table et verres de table décorés"
  ],
  "Phytosanitaires": [
    "Herbicides",
    "Fongicides",
    "Insecticides & acaricides",
    "Nématicides",
    "Régulateurs de croissance",
    "Produits de biocontrôle (bio-pesticides, extraits naturels…)"
  ],
  "Gaz industriels & médicaux": [
    "Gaz de l'air (oxygène, azote)",
    "Gaz combustibles (acétylène, hydrogène…)",
    "Gaz de protection pour soudage & métallurgie",
    "Gaz réfrigérants",
    "Gaz médicaux (oxygène médical, air médical, protoxyde d'azote…)",
    "Gaz pour laboratoires & analyses"
  ]
}

// Morocco city → region mapping
const CITY_TO_REGION: Record<string, string> = {
  "Casablanca": "Casablanca-Settat", "Mohammédia": "Casablanca-Settat",
  "Berrechid": "Casablanca-Settat", "Settat": "Casablanca-Settat",
  "El Jadida": "Casablanca-Settat", "Nouasseur": "Casablanca-Settat",
  "Bouskoura": "Casablanca-Settat", "Médiouna": "Casablanca-Settat",
  "Ain Harrouda": "Casablanca-Settat", "Tit Mellil": "Casablanca-Settat",
  "Rabat": "Rabat-Salé-Kénitra", "Salé": "Rabat-Salé-Kénitra",
  "Kénitra": "Rabat-Salé-Kénitra", "Témara": "Rabat-Salé-Kénitra",
  "Tamesna": "Rabat-Salé-Kénitra", "Sidi Kacem": "Rabat-Salé-Kénitra",
  "Tanger": "Tanger-Tétouan-Al Hoceima", "Tétouan": "Tanger-Tétouan-Al Hoceima",
  "Al Hoceima": "Tanger-Tétouan-Al Hoceima", "Larache": "Tanger-Tétouan-Al Hoceima",
  "Fès": "Fès-Meknès", "Meknès": "Fès-Meknès", "Sefrou": "Fès-Meknès",
  "Ifrane": "Fès-Meknès", "Taza": "Fès-Meknès",
  "Marrakech": "Marrakech-Safi", "Safi": "Marrakech-Safi",
  "El Kelâa des Sraghna": "Marrakech-Safi", "Essaouira": "Marrakech-Safi",
  "Agadir": "Souss-Massa", "Ait melloul": "Souss-Massa",
  "Tiznit": "Souss-Massa", "Taroudant": "Souss-Massa",
  "Oulad teima": "Souss-Massa",
  "Oujda": "Oriental", "Nador": "Oriental", "Berkane": "Oriental",
  "Béni Mellal": "Béni Mellal-Khénifra", "Khénifra": "Béni Mellal-Khénifra",
  "Khouribga": "Béni Mellal-Khénifra", "Fkih Ben Salah": "Béni Mellal-Khénifra",
  "Laâyoune": "Laâyoune-Sakia El Hamra", "Dakhla": "Dakhla-Oued Ed-Dahab",
  "Errachidia": "Drâa-Tafilalet", "Ouarzazate": "Drâa-Tafilalet",
  "Guelmim": "Guelmim-Oued Noun",
}

function getRegion(city: string): string {
  for (const [key, region] of Object.entries(CITY_TO_REGION)) {
    if (city.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(city.toLowerCase())) {
      return region
    }
  }
  return "Non déterminée"
}

async function tavilySearch(query: string, tavilyKey: string): Promise<string> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: tavilyKey,
      query,
      max_results: 5,
      include_answer: true,
      search_depth: 'basic'
    })
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Tavily: ${data.message || res.statusText}`)
  const results = (data.results || []).map((r: { url: string; title: string; content: string }) =>
    `SOURCE: ${r.url}\nTITLE: ${r.title}\nCONTENT: ${r.content}`
  ).join('\n\n---\n\n')
  return (data.answer ? `SUMMARY: ${data.answer}\n\n` : '') + results
}

async function classifyOne(
  company: { code: string; name: string; city: string },
  anthropicKey: string,
  tavilyKey: string,
  supabaseUrl: string,
  supabaseKey: string
) {
  const logs: string[] = []
  const log = (m: string) => logs.push(`[${new Date().toLocaleTimeString('fr-FR')}] ${m}`)

  log(`▶ ${company.name} (${company.city})`)

  const region = getRegion(company.city)

  // 2 Tavily searches
  log(`  🔍 Search 1: ${company.name} ${company.city} Maroc`)
  const s1 = await tavilySearch(`${company.name} ${company.city} Maroc activité chimie industrie`, tavilyKey)

  log(`  🔍 Search 2: ${company.name} Maroc produits secteur`)
  const s2 = await tavilySearch(`"${company.name}" Maroc produits secteur chimique`, tavilyKey)

  log(`  ✓ Tavily done`)

  const sectorsText = Object.entries(FCP_SECTORS).map(([sector, subs]) =>
    `${sector}:\n${subs.map(s => `  - ${s}`).join('\n')}`
  ).join('\n\n')

  const client = new Anthropic({ apiKey: anthropicKey })

  const prompt = `Tu es un expert en classification d'entreprises marocaines du secteur chimique et para-chimique (FCP = Fédération des Industries Chimiques et Para-chimiques).

ENTREPRISE: "${company.name}" | Ville: ${company.city} | Région: ${region} | Maroc

DONNÉES WEB:
=== RECHERCHE 1 ===
${s1.substring(0, 2500)}

=== RECHERCHE 2 ===
${s2.substring(0, 2500)}

SECTEURS ET SOUS-ACTIVITÉS DISPONIBLES:
${sectorsText}

Basé sur ces données, classe cette entreprise.
Si l'entreprise n'appartient pas clairement à un secteur FCP, mets "Hors secteur FCP" pour activite.

Pour type_entreprise, choisis exactement une valeur parmi:
- "Fabricant" = produit/fabrique lui-même (usine, manufacture, production propre)
- "Distributeur" = revend des produits d'autres fabricants
- "Importateur" = importe et revend des produits étrangers
- "Importateur-Distributeur" = importe ET distribue
- "Fabricant-Distributeur" = fabrique ET distribue
- "Agent / Représentant" = représente des marques étrangères au Maroc
- "Prestataire de services" = services, pas de produits physiques
- "Négoce" = commerce général sans spécialisation claire

Réponds UNIQUEMENT avec ce JSON (commence directement par {):
{
  "activite": "nom exact du secteur ou Hors secteur FCP",
  "sous_activite": "sous-activité exacte ou null",
  "type_entreprise": "exactement une des valeurs ci-dessus",
  "site_web": "url ou null",
  "confiance": 0.0 à 1.0,
  "raison": "explication courte avec preuves trouvées",
  "sources": ["url1", "url2"]
}`

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }]
  })

  const text = response.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
  const j = text.indexOf('{'); const k = text.lastIndexOf('}')
  if (j === -1 || k === -1) throw new Error(`No JSON: ${text.substring(0, 80)}`)
  const result = JSON.parse(text.substring(j, k + 1))

  log(`  ✅ ${result.activite} | ${result.type_entreprise || '—'} | ${Math.round((result.confiance || 0) * 100)}%`)
  if (result.site_web) log(`  🌐 ${result.site_web}`)

  const final = {
    code: company.code, name: company.name, city: company.city, region,
    activite: result.activite, sous_activite: result.sous_activite,
    type_entreprise: result.type_entreprise,
    site_web: result.site_web, confiance: result.confiance,
    raison: result.raison, sources: result.sources
  }

  // Save to Supabase
  if (supabaseUrl && supabaseKey && !supabaseUrl.includes('your_')) {
    try {
      const sb = createClient(supabaseUrl, supabaseKey)
      await sb.from('fcp_classifications').upsert({
        ...final, updated_at: new Date().toISOString()
      }, { onConflict: 'code' })
      log(`  💾 Saved to DB`)
    } catch (e) { log(`  ⚠ DB: ${e}`) }
  }

  return { result: final, logs }
}

export async function POST(req: NextRequest) {
  const { companies, anthropicKey, tavilyKey, supabaseUrl, supabaseKey, concurrency = 5 } = await req.json()
  if (!companies?.length || !anthropicKey || !tavilyKey)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })

  const results: Record<string, unknown>[] = []
  const allLogs: string[] = []

  for (let i = 0; i < companies.length; i += concurrency) {
    const batch = companies.slice(i, i + concurrency)
    const batchResults = await Promise.all(
      batch.map((c: { code: string; name: string; city: string }) =>
        classifyOne(c, anthropicKey, tavilyKey, supabaseUrl || '', supabaseKey || '')
          .catch(e => ({
            result: { ...c, region: getRegion(c.city), activite: 'ERREUR', sous_activite: null, type_entreprise: null, site_web: null, confiance: 0, raison: e.message, sources: [] },
            logs: [`❌ ${c.name}: ${e.message}`]
          }))
      )
    )
    batchResults.forEach(r => { results.push(r.result); allLogs.push(...r.logs) })
  }

  return NextResponse.json({ results, logs: allLogs })
}
