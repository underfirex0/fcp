import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const { supabaseUrl, supabaseKey } = await req.json()
  if (!supabaseUrl || !supabaseKey)
    return NextResponse.json({ error: 'Missing keys' }, { status: 400 })
  try {
    const sb = createClient(supabaseUrl, supabaseKey)
    let all: Record<string, unknown>[] = []
    let from = 0
    const pageSize = 1000
    while (true) {
      const { data, error } = await sb
        .from('fcp_classifications')
        .select('*')
        .order('updated_at', { ascending: false })
        .range(from, from + pageSize - 1)
      if (error) throw error
      if (!data || data.length === 0) break
      all = [...all, ...data]
      if (data.length < pageSize) break
      from += pageSize
    }
    return NextResponse.json({ results: all, total: all.length })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
