// ============================================================
// MISSÃO KIDS — useSupabase.js
// Hook de integração completo com o banco de dados
//
// Instalação:
//   npm install @supabase/supabase-js
//
// Uso:
//   const { auth, family, missions, rewards } = useSupabase()
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { useState, useEffect, useCallback, useContext, createContext } from 'react'

// ─────────────────────────────────────────
// CONFIGURAÇÃO — cole suas credenciais aqui
// ou use variáveis de ambiente
// ─────────────────────────────────────────
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  || 'https://SEU_PROJETO.supabase.co'
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON || 'SUA_ANON_KEY'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  }
})

// ─────────────────────────────────────────
// CONTEXT
// ─────────────────────────────────────────
const SupabaseContext = createContext(null)

export function SupabaseProvider({ children }) {
  const value = useSupabaseInternal()
  return (
    <SupabaseContext.Provider value={value}>
      {children}
    </SupabaseContext.Provider>
  )
}

export function useSupabase() {
  const ctx = useContext(SupabaseContext)
  if (!ctx) throw new Error('useSupabase must be used inside <SupabaseProvider>')
  return ctx
}

// ─────────────────────────────────────────
// HOOK INTERNO
// ─────────────────────────────────────────
function useSupabaseInternal() {
  const [session,  setSession]  = useState(null)
  const [profile,  setProfile]  = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)

  // ── Auth listener ──────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) loadProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) loadProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  const loadProfile = async (uid) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .single()

    if (error) setError(error.message)
    else setProfile(data)
    setLoading(false)
  }

  // ════════════════════════════════════════
  // AUTH
  // ════════════════════════════════════════
  const auth = {
    /**
     * Cadastro de responsável
     * @param {string} email
     * @param {string} password
     * @param {string} displayName
     */
    signUpParent: async (email, password, displayName) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName, role: 'parent' }
        }
      })
      if (error) throw error
      return data
    },

    /**
     * Cadastro de criança com conta própria
     */
    signUpChild: async (email, password, displayName, age) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName, role: 'child', age }
        }
      })
      if (error) throw error
      return data
    },

    /**
     * Login
     */
    signIn: async (email, password) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      return data
    },

    /**
     * Logout
     */
    signOut: async () => {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    },

    /**
     * Reset de senha
     */
    resetPassword: async (email) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email)
      if (error) throw error
    },
  }

  // ════════════════════════════════════════
  // FAMÍLIA
  // ════════════════════════════════════════
  const family = {
    /**
     * Cria a família (primeiro passo do onboarding do responsável)
     */
    create: async (familyName) => {
      const { data, error } = await supabase.rpc('create_family', { p_family_name: familyName })
      if (error) throw error
      await loadProfile(session.user.id)
      return data
    },

    /**
     * Busca dados da família
     */
    get: async () => {
      if (!profile?.family_id) return null
      const { data, error } = await supabase
        .from('families')
        .select('*')
        .eq('id', profile.family_id)
        .single()
      if (error) throw error
      return data
    },

    /**
     * Lista filhos da família
     */
    getChildren: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('family_id', profile?.family_id)
        .eq('role', 'child')
        .order('display_name')
      if (error) throw error
      return data
    },

    /**
     * Adiciona criança (sem login próprio — gerenciada pelo pai)
     */
    addChild: async ({ displayName, age, avatarEmoji = '⭐' }) => {
      const { data, error } = await supabase.rpc('add_child', {
        p_display_name: displayName,
        p_age: age,
        p_avatar_emoji: avatarEmoji,
      })
      if (error) throw error
      return data
    },

    /**
     * Atualiza perfil da criança
     */
    updateChild: async (childId, updates) => {
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', childId)
        .eq('family_id', profile?.family_id)
        .select()
        .single()
      if (error) throw error
      return data
    },

    /**
     * Concede/deduz KidCoins manualmente
     */
    grantCoins: async (childId, amount, note) => {
      const { error } = await supabase.rpc('grant_parent_coins', {
        p_child_id: childId,
        p_amount: amount,
        p_note: note,
      })
      if (error) throw error
    },
  }

  // ════════════════════════════════════════
  // CATEGORIAS
  // ════════════════════════════════════════
  const categories = {
    list: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .or(`family_id.eq.${profile?.family_id},is_default.eq.true`)
        .order('name')
      if (error) throw error
      return data
    },

    create: async ({ name, emoji, color }) => {
      const { data, error } = await supabase
        .from('categories')
        .insert({ name, emoji, color, family_id: profile?.family_id })
        .select().single()
      if (error) throw error
      return data
    },
  }

  // ════════════════════════════════════════
  // MISSÕES
  // ════════════════════════════════════════
  const missions = {
    /**
     * Lista missões (filtradas por criança se role=child)
     */
    list: async (filters = {}) => {
      let query = supabase
        .from('missions')
        .select(`*, category:categories(name, emoji, color)`)
        .eq('family_id', profile?.family_id)
        .eq('is_active', true)

      if (filters.assignedTo) {
        query = query.or(`assigned_to.is.null,assigned_to.eq.${filters.assignedTo}`)
      }
      if (filters.categoryId) {
        query = query.eq('category_id', filters.categoryId)
      }

      const { data, error } = await query.order('created_at', { ascending: false })
      if (error) throw error
      return data
    },

    /**
     * Cria missão (apenas responsável)
     */
    create: async (mission) => {
      const { data, error } = await supabase
        .from('missions')
        .insert({
          ...mission,
          family_id: profile?.family_id,
          created_by: session?.user.id,
        })
        .select().single()
      if (error) throw error
      return data
    },

    /**
     * Atualiza missão
     */
    update: async (missionId, updates) => {
      const { data, error } = await supabase
        .from('missions')
        .update(updates)
        .eq('id', missionId)
        .eq('family_id', profile?.family_id)
        .select().single()
      if (error) throw error
      return data
    },

    /**
     * Desativa missão (soft delete)
     */
    remove: async (missionId) => {
      const { error } = await supabase
        .from('missions')
        .update({ is_active: false })
        .eq('id', missionId)
        .eq('family_id', profile?.family_id)
      if (error) throw error
    },

    /**
     * Aplica templates sugeridos à família
     */
    applyTemplates: async (templateIds = null) => {
      const { data, error } = await supabase.rpc('apply_mission_templates', {
        p_template_ids: templateIds,
      })
      if (error) throw error
      return data  // número de missões criadas
    },

    /**
     * Busca templates disponíveis
     */
    getTemplates: async () => {
      const { data, error } = await supabase
        .from('mission_templates')
        .select('*')
        .order('category, title')
      if (error) throw error
      return data
    },
  }

  // ════════════════════════════════════════
  // LOGS DE MISSÃO
  // ════════════════════════════════════════
  const missionLogs = {
    /**
     * Logs de hoje da criança logada
     */
    today: async (childId = null) => {
      const today = new Date().toISOString().split('T')[0]
      let query = supabase
        .from('mission_logs')
        .select(`*, mission:missions(title, emoji, coins_reward, xp_reward)`)
        .eq('family_id', profile?.family_id)
        .eq('due_date', today)

      if (childId) query = query.eq('child_id', childId)
      else if (profile?.role === 'child') query = query.eq('child_id', session?.user.id)

      const { data, error } = await query
      if (error) throw error
      return data
    },

    /**
     * Criança submete missão como concluída
     */
    submit: async ({ missionId, note, proofUrl, dueDate }) => {
      const { data, error } = await supabase.rpc('submit_mission', {
        p_mission_id: missionId,
        p_child_note: note,
        p_proof_url:  proofUrl,
        p_due_date:   dueDate || new Date().toISOString().split('T')[0],
      })
      if (error) throw error
      return data
    },

    /**
     * Responsável aprova ou rejeita
     */
    review: async ({ logId, approve, note }) => {
      const { error } = await supabase.rpc('review_mission', {
        p_log_id:  logId,
        p_approve: approve,
        p_note:    note,
      })
      if (error) throw error
      // Recarrega perfil para atualizar coins/xp
      await loadProfile(session.user.id)
    },

    /**
     * Fila de aprovações pendentes (visão do responsável)
     */
    pendingApprovals: async () => {
      const { data, error } = await supabase
        .from('pending_approvals')
        .select('*')
      if (error) throw error
      return data
    },

    /**
     * Histórico de logs (paginado)
     */
    history: async ({ childId, page = 0, limit = 20 } = {}) => {
      let query = supabase
        .from('mission_logs')
        .select(`*, mission:missions(title, emoji)`)
        .eq('family_id', profile?.family_id)
        .order('created_at', { ascending: false })
        .range(page * limit, (page + 1) * limit - 1)

      if (childId) query = query.eq('child_id', childId)
      else if (profile?.role === 'child') query = query.eq('child_id', session?.user.id)

      const { data, error } = await query
      if (error) throw error
      return data
    },
  }

  // ════════════════════════════════════════
  // RECOMPENSAS
  // ════════════════════════════════════════
  const rewards = {
    list: async () => {
      const { data, error } = await supabase
        .from('rewards')
        .select('*')
        .eq('family_id', profile?.family_id)
        .eq('is_active', true)
        .order('coin_cost')
      if (error) throw error
      return data
    },

    create: async (reward) => {
      const { data, error } = await supabase
        .from('rewards')
        .insert({
          ...reward,
          family_id: profile?.family_id,
          created_by: session?.user.id,
        })
        .select().single()
      if (error) throw error
      return data
    },

    update: async (rewardId, updates) => {
      const { data, error } = await supabase
        .from('rewards')
        .update(updates)
        .eq('id', rewardId)
        .select().single()
      if (error) throw error
      return data
    },

    remove: async (rewardId) => {
      const { error } = await supabase
        .from('rewards')
        .update({ is_active: false })
        .eq('id', rewardId)
      if (error) throw error
    },

    /**
     * Criança resgata recompensa
     */
    redeem: async (rewardId) => {
      const { data, error } = await supabase.rpc('redeem_reward', { p_reward_id: rewardId })
      if (error) throw error
      await loadProfile(session.user.id)
      return data
    },

    /**
     * Histórico de resgates
     */
    redemptions: async (childId = null) => {
      let query = supabase
        .from('reward_redemptions')
        .select(`*, reward:rewards(title, emoji)`)
        .eq('family_id', profile?.family_id)
        .order('redeemed_at', { ascending: false })

      if (childId) query = query.eq('child_id', childId)
      else if (profile?.role === 'child') query = query.eq('child_id', session?.user.id)

      const { data, error } = await query
      if (error) throw error
      return data
    },

    /**
     * Responsável confirma entrega da recompensa
     */
    deliver: async (redemptionId) => {
      const { error } = await supabase
        .from('reward_redemptions')
        .update({ status: 'redeemed', delivered_at: new Date().toISOString(), delivered_by: session?.user.id })
        .eq('id', redemptionId)
      if (error) throw error
    },
  }

  // ════════════════════════════════════════
  // CONQUISTAS
  // ════════════════════════════════════════
  const achievements = {
    /**
     * Lista conquistas com status de desbloqueio
     */
    list: async (childId = null) => {
      const cid = childId || session?.user.id
      const { data: all, error: e1 } = await supabase
        .from('achievements').select('*').order('condition_val')
      if (e1) throw e1

      const { data: earned, error: e2 } = await supabase
        .from('child_achievements')
        .select('achievement_id, earned_at')
        .eq('child_id', cid)
      if (e2) throw e2

      const earnedSet = new Map(earned.map(e => [e.achievement_id, e.earned_at]))
      return all.map(a => ({
        ...a,
        earned: earnedSet.has(a.id),
        earned_at: earnedSet.get(a.id) || null,
      }))
    },
  }

  // ════════════════════════════════════════
  // DASHBOARD
  // ════════════════════════════════════════
  const dashboard = {
    /**
     * Dados consolidados da criança (usa a view)
     */
    child: async () => {
      const { data, error } = await supabase
        .from('dashboard_child')
        .select('*')
        .single()
      if (error) throw error
      return data
    },

    /**
     * Resumo semanal de uma criança
     */
    weeklySummary: async (childId) => {
      const weekStart = getWeekStart()
      const { data, error } = await supabase
        .from('weekly_summaries')
        .select('*')
        .eq('child_id', childId)
        .eq('week_start', weekStart)
        .single()
      if (error && error.code !== 'PGRST116') throw error
      return data
    },

    /**
     * Histórico de transações de KidCoins
     */
    coinHistory: async (childId = null, limit = 30) => {
      let query = supabase
        .from('coin_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (childId) query = query.eq('child_id', childId)
      else query = query.eq('child_id', session?.user.id)

      const { data, error } = await query
      if (error) throw error
      return data
    },
  }

  // ════════════════════════════════════════
  // REALTIME — subscriptions
  // ════════════════════════════════════════
  const realtime = {
    /**
     * Escuta novas aprovações pendentes (para o responsável)
     * @param {function} callback - fn(payload)
     * @returns unsubscribe function
     */
    onPendingMission: (callback) => {
      const channel = supabase
        .channel('pending-missions')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'mission_logs',
          filter: `family_id=eq.${profile?.family_id}`,
        }, callback)
        .subscribe()

      return () => supabase.removeChannel(channel)
    },

    /**
     * Escuta aprovação de uma missão (para a criança)
     * @param {string} childId
     * @param {function} callback
     */
    onMissionApproved: (childId, callback) => {
      const channel = supabase
        .channel(`mission-approved-${childId}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'mission_logs',
          filter: `child_id=eq.${childId}`,
        }, (payload) => {
          if (payload.new.status === 'approved') callback(payload)
        })
        .subscribe()

      return () => supabase.removeChannel(channel)
    },
  }

  // ─────────────────────────────────────────
  return {
    // Estado
    session,
    profile,
    loading,
    error,
    isParent: profile?.role === 'parent',
    isChild:  profile?.role === 'child',
    isAuthenticated: !!session,

    // Módulos
    auth,
    family,
    categories,
    missions,
    missionLogs,
    rewards,
    achievements,
    dashboard,
    realtime,

    // Utilitários
    refreshProfile: () => session && loadProfile(session.user.id),
  }
}

// ─────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────
function getWeekStart(date = new Date()) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // segunda-feira
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

// ─────────────────────────────────────────
// EXEMPLO DE USO NO APP
// ─────────────────────────────────────────
/*
// main.jsx
import { SupabaseProvider } from './useSupabase'

ReactDOM.createRoot(document.getElementById('root')).render(
  <SupabaseProvider>
    <App />
  </SupabaseProvider>
)

// Em qualquer componente:
import { useSupabase } from './useSupabase'

function MissionsScreen() {
  const { missions, missionLogs, profile } = useSupabase()
  const [items, setItems] = useState([])

  useEffect(() => {
    missions.list({ assignedTo: profile?.id }).then(setItems)
  }, [])

  const handleSubmit = async (missionId) => {
    await missionLogs.submit({ missionId })
    // atualiza lista...
  }
}

// Responsável aprovando:
function PendingScreen() {
  const { missionLogs } = useSupabase()
  const [pending, setPending] = useState([])

  useEffect(() => {
    missionLogs.pendingApprovals().then(setPending)
  }, [])

  const approve = async (logId) => {
    await missionLogs.review({ logId, approve: true, note: 'Ótimo trabalho!' })
    setPending(p => p.filter(x => x.log_id !== logId))
  }
}
*/
